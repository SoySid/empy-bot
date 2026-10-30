import { Command, CommandContext } from "../types.js";
import { getTarotReading } from "../../services/astrology.service.js";

export const tarotCommand: Command = {
  name: "tarot",
  aliases: ["cartas", "tirada", "arcanos"],
  description: "Tirada de 3 cartas del Tarot de Marsella con interpretación decisiva y directa de Empy.",
  execute: async ({ sock, msg, remoteJid, cleanText, senderProfile }: CommandContext) => {
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🃏", key: msg.key } }).catch(() => {});
    }

    const userName = senderProfile?.primaryName || "Compa";
    // Extraer pregunta después de la palabra comando
    const question = cleanText.replace(/^[!\./]?(tarot|cartas|tirada|arcanos)\b/i, "").trim() || undefined;

    const reading = await getTarotReading(question, userName);
    const sent = await sock.sendMessage(remoteJid, { text: reading }, { quoted: msg as any });
    console.log(`[Tarot] ✅ Mensaje de lectura enviado a ${remoteJid} (ID: ${sent?.key?.id})`);
  },
};
