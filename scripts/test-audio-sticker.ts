import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { proto } from "@whiskeysockets/baileys";
import {
  AUDIO_STICKER_MIME,
  AudioStickerError,
  attachAudioToStickerMessage,
  extractAudioStickerFromVideo,
  installAudioStickerEncoderPatch,
} from "../src/services/audio-sticker.service.js";

interface WireField {
  field: number;
  wireType: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

function readVarint(buf: Uint8Array, offset: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length && shift <= 63n) {
    const b = buf[pos++];
    value |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: pos };
    shift += 7n;
  }
  throw new Error("Varint truncado");
}

function readWireFields(buf: Uint8Array): WireField[] {
  const out: WireField[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.next;
    const tagNum = Number(tag.value);
    const field = tagNum >>> 3;
    const wireType = tagNum & 7;
    if (wireType === 0) {
      const val = readVarint(buf, pos);
      pos = val.next;
      out.push({ field, wireType, varint: val.value });
    } else if (wireType === 2) {
      const len = readVarint(buf, pos);
      pos = len.next;
      const n = Number(len.value);
      out.push({ field, wireType, bytes: buf.subarray(pos, pos + n) });
      pos += n;
    } else if (wireType === 1) {
      out.push({ field, wireType, bytes: buf.subarray(pos, pos + 8) });
      pos += 8;
    } else if (wireType === 5) {
      out.push({ field, wireType, bytes: buf.subarray(pos, pos + 4) });
      pos += 4;
    } else {
      throw new Error(`Wire type no soportado: ${wireType}`);
    }
  }
  return out;
}

function generateTestVideo(withAudio: boolean): Buffer {
  const outPath = path.join(os.tmpdir(), `empy_sa_test_${Date.now()}_${withAudio ? "av" : "v"}.mp4`);
  try {
    const args = withAudio
      ? [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=320x240:rate=15:duration=3",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=3",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          outPath,
        ]
      : [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=320x240:rate=15:duration=2",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-an",
          outPath,
        ];
    execFileSync(ffmpegInstaller.path, args, { windowsHide: true });
    return fs.readFileSync(outPath);
  } finally {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  }
}

