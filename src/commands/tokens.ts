import { Command, CommandContext } from "./types.js";
import { getTokenStatsString } from "../services/token.service.js";

export const tokensCommand: Command = {
  name: "tokens",
  aliases: ["token", "consumo", "uso", "cuota"],
  description: "Muestra el consumo de tokens y estadísticas del día.",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const stats = getTokenStatsString();
    await sock.sendMessage(remoteJid, { text: stats }, { quoted: msg as any });
  },
};