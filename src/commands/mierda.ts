import { Command, CommandContext } from "./types.js";
import { generateMileiMierdaMeme, formatMileiMierdaPhrase } from "../services/meme.service.js";
import sharp from "sharp";

export const mierdaCommand: Command = {
  name: "mierda",
  aliases: ["esunamierda", "mileimierda"],
  description: "Genera el meme de Milei furioso sentenciando que algo es (o son) una mierda.",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, args }: CommandContext) => {
    let subject = cleanText.trim();

    // Filtro si enviaron flag de sticker
    const isSticker = args.some((a) => a === "--sticker" || a === "-s");
    if (isSticker) {
      subject = args.filter((a) => a !== "--sticker" && a !== "-s").join(" ").trim();
    }

    // Si no se proporcionó texto explícito, buscar en el mensaje citado
    if (!subject && quotedMsg) {
      subject =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption ||
        "";
      subject = subject.trim();
    }

    if (!subject) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "🇦🇷 *Meme de Milei: ¡ES UNA MIERDA!*\n\n" +
            "Escribí de qué o quién querés que opine Milei, o citá un mensaje con *!mierda*.\n\n" +
            "*Ejemplos:*\n" +
            "• `!mierda Corrientes` ➔ _CORRIENTES ES UNA MIERDA_\n" +
            "• `!mierda las gordas` ➔ _LAS GORDAS SON UNA MIERDA_\n" +
            "• `!mierda la uba` ➔ _LA UBA ES UNA MIERDA_\n\n" +
            "_Tip: agregá `--sticker` para recibirlo directamente en sticker._",
        },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "😡", key: msg.key } }).catch(() => {});
      }

      const memeBuffer = await generateMileiMierdaMeme(subject);
      const phrase = formatMileiMierdaPhrase(subject);

      if (isSticker) {
        const webpBuffer = await sharp(memeBuffer)
          .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 80 })
          .toBuffer();

        await sock.sendMessage(
          remoteJid,
          { sticker: webpBuffer },
          { quoted: msg as any }
        );
        return;
      }

      await sock.sendMessage(
        remoteJid,
        {
          image: memeBuffer,
          caption: `🇦🇷 *¡${phrase}!*`,
        },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Mierda Command] Error al generar meme de Milei:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al generar el meme de Milei." },
        { quoted: msg as any }
      );
    }
  },
};
