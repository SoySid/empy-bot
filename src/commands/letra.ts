import { Command, CommandContext } from "./types.js";
import axios from "axios";

interface LrclibTrack {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
}

export const letraCommand: Command = {
  name: "letra",
  aliases: ["lyrics", "letras", "cancion"],
  description: "Busca la letra completa de cualquier canción mediante LRCLIB.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    const query = cleanText.trim();
    if (!query) {
      await sock.sendMessage(
        remoteJid,
        { text: "🎵 Indicá el nombre de la canción o artista. Ej: *!letra De Música Ligera*" },
        { quoted: msg as any }
      );
      return;
    }

    try {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      const res = await axios.get<LrclibTrack[]>(searchUrl, {
        headers: {
          "User-Agent": "EmpyBot/1.0 (https://github.com/empy-bot; bot@empy.local)",
        },
        timeout: 7000,
      });

      const list = res.data;
      if (!Array.isArray(list) || list.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ No encontré la letra de "*${query}*". Probá agregando el nombre del artista.` },
          { quoted: msg as any }
        );
        return;
      }

      // Buscar el primer resultado que tenga letra disponible
      const track = list.find((t) => (t.plainLyrics && t.plainLyrics.trim().length > 0) || (t.syncedLyrics && t.syncedLyrics.trim().length > 0));
      if (!track) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ Encontré la canción "*${list[0].trackName}*" de *${list[0].artistName}*, pero no tiene letra disponible.` },
          { quoted: msg as any }
        );
        return;
      }

      let lyrics = track.plainLyrics?.trim() || "";
      if (!lyrics && track.syncedLyrics) {
        // Limpiar marcas de tiempo de las letras sincronizadas [00:12.34]
        lyrics = track.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, "").trim();
      }

      // Si la letra es excesivamente larga para WhatsApp, truncar prolijamente
      const MAX_LENGTH = 3500;
      let truncated = false;
      if (lyrics.length > MAX_LENGTH) {
        lyrics = lyrics.slice(0, MAX_LENGTH);
        const lastNewline = lyrics.lastIndexOf("\n");
        if (lastNewline > 0) lyrics = lyrics.slice(0, lastNewline);
        truncated = true;
      }

      const title = track.trackName || track.name;
      let text = `🎶 *${title.toUpperCase()}*\n👤 *Artista:* ${track.artistName}\n`;
      if (track.albumName) {
        text += `💿 *Álbum:* ${track.albumName}\n`;
      }
      text += `\n────────────────────\n\n${lyrics}\n`;
      if (truncated) {
        text += `\n_... (letra recortada por longitud)_`;
      }

      await sock.sendMessage(remoteJid, { text: text.trim() }, { quoted: msg as any });
    } catch (err) {
      console.error("[Letra Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al buscar la letra de la canción." },
        { quoted: msg as any }
      );
    }
  },
};
