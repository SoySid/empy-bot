import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { transcribeAudio } from "../services/ai.service.js";
import { streamToBuffer } from "../services/media.service.js";
import axios from "axios";

export const shazamCommand: Command = {
  name: "shazam",
  aliases: ["musica", "cancion", "quees", "quetemaes"],
  description: "Identifica la canción de un audio, nota de voz o video citado.",
  execute: async ({ sock, msg, remoteJid, quotedMsg }: CommandContext) => {
    const audioMsg = msg.message?.audioMessage || (quotedMsg as any)?.audioMessage;
    const videoMsg = msg.message?.videoMessage || (quotedMsg as any)?.videoMessage;

    if (!audioMsg && !videoMsg) {
      await sock.sendMessage(
        remoteJid,
        { text: "🎵 Respondé a un audio, nota de voz o video con *!shazam* para identificar la música." },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🎧", key: msg.key } });
      }

      const isVideo = Boolean(videoMsg && !audioMsg);
      const targetMsg = audioMsg || videoMsg;
      const mediaType = isVideo ? "video" : "audio";

      const stream = await (downloadContentFromMessage as any)(targetMsg, mediaType);
      const mediaBuffer = await streamToBuffer(stream);

      // 1. Intento por Fingerprinting acústico (AudD API)
      const token = process.env.AUDD_API_KEY || "test";
      try {
        const form = new FormData();
        form.append("api_token", token);
        const blob = new Blob([new Uint8Array(mediaBuffer)], { type: isVideo ? "video/mp4" : "audio/ogg" });
        form.append("file", blob, isVideo ? "sample.mp4" : "sample.ogg");
        form.append("return", "spotify,apple_music");

        const auddRes = await axios.post("https://api.audd.io/", form, {
          timeout: 10000,
        });

        const result = auddRes.data?.result;
        if (result && result.title && result.artist) {
          let text = `🎵 *CANCIÓN IDENTIFICADA:*\n\n`;
          text += `• *Título:* ${result.title}\n`;
          text += `• *Artista:* ${result.artist}\n`;
          if (result.album) text += `• *Álbum:* ${result.album}\n`;
          if (result.release_date) text += `• *Lanzamiento:* ${result.release_date}\n`;
          if (result.song_link) text += `\n🔗 *Escuchar:* ${result.song_link}`;

          await sock.sendMessage(remoteJid, { text: text.trim() }, { quoted: msg as any });
          return;
        }
      } catch (err: any) {
        console.warn("[Shazam AudD] No se pudo identificar por huella acústica:", err?.message || err);
      }

      // 2. Intento por Reconocimiento de Letra con Whisper Turbo + LRCLIB
      const transcription = await transcribeAudio(mediaBuffer);
      if (transcription && transcription.trim().length > 10) {
        try {
          const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(transcription.trim())}`;
          const res = await axios.get(searchUrl, {
            headers: { "User-Agent": "EmpyBot/1.0" },
            timeout: 6000,
          });

          const match = res.data?.[0];
          if (match && (match.trackName || match.name)) {
            const trackName = match.trackName || match.name;
            let text = `🎵 *CANCIÓN IDENTIFICADA (VÍA LETRA):*\n\n`;
            text += `• *Título:* ${trackName}\n`;
            text += `• *Artista:* ${match.artistName}\n`;
            if (match.albumName) text += `• *Álbum:* ${match.albumName}\n`;
            text += `\n🗣️ *Fragmento escuchado:* "${transcription.trim().slice(0, 120)}..."`;

            await sock.sendMessage(remoteJid, { text: text.trim() }, { quoted: msg as any });
            return;
          }
        } catch {}
      }

      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude reconocer la canción. Asegurate de que la música se escuche con claridad y sin demasiado ruido de fondo." },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Shazam Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al procesar el audio para reconocimiento musical." },
        { quoted: msg as any }
      );
    }
  },
};
