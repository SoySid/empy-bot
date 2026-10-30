import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { processVisionMessage } from "../services/ai.service.js";
import { streamToBuffer } from "../services/media.service.js";

export const roastCommand: Command = {
  name: "roast",
  aliases: ["critica", "criticar", "domar", "domada"],
  description: "Analiza una foto o sticker con visión IA y le tira una crítica humorística y sarcástica.",
  execute: async ({ sock, msg, remoteJid, quotedMsg, senderProfile }: CommandContext) => {
    const imageMsg = msg.message?.imageMessage || (quotedMsg as any)?.imageMessage;
    const stickerMsg = msg.message?.stickerMessage || (quotedMsg as any)?.stickerMessage;

    if (!imageMsg && !stickerMsg) {
      await sock.sendMessage(
        remoteJid,
        { text: "📸 Respondé a una foto o sticker con *!roast* para que lo critique." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: msg.key } });
      }

      const isSticker = Boolean(stickerMsg && !imageMsg);
      const targetMsg = imageMsg || stickerMsg;
      const mediaType = isSticker ? "sticker" : "image";

      const stream = await (downloadContentFromMessage as any)(targetMsg, mediaType);
      const mediaBuffer = await streamToBuffer(stream);

      const prompt = `Sos un integrante compinche, sarcástico y picante de un grupo de WhatsApp en Argentina.
Mirá con atención esta imagen y hacé un ROAST humorístico de lo que ves (la ropa, la pose, el fondo, el peinado, la calidad o la situación).
REGLAS:
- Tono gracioso de chicana entre amigos en WhatsApp, directo al hueso.
- Máximo 2 oraciones con remate contundente. Cero introducciones formales.
- Usá lunfardo y expresiones argentinas naturales (che, fantasma, liquidado, etc.).
- Sin advertencias ni sermones de IA.`.trim();

      const roastText = await processVisionMessage(mediaBuffer, isSticker, prompt, senderProfile);

      await sock.sendMessage(
        remoteJid,
        { text: `🔥 ${roastText}` },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Roast Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude analizar la imagen en este momento." },
        { quoted: msg as any }
      );
    }
  },
};
