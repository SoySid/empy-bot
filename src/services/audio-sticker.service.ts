import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import {
  WASocket,
  generateMessageIDV2,
  prepareWAMessageMedia,
  proto,
} from "@whiskeysockets/baileys";

const execFileAsync = promisify(execFile);

export const AUDIO_STICKER_MAX_DURATION_SEC = 10;
export const AUDIO_STICKER_MAX_SOURCE_SEC = 60;
export const AUDIO_STICKER_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const AUDIO_STICKER_MIME = "audio/ogg; codecs=opus";

const MAX_WEBP_BYTES = 500 * 1024;
const MAX_AUDIO_BYTES = 900 * 1024;
const TEMP_DIR = path.resolve(process.cwd(), "temp");
const DEFAULT_EMOJI = "🔊";

export type AudioStickerErrorCode =
  | "NO_AUDIO_TRACK"
  | "VIDEO_TOO_LARGE"
  | "AUDIO_TOO_LARGE"
  | "PROCESSING_FAILED";

export class AudioStickerError extends Error {
  constructor(
    public readonly code: AudioStickerErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AudioStickerError";
  }
}

export interface PreparedAudioSticker {
  webpBuffer: Buffer;
  audioBuffer: Buffer;
  seconds: number;
}

interface AudioStickerAttachment {
  audioMessage: proto.Message.IAudioMessage;
  emoji: string;
}

const pendingAudioBySticker = new WeakMap<object, AudioStickerAttachment>();
let encoderPatchInstalled = false;

/**
 * Parchea proto.Message.encode en runtime para emitir el envelope nativo de WhatsApp:
 *   Message.134 (FutureProofMessage) -> 1 (Message) -> 26 (StickerMessage + 24:0 + 25:emoji + 26:AudioMessage)
 * manteniendo el stickerMessage en el objeto JS para que Baileys marque mediatype="sticker".
 */
export function installAudioStickerEncoderPatch(): void {
  if (encoderPatchInstalled) return;
  encoderPatchInstalled = true;

  const originalEncode = proto.Message.encode.bind(proto.Message);

  proto.Message.encode = function patchedMessageEncode(
    message: proto.IMessage,
    writer?: any
  ) {
    const stickerRef = message?.stickerMessage;
    const attachment =
      stickerRef && typeof stickerRef === "object"
        ? pendingAudioBySticker.get(stickerRef)
        : undefined;

    if (!attachment || !stickerRef) {
      return originalEncode(message, writer);
    }

    const rest: Record<string, unknown> = {};
    for (const key of Object.keys(message)) {
      if (key !== "stickerMessage") {
        rest[key] = (message as Record<string, unknown>)[key];
      }
    }

    const w = originalEncode(rest as proto.IMessage, writer);

    // field 134 (wireType 2) = 1074 -> FutureProofMessage
    const fpmWriter = w.uint32((134 << 3) | 2).fork();
    // field 1 (wireType 2) = 10 -> FutureProofMessage.message
    const innerMsgWriter = fpmWriter.uint32((1 << 3) | 2).fork();
    // field 26 (wireType 2) = 210 -> Message.stickerMessage
    const stickerWriter = innerMsgWriter.uint32((26 << 3) | 2).fork();

    proto.Message.StickerMessage.encode(stickerRef, stickerWriter);
    // StickerMessage.premium = 24 (varint 0)
    stickerWriter.uint32((24 << 3) | 0).int32(0);
    // StickerMessage.emojis = 25 (string UTF-8)
    if (attachment.emoji) {
      stickerWriter.uint32((25 << 3) | 2).string(attachment.emoji);
    }
    // StickerMessage.audioMessage = 26 (AudioMessage)
    proto.Message.AudioMessage.encode(
      attachment.audioMessage,
      stickerWriter.uint32((26 << 3) | 2).fork()
    ).ldelim();

    stickerWriter.ldelim();
    innerMsgWriter.ldelim();
    fpmWriter.ldelim();

    return w;
  } as typeof proto.Message.encode;
}

export function attachAudioToStickerMessage(
  stickerMessage: proto.Message.IStickerMessage,
  audioMessage: proto.Message.IAudioMessage,
  emoji = DEFAULT_EMOJI
): void {
  installAudioStickerEncoderPatch();
  pendingAudioBySticker.set(stickerMessage, { audioMessage, emoji });
}

