import { Command, CommandContext } from "./types.js";
import { generateMileiClaveMeme, formatMileiClavePhrase } from "../services/meme.service.js";
import sharp from "sharp";

export const claveCommand: Command = {
  name: "clave",
  aliases: ["esclave", "mileiclave"],
  description: "Genera el meme de Milei cósmico/pensativo sentenciando que algo es (o son) clave.",
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
            "🌌 *Meme de Milei: ¡ES CLAVE!*\n\n" +
            "Escribí de qué o quién querés que opine Milei, o citá un mensaje con *!clave*.\n\n" +
            "*Ejemplos:*\n" +
            "• `!clave Corrientes` ➔ _CORRIENTES ES CLAVE_\n" +
            "• `!clave las vacaciones` ➔ _LAS VACACIONES SON CLAVE_\n" +
            "• `!clave el mate amargo` ➔ _EL MATE AMARGO ES CLAVE_\n\n" +
            "_Tip: agregá `--sticker` para recibirlo directamente en sticker._",
        },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🌌", key: msg.key } }).catch(() => {});
      }

      const memeBuffer = await generateMileiClaveMeme(subject);
      const phrase = formatMileiClavePhrase(subject);

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
      console.error("[Clave Command] Error al generar meme de Milei:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al generar el meme de Milei." },
        { quoted: msg as any }
      );
    }
  },
};
