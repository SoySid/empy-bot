import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import {
  AUDIO_STICKER_MAX_DURATION_SEC,
  AUDIO_STICKER_MAX_SOURCE_BYTES,
  AUDIO_STICKER_MAX_SOURCE_SEC,
  AudioStickerError,
  PrivateMediaQueueFullError,
  extractAudioStickerFromVideo,
  runPrivateMediaTask,
  sendAudioSticker,
  unwrapMediaMessage,
} from "../services/audio-sticker.service.js";
import { modifyBalance } from "../services/economy.service.js";
import { ECONOMY_CONFIG } from "../config/economy.config.js";
import { streamToBuffer } from "../services/media.service.js";

function isViewOnce(rawMsg: any): boolean {
  if (!rawMsg) return false;

  if (
    rawMsg.viewOnceMessage ||
    rawMsg.viewOnceMessageV2 ||
    rawMsg.viewOnceMessageV2Extension
  ) {
    return true;
  }

  if (rawMsg.viewOnce === true || rawMsg.videoMessage?.viewOnce === true) {
    return true;
  }

  const inner =
    rawMsg.message ||
    rawMsg.viewOnceMessage?.message ||
    rawMsg.viewOnceMessageV2?.message ||
    rawMsg.viewOnceMessageV2Extension?.message ||
    rawMsg.videoMessage ||
    rawMsg.extendedTextMessage?.contextInfo?.quotedMessage;

  if (inner && inner !== rawMsg) {
    return isViewOnce(inner);
  }

  return false;
}

export const saCommand: Command = {
  name: "sa",
  aliases: ["stickeraudio", "audiosticker"],
  description: "Crea un sticker con sonido nativo de WhatsApp a partir de un video.",
  execute: async ({ sock, msg, remoteJid, quotedMsg, contextInfo, senderProfile }: CommandContext) => {
    const isDirectViewOnce = isViewOnce(msg) || isViewOnce(msg.message);
    const isQuotedViewOnce = isViewOnce(contextInfo?.quotedMessage) || isViewOnce(quotedMsg);

    if (isDirectViewOnce || isQuotedViewOnce) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ No hago stickers de videos de una sola vez por privacidad." },
        { quoted: msg as any }
      );
      return;
    }

    const unwrappedDirect = unwrapMediaMessage(msg.message);
    const unwrappedQuoted = unwrapMediaMessage(quotedMsg);
    const videoMsg = unwrappedDirect?.videoMessage || unwrappedQuoted?.videoMessage;
    if (!videoMsg) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ Respondé a un video o mandá uno con \`!sa\` para crear un sticker con sonido (se toman hasta ${AUDIO_STICKER_MAX_DURATION_SEC} segundos).`,
        },
        { quoted: msg as any }
      );
      return;
    }

    if (videoMsg.viewOnce === true) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ No hago stickers de videos de una sola vez por privacidad." },
        { quoted: msg as any }
      );
      return;
    }

    const sourceSeconds = Number(videoMsg.seconds || 0);
    if (sourceSeconds > AUDIO_STICKER_MAX_SOURCE_SEC) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ El video es demasiado largo (máximo ${AUDIO_STICKER_MAX_SOURCE_SEC} segundos de origen; el sticker toma los primeros ${AUDIO_STICKER_MAX_DURATION_SEC} s).`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const sourceLength = Number(videoMsg.fileLength || 0);
    if (sourceLength > AUDIO_STICKER_MAX_SOURCE_BYTES) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ El video es demasiado pesado (máximo 20 MB)." },
        { quoted: msg as any }
      );
      return;
    }

    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const balanceCheck = await modifyBalance(senderJid, -ECONOMY_CONFIG.COST_STICKER);

    if (!balanceCheck.success) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `💸 *Fondos insuficientes:* Crear un sticker con sonido cuesta *$${ECONOMY_CONFIG.COST_STICKER}* fichas (tu saldo: *$${balanceCheck.oldBalance}*).\n\n¡Tirá \`!laburar\` o consultá tu \`!diario\` para juntar fondos!`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const isPrivateChat = !remoteJid.endsWith("@g.us");
    const runTask = async () => {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });
      }

      const stream = await downloadContentFromMessage(videoMsg, "video");
      const videoBuffer = await streamToBuffer(stream, AUDIO_STICKER_MAX_SOURCE_BYTES);

      const prepared = await extractAudioStickerFromVideo(
        videoBuffer,
        sourceSeconds > 0 ? sourceSeconds : undefined
      );

      await sendAudioSticker(sock, remoteJid, prepared, msg);

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
      }
    };

    try {
      if (isPrivateChat) {
        await runPrivateMediaTask(runTask);
      } else {
        await runTask();
      }
    } catch (error) {
      await modifyBalance(senderJid, ECONOMY_CONFIG.COST_STICKER);

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⚠️", key: msg.key } });
      }

      if (error instanceof PrivateMediaQueueFullError) {
        await sock.sendMessage(
          remoteJid,
          { text: `⏳ ${error.message} Se te reembolsaron las fichas.` },
          { quoted: msg as any }
        );
        return;
      }

      if (error instanceof AudioStickerError) {
        const userMessage =
          error.code === "NO_AUDIO_TRACK"
            ? "⚠️ Ese video no tiene pista de audio. Usá `!s` si querés un sticker animado sin sonido. Se te reembolsaron las fichas."
            : `⚠️ ${error.message} Se te reembolsaron las fichas.`;

        await sock.sendMessage(remoteJid, { text: userMessage }, { quoted: msg as any });
        return;
      }

      console.error("[SA Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude generar el sticker con sonido. Se te reembolsaron las fichas." },
        { quoted: msg as any }
      );
    }
  },
};
