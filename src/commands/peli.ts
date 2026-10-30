import { Command, CommandContext } from "./types.js";
import axios from "axios";
import { generateWithGemini } from "../services/ai.service.js";

interface MovieInfo {
  title: string;
  year: string;
  rating: string;
  director: string;
  cast: string;
  platforms: string[];
  synopsis: string;
  posterUrl?: string;
}

export const peliCommand: Command = {
  name: "peli",
  aliases: ["pelicula", "serie", "dondever", "cine"],
  description: "Busca información de películas o series, calificación, sinopsis y dónde verlas.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    const query = cleanText.trim();
    if (!query) {
      await sock.sendMessage(
        remoteJid,
        { text: "🎬 Indicá el nombre de una película o serie. Ej: *!peli Inception* o *!peli Breaking Bad*" },
        { quoted: msg as any }
      );
      return;
    }

    try {
      const tmdbKey = process.env.TMDB_API_KEY;

      if (tmdbKey) {
        // Opción 1: Consulta directa a TMDb si configuró su API Key
        const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&language=es-ES&query=${encodeURIComponent(query)}&page=1`;
        const res = await axios.get(searchUrl, { timeout: 6000 });
        const results = res.data?.results || [];

        if (results.length > 0) {
          const item = results[0];
          const isMovie = item.media_type === "movie" || !!item.title;
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;
          const year = releaseDate ? releaseDate.split("-")[0] : "N/A";
          const rating = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : "S/C";
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
          const synopsis = item.overview || "Sin descripción disponible.";

          let text = `🎬 *${title.toUpperCase()}* (${year})\n`;
          text += `⭐ *Puntaje:* ${rating}\n`;
          text += `📝 *Tipo:* ${isMovie ? "Película" : "Serie"}\n\n`;
          text += `📖 *Sinopsis:*\n${synopsis}\n`;

          if (posterUrl) {
            try {
              const imgRes = await axios.get(posterUrl, { responseType: "arraybuffer", timeout: 6000 });
              await sock.sendMessage(
                remoteJid,
                { image: Buffer.from(imgRes.data), caption: text.trim() },
                { quoted: msg as any }
              );
              return;
            } catch {
              // Si falla descargar el póster, envía texto simple
            }
          }

          await sock.sendMessage(remoteJid, { text: text.trim() }, { quoted: msg as any });
          return;
        }
      }

      // Opción 2: Fallback autónomo con IA estructurada (no requiere API key de terceros)
      const prompt = `Devuelve la ficha de la película o serie "${query}" en formato JSON estricto sin markdown:
{
  "title": "Título oficial",
  "year": "Año",
  "rating": "Puntaje aproximado IMDb sobre 10 (ej: 8.4/10)",
  "director": "Director o Creador",
  "cast": "2 o 3 actores principales",
  "platforms": ["Plataformas de streaming donde suele estar disponible legalmente en Latam/España, ej: Netflix, Max, Disney+, Prime Video, Apple TV"],
  "synopsis": "Sinopsis atractiva y breve en 2 oraciones en español."
}`;

      const aiResponse = await generateWithGemini(prompt, 350, 0.2, "movie-search");
      if (!aiResponse) {
        throw new Error("No hubo respuesta de búsqueda");
      }

      const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
      const movie: MovieInfo = JSON.parse(cleanJson);

      let text = `🎬 *${movie.title.toUpperCase()}* (${movie.year})\n`;
      text += `⭐ *Puntaje:* ${movie.rating}\n`;
      if (movie.director) text += `🎥 *Director/Creador:* ${movie.director}\n`;
      if (movie.cast) text += `🎭 *Reparto:* ${movie.cast}\n`;
      if (movie.platforms && movie.platforms.length > 0) {
        text += `📺 *Dónde verla:* ${movie.platforms.join(", ")}\n`;
      }
      text += `\n📖 *Sinopsis:*\n${movie.synopsis}`;

      await sock.sendMessage(remoteJid, { text: text.trim() }, { quoted: msg as any });
    } catch (err) {
      console.error("[Peli Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: `❌ No pude encontrar información de "*${query}*". Probá con otro título.` },
        { quoted: msg as any }
      );
    }
  },
};
