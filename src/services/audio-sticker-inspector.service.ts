import { proto } from "@whiskeysockets/baileys";

interface WireField {
  field: number;
  wireType: number;
  varint?: string;
  bytes?: Uint8Array;
}

function readVarint(buf: Uint8Array, offset: number): { value: bigint; next: number } | null {
  let value = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length && shift <= 63n) {
    const b = buf[pos++];
    value |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value, next: pos };
    }
    shift += 7n;
  }
  return null;
}

function readWireFields(buf: Uint8Array): WireField[] | null {
  const fields: WireField[] = [];
  let pos = 0;

  while (pos < buf.length) {
    const tagRes = readVarint(buf, pos);
    if (!tagRes) return null;
    pos = tagRes.next;

    const tagNum = Number(tagRes.value);
    const field = tagNum >>> 3;
    const wireType = tagNum & 7;
    if (field <= 0) return null;

    if (wireType === 0) {
      const valRes = readVarint(buf, pos);
      if (!valRes) return null;
      pos = valRes.next;
      fields.push({ field, wireType, varint: valRes.value.toString() });
    } else if (wireType === 1) {
      if (pos + 8 > buf.length) return null;
      fields.push({ field, wireType, bytes: buf.subarray(pos, pos + 8) });
      pos += 8;
    } else if (wireType === 2) {
      const lenRes = readVarint(buf, pos);
      if (!lenRes) return null;
      pos = lenRes.next;
      const len = Number(lenRes.value);
      if (len < 0 || pos + len > buf.length) return null;
      fields.push({ field, wireType, bytes: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (wireType === 5) {
      if (pos + 4 > buf.length) return null;
      fields.push({ field, wireType, bytes: buf.subarray(pos, pos + 4) });
      pos += 4;
    } else {
      return null;
    }
  }

  return fields;
}

function summarizeWireFields(fields: WireField[]) {
  return fields.map((f) => ({
    f: f.field,
    wt: f.wireType,
    ...(f.varint !== undefined ? { v: f.varint } : {}),
    ...(f.bytes !== undefined ? { len: f.bytes.byteLength } : {}),
  }));
}

function safeHost(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function inspectStickerPayload(stickerBytes: Uint8Array, wrapperPath: string[]): void {
  const rawFields = readWireFields(stickerBytes);
  if (!rawFields) return;

  const decodedSticker = proto.Message.StickerMessage.decode(stickerBytes);
  const f24 = rawFields.find((f) => f.field === 24);
  const f25 = rawFields.find((f) => f.field === 25);
  const f26 = rawFields.find((f) => f.field === 26 && f.wireType === 2 && f.bytes);
  const extraFields = rawFields.filter((f) => f.field >= 23);

  let audioReport: Record<string, unknown> | null = null;
  if (f26?.bytes) {
    const audioRaw = readWireFields(f26.bytes);
    const decodedAudio = proto.Message.AudioMessage.decode(f26.bytes);
    audioReport = {
      wireFields: audioRaw ? summarizeWireFields(audioRaw) : null,
      mimetype: decodedAudio.mimetype ?? null,
      seconds: decodedAudio.seconds ?? null,
      ptt: decodedAudio.ptt ?? null,
      fileLength: decodedAudio.fileLength ? decodedAudio.fileLength.toString() : null,
      urlHost: safeHost(decodedAudio.url),
      hasDirectPath: Boolean(decodedAudio.directPath),
      directPathLen: decodedAudio.directPath?.length ?? 0,
      hasMediaKey: Boolean(decodedAudio.mediaKey?.length),
      mediaKeyLen: decodedAudio.mediaKey?.length ?? 0,
      hasFileSha256: Boolean(decodedAudio.fileSha256?.length),
      hasFileEncSha256: Boolean(decodedAudio.fileEncSha256?.length),
      hasStreamingSidecar: Boolean(decodedAudio.streamingSidecar?.length),
      streamingSidecarLen: decodedAudio.streamingSidecar?.length ?? 0,
      hasWaveform: Boolean(decodedAudio.waveform?.length),
      waveformLen: decodedAudio.waveform?.length ?? 0,
      backgroundArgb: decodedAudio.backgroundArgb ?? null,
      viewOnce: decodedAudio.viewOnce ?? null,
      hasContextInfo: Boolean(decodedAudio.contextInfo),
    };
  }

  let emojisUtf8: string | null = null;
  if (f25?.bytes) {
    try {
      emojisUtf8 = Buffer.from(f25.bytes).toString("utf8");
    } catch {}
  }

  const report = {
    ts: new Date().toISOString(),
    wrapperPath,
    stickerWireFields: summarizeWireFields(rawFields),
    extraFieldsGe23: summarizeWireFields(extraFields),
    stickerMeta: {
      mimetype: decodedSticker.mimetype ?? null,
      width: decodedSticker.width ?? null,
      height: decodedSticker.height ?? null,
      fileLength: decodedSticker.fileLength ? decodedSticker.fileLength.toString() : null,
      isAnimated: decodedSticker.isAnimated ?? null,
      isLottie: decodedSticker.isLottie ?? null,
      isAvatar: decodedSticker.isAvatar ?? null,
      isAiSticker: decodedSticker.isAiSticker ?? null,
      accessibilityLabel: decodedSticker.accessibilityLabel ?? null,
      urlHost: safeHost(decodedSticker.url),
      hasDirectPath: Boolean(decodedSticker.directPath),
      hasMediaKey: Boolean(decodedSticker.mediaKey?.length),
      firstFrameLength: decodedSticker.firstFrameLength ?? null,
      hasFirstFrameSidecar: Boolean(decodedSticker.firstFrameSidecar?.length),
      hasPngThumbnail: Boolean(decodedSticker.pngThumbnail?.length),
      hasContextInfo: Boolean(decodedSticker.contextInfo),
      field24Premium: f24?.varint ?? null,
      field25Emojis: emojisUtf8,
    },
    audioMessage: audioReport,
  };

  console.log(`[AUDIO_STICKER_INSPECT] ${JSON.stringify(report)}`);
}

function scanMessageBytes(buf: Uint8Array, path: string[], depth = 0): void {
  if (depth > 4) return;
  const fields = readWireFields(buf);
  if (!fields) return;

  for (const f of fields) {
    if (f.wireType !== 2 || !f.bytes) continue;

    if (f.field === 134) {
      const outer = readWireFields(f.bytes);
      const innerMsgField = outer?.find((x) => x.field === 1 && x.wireType === 2 && x.bytes);
      if (innerMsgField?.bytes) {
        const innerFields = readWireFields(innerMsgField.bytes);
        const stickerField = innerFields?.find((x) => x.field === 26 && x.wireType === 2 && x.bytes);
        if (stickerField?.bytes) {
          inspectStickerPayload(stickerField.bytes, [...path, "134(audioStickerMessage)", "1(message)", "26(stickerMessage)"]);
        } else {
          console.log(
            `[AUDIO_STICKER_INSPECT] ${JSON.stringify({
              ts: new Date().toISOString(),
              wrapperPath: [...path, "134(audioStickerMessage)"],
              outerFields: outer ? summarizeWireFields(outer) : null,
              innerFields: innerFields ? summarizeWireFields(innerFields) : null,
            })}`
          );
        }
      }
    } else if (f.field === 26) {
      const stickerRaw = readWireFields(f.bytes);
      const hasAudioOrNewField = stickerRaw?.some((x) => x.field === 26);
      if (hasAudioOrNewField) {
        inspectStickerPayload(f.bytes, [...path, "26(stickerMessage)"]);
      }
    } else if (f.field === 31) {
      const dsm = readWireFields(f.bytes);
      const inner = dsm?.find((x) => x.field === 2 && x.wireType === 2 && x.bytes);
      if (inner?.bytes) {
        scanMessageBytes(inner.bytes, [...path, "31(deviceSentMessage)"], depth + 1);
      }
    } else if (f.field === 40 || f.field === 55 || f.field === 59) {
      const fp = readWireFields(f.bytes);
      const inner = fp?.find((x) => x.field === 1 && x.wireType === 2 && x.bytes);
      if (inner?.bytes) {
        scanMessageBytes(inner.bytes, [...path, `${f.field}(wrapper)`], depth + 1);
      }
    }
  }
}

let installed = false;

export function installAudioStickerInspector(): void {
  if (installed) return;
  installed = true;

  const originalDecode = proto.Message.decode.bind(proto.Message);
  proto.Message.decode = function wrappedMessageDecode(reader: any, length?: number): proto.Message {
    try {
      if (reader instanceof Uint8Array && length === undefined) {
        scanMessageBytes(reader, ["Message"]);
      }
    } catch {
      // Nunca interferir con la decodificación normal de mensajes
    }
    return originalDecode(reader, length);
  } as typeof proto.Message.decode;

  console.log("[AudioStickerInspector] Activo (escuchando exclusivamente campo 134 y StickerMessage.26).");
}
