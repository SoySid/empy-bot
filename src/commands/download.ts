import { Command, CommandContext } from "./types.js";
import {
  downloadUniversalMedia,
  downloadYouTubeVideo,
  downloadYouTubeAudio,
  MediaDownloadResult,
  isSafePublicUrl,
} from "../services/media.service.js";
import axios from "axios";

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

function extractTargetUrl(ctx: CommandContext): string | null {
  // 1. Si el usuario pasó un link en los argumentos o texto directo:
  const directMatch = ctx.cleanText.match(URL_REGEX);
  if (directMatch && directMatch[0]) {
    return directMatch[0].replace(/[>\]\)\.\,\;\"\'\?\¿\!\¡]+$/, "");
  }

  // 2. Si el usuario está respondiendo/citando a un mensaje con link:
  const quoted = ctx.quotedMsg;
  if (quoted) {
    const quotedText =
      quoted.conversation ||
      quoted.extendedTextMessage?.text ||
      quoted.imageMessage?.caption ||
      quoted.videoMessage?.caption ||
      "";

    const quotedMatch = quotedText.match(URL_REGEX);
    if (quotedMatch && quotedMatch[0]) {
      return quotedMatch[0].replace(/[>\]\)\.\,\;\"\'\?\¿\!\¡]+$/, "");
    }
  }

  return null;
}

async function fetchMediaResultBuffer(mediaResult: MediaDownloadResult): Promise<Buffer> {
  if (mediaResult.buffer) return mediaResult.buffer;
  if (!mediaResult.url) throw new Error("No se obtuvo contenido descargable.");
  if (!isSafePublicUrl(mediaResult.url)) throw new Error("Destino no permitido por directiva de seguridad.");

  const fileResponse = await axios.get(mediaResult.url, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 45000,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
    maxRedirects: 5,
    beforeRedirect: (options: any) => {
      const nextUrl = options.href || `${options.protocol}//${options.host}${options.path}`;
      if (!isSafePublicUrl(nextUrl)) {
        throw new Error("Redirección bloqueada por política de seguridad.");
      }
    },
  });

  return Buffer.from(fileResponse.data);
}

export const downloadCommand: Command = {
  name: "descargar",
  aliases: ["d", "dl", "download", "yt", "youtube", "tt", "tk", "tiktok", "x", "twitter", "fb", "facebook", "ig", "instagram"],
  description: "Descarga videos de YouTube, TikTok, Reels, Twitter/X o Facebook en alta calidad.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, cleanText } = ctx;
    const url = extractTargetUrl(ctx);
    const query = cleanText.trim();
    const target = url || query;

    if (!target) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "⚠️ *Modo de uso:*\n• `!d <enlace>` o `!yt <enlace o búsqueda>`\n• `!mp3 <enlace o búsqueda>` (descarga el audio en MP3)\n• O responde a un mensaje con enlace de YouTube, Facebook, Twitter/X, Instagram o TikTok escribiendo `!d` o `!yt`.",
        },
        { quoted: msg as any }
      );
      return;
    }

    if (url && !isSafePublicUrl(url)) {
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El enlace proporcionado no está permitido por razones de seguridad." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });
      }

      const mediaResult = url
        ? await downloadUniversalMedia(url)
        : await downloadYouTubeVideo(query);

      if (!mediaResult || (!mediaResult.url && !mediaResult.buffer)) {
        await sock.sendMessage(
          remoteJid,
          {
            text:
              mediaResult?.errorNotice ||
              "❌ No pude descargar el contenido. Asegurate de que la publicación sea pública y provenga de YouTube, Facebook, Twitter/X, TikTok o Instagram.",
          },
          { quoted: msg as any }
        );
        return;
      }

      const buffer = await fetchMediaResultBuffer(mediaResult);

      if (mediaResult.type === "video") {
        await sock.sendMessage(
          remoteJid,
          {
            video: buffer,
            caption: mediaResult.caption || "Acá tenés el video",
            mimetype: "video/mp4",
          },
          { quoted: msg as any }
        );
      } else if (mediaResult.type === "audio") {
        const safeTitle = (mediaResult.title || mediaResult.caption || "audio")
          .replace(/[\\/:*?"<>|]/g, "")
          .slice(0, 80);
        await sock.sendMessage(
          remoteJid,
          {
            audio: buffer,
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${safeTitle}.mp3`,
          },
          { quoted: msg as any }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          {
            image: buffer,
            caption: mediaResult.caption || "Acá tenés la imagen",
            mimetype: "image/jpeg",
          },
          { quoted: msg as any }
        );
      }

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
      }
    } catch (error) {
      console.error("[Download Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El archivo es demasiado pesado o falló la descarga." },
        { quoted: msg as any }
      );
    }
  },
};

export const mp3Command: Command = {
  name: "mp3",
  aliases: ["ytaudio", "ytmp3", "musica"],
  description: "Descarga el audio MP3 de un video de YouTube.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, cleanText } = ctx;
    const url = extractTargetUrl(ctx);
    const query = cleanText.trim();
    const target = url || query;

    if (!target) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "⚠️ *Modo de uso:*\n• `!mp3 https://youtube.com/...`\n• `!mp3 <nombre de canción o video>`\n• O respondé a un enlace o video de YouTube escribiendo `!mp3`.",
        },
        { quoted: msg as any }
      );
      return;
    }

    if (url && !isSafePublicUrl(url)) {
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El enlace proporcionado no está permitido por razones de seguridad." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });
      }

      const mediaResult = await downloadYouTubeAudio(target);

      if (!mediaResult || (!mediaResult.buffer && !mediaResult.url)) {
        await sock.sendMessage(
          remoteJid,
          {
            text:
              mediaResult?.errorNotice ||
              "❌ No pude descargar el audio de YouTube. Asegurate de que el video sea accesible.",
          },
          { quoted: msg as any }
        );
        return;
      }

      const buffer = await fetchMediaResultBuffer(mediaResult);

      const safeTitle = (mediaResult.title || mediaResult.caption || "audio")
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 80);

      await sock.sendMessage(
        remoteJid,
        {
          audio: buffer,
          mimetype: "audio/mpeg",
          ptt: false,
          fileName: `${safeTitle}.mp3`,
        },
        { quoted: msg as any }
      );

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
      }
    } catch (error) {
      console.error("[MP3 Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El archivo es demasiado pesado o falló la conversión a MP3." },
        { quoted: msg as any }
      );
    }
  },
};
