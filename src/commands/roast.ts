import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { processVisionMessage, generateWithGemini } from "../services/ai.service.js";
import { streamToBuffer } from "../services/media.service.js";

export const roastCommand: Command = {
  name: "roast",
  aliases: ["critica", "criticar", "domar", "domada"],
  description: "Analiza una foto, sticker, frase u opinión y le tira una crítica humorística y sarcástica.",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, senderProfile, quotedSenderProfile }: CommandContext) => {
    const imageMsg = msg.message?.imageMessage || (quotedMsg as any)?.imageMessage;
    const stickerMsg = msg.message?.stickerMessage || (quotedMsg as any)?.stickerMessage;

    // Texto explícito o citado
    let textTarget = cleanText.trim();
    if (!textTarget && quotedMsg) {
      textTarget =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption ||
        "";
      textTarget = textTarget.trim();
    }

    if (!imageMsg && !stickerMsg && !textTarget) {
      await sock.sendMessage(
        remoteJid,
        { text: "🔥 Respondé a una foto, sticker o mensaje de texto con *!roast* (o escribí `!roast <frase u opinión>`) para domarlo." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: msg.key } }).catch(() => {});
      }

      // CASO 1: Es imagen o sticker
      if (imageMsg || stickerMsg) {
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
        return;
      }

      // CASO 2: Es texto / frase / opinión
      const authorContext = quotedSenderProfile
        ? `Autor: ${quotedSenderProfile.primaryName || quotedSenderProfile.pushName || "usuario"}`
        : "";

      const textPrompt = `Sos un integrante compinche, sarcástico y picante de un grupo de WhatsApp en Argentina.
Un integrante acaba de tirar esta frase u opinión en el chat:
"${textTarget}"
${authorContext ? `Autor de la frase: ${authorContext}` : ""}

Hacé un ROAST humorístico y una domada sarcástica de esa frase, texto u opinión.
REGLAS:
- Chicana argentina directa al hueso, burlate con ingenio de lo absurdo, pretencioso, quemado o ridículo de lo que dijo.
- Máximo 2 oraciones cortas con remate letal.
- Centrate estrictamente en la frase, las palabras o el contenido del mensaje. PROHIBIDO hacer chistes o referencias sobre plata, saldo, economía, trabajo o profesión.
- Cero introducciones formales (nada de "Bueno che..." o "Analizando tu comentario...").
- Usá modismos argentinos genuinos (fantasma, liquidado, tiró esa, descansero, etc.).
- Sin sermones morales ni censura de IA.`.trim();

      const roastText = await generateWithGemini(textPrompt, 300, 0.65, "roast-text");

      await sock.sendMessage(
        remoteJid,
        { text: `🔥 ${roastText || "Le quise buscar remate pero la frase ya daba lástima sola."}` },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Roast Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude armar el roast en este momento." },
        { quoted: msg as any }
      );
    }
  },
};