function buildWhatsAppExif(packName: string, publisher: string, emojis: string[]): Buffer {
  const payload = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": "com.empybot.soundstickers",
      "sticker-pack-name": packName,
      "sticker-pack-publisher": publisher,
      emojis,
    }),
    "utf8"
  );

  const tiffHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  tiffHeader.writeUInt32LE(payload.length, 14);
  return Buffer.concat([tiffHeader, payload]);
}

export function injectWebpExif(
  webp: Buffer,
  packName = "Empy-Bot",
  publisher = "Empy Sound",
  emojis: string[] = [DEFAULT_EMOJI]
): Buffer {
  if (
    webp.length < 12 ||
    webp.toString("ascii", 0, 4) !== "RIFF" ||
    webp.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return webp;
  }

  const chunks: Buffer[] = [];
  let offset = 12;
  let vp8xIndex = -1;

  while (offset + 8 <= webp.length) {
    const fourCC = webp.toString("ascii", offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    const paddedEnd = Math.min(webp.length, offset + 8 + size + (size & 1));

    if (fourCC !== "EXIF") {
      if (fourCC === "VP8X") {
        vp8xIndex = chunks.length;
      }
      chunks.push(Buffer.from(webp.subarray(offset, paddedEnd)));
    }
    offset = paddedEnd;
  }

  if (vp8xIndex === -1) {
    const vp8x = Buffer.alloc(18);
    vp8x.write("VP8X", 0, 4, "ascii");
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x08;
    vp8x.writeUIntLE(511, 12, 3);
    vp8x.writeUIntLE(511, 15, 3);
    chunks.unshift(vp8x);
  } else {
    chunks[vp8xIndex][8] |= 0x08;
  }

  const exifData = buildWhatsAppExif(packName, publisher, emojis);
  const exifHeader = Buffer.alloc(8);
  exifHeader.write("EXIF", 0, 4, "ascii");
  exifHeader.writeUInt32LE(exifData.length, 4);
  const padding = exifData.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
  chunks.push(Buffer.concat([exifHeader, exifData, padding]));

  const body = Buffer.concat(chunks);
  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0, 4, "ascii");
  riffHeader.writeUInt32LE(4 + body.length, 4);
  riffHeader.write("WEBP", 8, 4, "ascii");
  return Buffer.concat([riffHeader, body]);
}

async function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(ffmpegInstaller.path, ["-y", "-hide_banner", ...args], {
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    await execFileAsync(ffmpegInstaller.path, ["-hide_banner", "-i", filePath], {
      windowsHide: true,
      timeout: 15_000,
    });
  } catch (err: any) {
    const stderr = String(err?.stderr || "");
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const secs = Number(match[3]);
      const total = hours * 3600 + minutes * 60 + secs;
      if (Number.isFinite(total) && total > 0) {
        return total;
      }
    }
  }
  return null;
}

async function encodeAnimatedWebp(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  fps: number,
  quality: number
): Promise<Buffer> {
  await runFfmpeg([
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-t",
    String(durationSec),
    "-vf",
    `scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=${fps},setsar=1`,
    "-loop",
    "0",
    "-an",
    "-vcodec",
    "libwebp",
    "-compression_level",
    "4",
    "-q:v",
    String(quality),
    outputPath,
  ]);
  return fs.promises.readFile(outputPath);
}

async function encodeOggOpus(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  bitrate: string
): Promise<Buffer> {
  try {
    await runFfmpeg([
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-t",
      String(durationSec),
      "-vn",
      "-map",
      "0:a:0",
      "-c:a",
      "libopus",
      "-b:a",
      bitrate,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-application",
      "audio",
      outputPath,
    ]);
  } catch (err: any) {
    const stderr = String(err?.stderr || err?.message || "");
    if (
      /matches no streams/i.test(stderr) ||
      /does not contain any stream/i.test(stderr) ||
      /Invalid argument/i.test(stderr)
    ) {
      throw new AudioStickerError(
        "NO_AUDIO_TRACK",
        "El video no tiene pista de audio."
      );
    }
    throw err;
  }

  const buf = await fs.promises.readFile(outputPath);
  if (buf.length === 0) {
    throw new AudioStickerError("NO_AUDIO_TRACK", "El video no tiene pista de audio.");
  }
  return buf;
}