async function runTests(): Promise<void> {
  console.log("1. Probando extracción FFmpeg (video con audio -> WebP + OGG/Opus)...");
  const avVideo = generateTestVideo(true);
  const prepared = await extractAudioStickerFromVideo(avVideo, 3);

  assert.equal(prepared.webpBuffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(prepared.webpBuffer.toString("ascii", 8, 12), "WEBP");
  assert.ok(prepared.webpBuffer.includes(Buffer.from("EXIF")), "El WebP debe incluir chunk EXIF");
  assert.ok(prepared.webpBuffer.length <= 500 * 1024, "El WebP debe pesar <= 500 KB");

  assert.equal(prepared.audioBuffer.toString("ascii", 0, 4), "OggS");
  assert.ok(prepared.audioBuffer.length > 0 && prepared.audioBuffer.length <= 900 * 1024);
  assert.equal(prepared.seconds, 3);
  console.log(
    `   OK: WebP=${(prepared.webpBuffer.length / 1024).toFixed(1)}KB, OGG=${(prepared.audioBuffer.length / 1024).toFixed(1)}KB, dur=${prepared.seconds}s`
  );

  console.log("2. Probando rechazo de video sin audio...");
  const silentVideo = generateTestVideo(false);
  let gotNoAudio = false;
  try {
    await extractAudioStickerFromVideo(silentVideo, 2);
  } catch (err) {
    if (err instanceof AudioStickerError && err.code === "NO_AUDIO_TRACK") {
      gotNoAudio = true;
    } else {
      throw err;
    }
  }
  assert.equal(gotNoAudio, true, "Debe lanzar AudioStickerError(NO_AUDIO_TRACK)");
  console.log("   OK: video mudo rechazado con NO_AUDIO_TRACK");

  console.log("3. Probando codificación protobuf (field 134 -> 1 -> 26 -> 24/25/26)...");
  installAudioStickerEncoderPatch();

  const stickerMsg = proto.Message.StickerMessage.create({
    url: "https://mmg.whatsapp.net/o1/v/t24/sticker.enc",
    directPath: "/o1/v/t24/sticker.enc",
    mimetype: "image/webp",
    isAnimated: true,
    width: 512,
    height: 512,
    fileLength: prepared.webpBuffer.length,
    mediaKey: crypto.randomBytes(32),
    fileSha256: crypto.randomBytes(32),
    fileEncSha256: crypto.randomBytes(32),
  });

  const audioMsg = proto.Message.AudioMessage.create({
    url: "https://mmg.whatsapp.net/o1/v/t24/audio.enc",
    directPath: "/o1/v/t24/audio.enc",
    mimetype: AUDIO_STICKER_MIME,
    ptt: false,
    seconds: prepared.seconds,
    fileLength: prepared.audioBuffer.length,
    mediaKey: crypto.randomBytes(32),
    fileSha256: crypto.randomBytes(32),
    fileEncSha256: crypto.randomBytes(32),
  });

  attachAudioToStickerMessage(stickerMsg, audioMsg, "🔊");

  const outer = proto.Message.create({
    stickerMessage: stickerMsg,
    messageContextInfo: {
      messageSecret: crypto.randomBytes(32),
    },
  });

  const verifyEncodedSoundSticker = (encoded: Uint8Array, label: string) => {
    const topFields = readWireFields(encoded);
    assert.ok(
      !topFields.some((f) => f.field === 26),
      `${label}: no debe llevar stickerMessage suelto en top-level`
    );
    const f134 = topFields.find((f) => f.field === 134 && f.wireType === 2 && f.bytes);
    assert.ok(f134?.bytes, `${label}: debe tener field 134 (audioStickerMessage)`);

    const fpmFields = readWireFields(f134.bytes);
    const f1 = fpmFields.find((f) => f.field === 1 && f.wireType === 2 && f.bytes);
    assert.ok(f1?.bytes, `${label}: field 134 debe contener field 1 (Message)`);

    const innerMsgFields = readWireFields(f1.bytes);
    const f26 = innerMsgFields.find((f) => f.field === 26 && f.wireType === 2 && f.bytes);
    assert.ok(f26?.bytes, `${label}: inner Message debe contener field 26 (StickerMessage)`);

    const stickerFields = readWireFields(f26.bytes);
    const decodedSticker = proto.Message.StickerMessage.decode(f26.bytes);
    assert.equal(decodedSticker.mimetype, "image/webp");
    assert.equal(decodedSticker.isAnimated, true);

    const f24 = stickerFields.find((f) => f.field === 24 && f.wireType === 0);
    assert.equal(f24?.varint, 0n, `${label}: StickerMessage.24 (premium) debe ser 0`);

    const f25 = stickerFields.find((f) => f.field === 25 && f.wireType === 2 && f.bytes);
    assert.equal(Buffer.from(f25!.bytes!).toString("utf8"), "🔊");

    const audioField = stickerFields.find((f) => f.field === 26 && f.wireType === 2 && f.bytes);
    assert.ok(audioField?.bytes, `${label}: StickerMessage debe contener field 26 (AudioMessage)`);

    const decodedAudio = proto.Message.AudioMessage.decode(audioField.bytes);
    assert.equal(decodedAudio.mimetype, AUDIO_STICKER_MIME);
    assert.equal(decodedAudio.ptt, false);
    assert.equal(decodedAudio.seconds, 3);
  };

  // Top-level encode
  const topBytes = proto.Message.encode(outer).finish();
  verifyEncodedSoundSticker(topBytes, "TopLevel");
  const topFields = readWireFields(topBytes);
  assert.ok(
    topFields.some((f) => f.field === 35),
    "TopLevel debe conservar messageContextInfo (field 35)"
  );

  // DeviceSentMessage nested encode (usa writer externo)
  const dsm = proto.Message.create({
    deviceSentMessage: {
      destinationJid: "123456@g.us",
      message: outer,
    },
  });
  const dsmBytes = proto.Message.encode(dsm).finish();
  const dsmFields = readWireFields(dsmBytes);
  const f31 = dsmFields.find((f) => f.field === 31 && f.wireType === 2 && f.bytes);
  assert.ok(f31?.bytes, "DeviceSentMessage debe estar en field 31");
  const dsmInner = readWireFields(f31.bytes).find((f) => f.field === 2 && f.wireType === 2 && f.bytes);
  assert.ok(dsmInner?.bytes, "DeviceSentMessage.message debe estar en field 2");
  verifyEncodedSoundSticker(dsmInner.bytes, "DeviceSentMessage");

  // Sticker normal sin parchear no se altera
  const plainSticker = proto.Message.create({
    stickerMessage: { mimetype: "image/webp", isAnimated: false },
  });
  const plainBytes = proto.Message.encode(plainSticker).finish();
  const plainFields = readWireFields(plainBytes);
  assert.ok(plainFields.some((f) => f.field === 26), "Sticker normal mantiene field 26");
  assert.ok(!plainFields.some((f) => f.field === 134), "Sticker normal no agrega field 134");

  console.log("   OK: TopLevel, DeviceSentMessage y sticker normal verificados byte a byte.");
  console.log("✅ Todos los tests de audio-sticker pasaron.");
}

runTests().catch((err) => {
  console.error("❌ Test fallido:", err);
  process.exit(1);
});
