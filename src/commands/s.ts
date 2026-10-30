import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { createSticker, createAnimatedSticker, animatedStickerToVideo } from "../services/sticker.service.js";
import { modifyBalance } from "../services/economy.service.js";
import { ECONOMY_CONFIG } from "../config/economy.config.js";
import { streamToBuffer } from "../services/media.service.js";
import sharp from "sharp";

function isViewOnce(rawMsg: any): boolean {
  if (!rawMsg) return false;

  if (
    rawMsg.viewOnceMessage ||
    rawMsg.viewOnceMessageV2 ||
    rawMsg.viewOnceMessageV2Extension
  ) {
    return true;
  }

  if (
    rawMsg.viewOnce === true ||
    rawMsg.imageMessage?.viewOnce === true ||
    rawMsg.videoMessage?.viewOnce === true ||
    rawMsg.audioMessage?.viewOnce === true
  ) {
    return true;
  }

  const inner =
    rawMsg.message ||
    rawMsg.viewOnceMessage?.message ||
    rawMsg.viewOnceMessageV2?.message ||
    rawMsg.viewOnceMessageV2Extension?.message ||
    rawMsg.imageMessage ||
    rawMsg.videoMessage ||
    rawMsg.audioMessage ||
    rawMsg.extendedTextMessage?.contextInfo?.quotedMessage;

  if (inner && inner !== rawMsg) {
    return isViewOnce(inner);
  }

  return false;
}

export const sCommand: Command = {
  name: "s",
  aliases: ["pegatina", "toimg", "img", "togif", "gif"],
  description: "Comando universal para multimedia: crea stickers o los convierte a foto/gif.",
  execute: async ({ sock, msg, remoteJid, quotedMsg, contextInfo, senderProfile }: CommandContext) => {

    const isDirectViewOnce = isViewOnce(msg) || isViewOnce(msg.message);
    const isQuotedViewOnce = isViewOnce(contextInfo?.quotedMessage) || isViewOnce(quotedMsg);

    if (isDirectViewOnce || isQuotedViewOnce) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ No hago stickers de fotos o videos de una sola vez por privacidad." },
        { quoted: msg as any }
      );
      return;
    }

    // Cobro por uso de servicio multimedia
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const balanceCheck = await modifyBalance(senderJid, -ECONOMY_CONFIG.COST_STICKER);

    if (!balanceCheck.success) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `💸 *Fondos insuficientes:* El servicio de stickers cuesta *$${ECONOMY_CONFIG.COST_STICKER}* fichas (tu saldo: *$${balanceCheck.oldBalance}*).\n\n¡Tirá \`!laburar\` o consultá tu \`!diario\` para juntar fondos!`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const targetSticker = (quotedMsg as any)?.stickerMessage || msg.message?.stickerMessage;
    const imageMsg = msg.message?.imageMessage || (quotedMsg as any)?.imageMessage;
    const videoMsg = msg.message?.videoMessage || (quotedMsg as any)?.videoMessage;

    if (imageMsg?.viewOnce === true || videoMsg?.viewOnce === true) {
      // Reembolso por ser viewonce
      await modifyBalance(senderJid, ECONOMY_CONFIG.COST_STICKER);
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ No hago stickers de fotos o videos de una sola vez por privacidad." },
        { quoted: msg as any }
      );
      return;
    }

    if (!targetSticker && !imageMsg && !videoMsg) {
      // Reembolso por no encontrar multimedia
      await modifyBalance(senderJid, ECONOMY_CONFIG.COST_STICKER);
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ Respondé a una foto, video o sticker con `!s`." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });
      }

      // CASO 1: Es un sticker -> Convertir a imagen o gif
      if (targetSticker) {
        const isAnimated = Boolean(targetSticker.isAnimated);
        const stream = await (downloadContentFromMessage as any)(targetSticker, "sticker");
        const stickerBuffer = await streamToBuffer(stream);

        if (isAnimated) {
          const videoBuffer = await animatedStickerToVideo(stickerBuffer);
          await sock.sendMessage(
            remoteJid,
            { video: videoBuffer, gifPlayback: true, caption: "Acá tenés el gif." },
            { quoted: msg as any }
          );
        } else {
          const imageBuffer = await sharp(stickerBuffer).png().toBuffer();
          await sock.sendMessage(
            remoteJid,
            { image: imageBuffer, caption: "Acá tenés la imagen." },
            { quoted: msg as any }
          );
        }

        if (msg.key) {
          await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
        }
        return;
      }
      
      // CASO 2: Es un video -> Convertir a sticker animado
      if (videoMsg) {
        const seconds = videoMsg.seconds || 0;
        if (seconds > 10) {
          // Reembolsar si el video es demasiado largo
          await modifyBalance(senderJid, ECONOMY_CONFIG.COST_STICKER);
          await sock.sendMessage(
            remoteJid,
            { text: "⚠️ El video es muy largo. Máximo 10 segundos para stickers." },
            { quoted: msg as any }
          );
          return;
        }

        const stream = await (downloadContentFromMessage as any)(videoMsg, "video");
        const mediaBuffer = await streamToBuffer(stream);
        const stickerBuffer = await createAnimatedSticker(mediaBuffer);

        await sock.sendMessage(
          remoteJid,
          { sticker: stickerBuffer, isAnimated: true },
          { quoted: msg as any }
        );
      }
      // CASO 3: Es una imagen -> Convertir a sticker estático
      else if (imageMsg) {
        const stream = await (downloadContentFromMessage as any)(imageMsg, "image");
        const mediaBuffer = await streamToBuffer(stream);
        const stickerBuffer = await createSticker(mediaBuffer);

        await sock.sendMessage(
          remoteJid,
          { sticker: stickerBuffer },
          { quoted: msg as any }
        );
      }

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
      }
    } catch (error) {
      // Reembolso garantizado en caso de falla técnica
      await modifyBalance(senderJid, ECONOMY_CONFIG.COST_STICKER);
      console.error("[Sticker Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Falló el procesamiento del multimedia. Se te reembolsaron las fichas." },
        { quoted: msg as any }
      );
    }
  },
};