export async function extractAudioStickerFromVideo(
  videoBuffer: Buffer,
  hintSeconds?: number
): Promise<PreparedAudioSticker> {
  if (videoBuffer.length > AUDIO_STICKER_MAX_SOURCE_BYTES) {
    throw new AudioStickerError(
      "VIDEO_TOO_LARGE",
      "El video supera el límite de 20 MB."
    );
  }

  await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  const tempId = crypto.randomBytes(6).toString("hex");
  const inputPath = path.join(TEMP_DIR, `sa_${tempId}_in.mp4`);
  const webpPath = path.join(TEMP_DIR, `sa_${tempId}_out.webp`);
  const oggPath = path.join(TEMP_DIR, `sa_${tempId}_out.ogg`);

  const cleanup = async () => {
    for (const file of [inputPath, webpPath, oggPath]) {
      try {
        if (fs.existsSync(file)) await fs.promises.unlink(file);
      } catch {}
    }
  };

  try {
    await fs.promises.writeFile(inputPath, videoBuffer);

    let audioBuffer = await encodeOggOpus(
      inputPath,
      oggPath,
      AUDIO_STICKER_MAX_DURATION_SEC,
      "48k"
    );

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      audioBuffer = await encodeOggOpus(
        inputPath,
        oggPath,
        AUDIO_STICKER_MAX_DURATION_SEC,
        "24k"
      );
    }

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      throw new AudioStickerError(
        "AUDIO_TOO_LARGE",
        "El audio resultó demasiado pesado para WhatsApp."
      );
    }

    const probedDuration = await probeDurationSeconds(oggPath);
    const rawDuration = probedDuration ?? hintSeconds ?? AUDIO_STICKER_MAX_DURATION_SEC;
    const clampedDuration = Math.max(
      1,
      Math.min(AUDIO_STICKER_MAX_DURATION_SEC, Math.round(rawDuration))
    );

    let webpBuffer = await encodeAnimatedWebp(inputPath, webpPath, clampedDuration, 12, 45);
    if (webpBuffer.length > MAX_WEBP_BYTES) {
      webpBuffer = await encodeAnimatedWebp(
        inputPath,
        webpPath,
        Math.min(clampedDuration, 6),
        8,
        28
      );
    }

    const webpWithExif = injectWebpExif(webpBuffer);

    return {
      webpBuffer: webpWithExif,
      audioBuffer,
      seconds: clampedDuration,
    };
  } finally {
    await cleanup();
  }
}

export async function sendAudioSticker(
  sock: WASocket,
  remoteJid: string,
  payload: PreparedAudioSticker,
  quoted?: proto.IWebMessageInfo
): Promise<string> {
  installAudioStickerEncoderPatch();

  const upload = sock.waUploadToServer;
  const [prepSticker, prepAudio] = await Promise.all([
    prepareWAMessageMedia({ sticker: payload.webpBuffer }, { upload }),
    prepareWAMessageMedia(
      {
        audio: payload.audioBuffer,
        mimetype: AUDIO_STICKER_MIME,
        ptt: false,
      },
      { upload }
    ),
  ]);

  const stickerMessage = prepSticker.stickerMessage;
  const audioMessage = prepAudio.audioMessage;

  if (!stickerMessage || !audioMessage) {
    throw new AudioStickerError(
      "PROCESSING_FAILED",
      "No se pudieron subir los recursos multimedia a WhatsApp."
    );
  }

  stickerMessage.mimetype = "image/webp";
  stickerMessage.isAnimated = true;
  stickerMessage.width = 512;
  stickerMessage.height = 512;

  audioMessage.mimetype = AUDIO_STICKER_MIME;
  audioMessage.ptt = false;
  audioMessage.seconds = payload.seconds;

  if (quoted?.key?.id) {
    stickerMessage.contextInfo = {
      stanzaId: quoted.key.id,
      participant: quoted.key.participant || undefined,
      quotedMessage: quoted.message || undefined,
    };
  }

  attachAudioToStickerMessage(stickerMessage, audioMessage, DEFAULT_EMOJI);

  const outerMessage = proto.Message.create({
    stickerMessage,
    messageContextInfo: {
      messageSecret: crypto.randomBytes(32),
    },
  });

  const messageId = generateMessageIDV2(sock.user?.id);
  await sock.relayMessage(remoteJid, outerMessage, { messageId });
  return messageId;
}
