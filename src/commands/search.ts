import { Command, CommandContext } from "./types.js";
import { searchWebForUser } from "../services/web-search.service.js";

export const searchCommand: Command = {
  name: "buscar",
  aliases: ["google", "web", "search"],
  description: "Busca información en tiempo real en la web, noticias, cotizaciones o clima.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    const query = cleanText.trim();

    if (!query || query.length < 2) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "🔍 *Uso del buscador web:*\n" +
            "• `!buscar <consulta>` (ej: `!buscar quién ganó la libertadores`)\n" +
            "• `!buscar dolar blue`\n" +
            "• `!buscar clima en Chivilcoy`\n" +
            "• Alias disponibles: `!google`, `!web`",
        },
        { quoted: msg as any }
      );
      return;
    }

    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🔍", key: msg.key } }).catch(() => {});
    }

    try {
      const res = await searchWebForUser(query);
      await sock.sendMessage(
        remoteJid,
        { text: res.message },
        { quoted: msg as any }
      );
    } catch (err: any) {
      console.error("[Search Command] Error:", err?.message || err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al intentar consultar la web. Probá de nuevo más tarde." },
        { quoted: msg as any }
      );
    }
  },
};
