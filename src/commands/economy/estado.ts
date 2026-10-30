import { Command, CommandContext } from "../types.js";
import { getOrInitGlobalState } from "../../services/economy.service.js";
import { PROFESSIONS } from "../../config/economy.config.js";

export const estadoCommand: Command = {
  name: "estado",
  aliases: ["climaglobal", "evento", "climaeco", "estadoeco"],
  description: "Muestra el estado/clima global económico vigente, multiplicadores para !laburar y tiempo restante.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    const { weather, state } = await getOrInitGlobalState();

    const now = Date.now();
    const remainingMs = Math.max(0, new Date(state.eventExpiresAt).getTime() - now);
    const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const pMults = (weather.professionMultipliers || {}) as Record<string, number>;

    const profs = Object.values(PROFESSIONS);
    const profLines: string[] = [];
    for (let i = 0; i < profs.length; i += 2) {
      const p1 = profs[i];
      const p2 = profs[i + 1];
      const m1 = `${p1.icon} *${p1.name}:* \`x${(pMults[p1.id] ?? 1.0).toFixed(1)}\``;
      const m2 = p2 ? ` | ${p2.icon} *${p2.name}:* \`x${(pMults[p2.id] ?? 1.0).toFixed(1)}\`` : "";
      profLines.push(`• ${m1}${m2}`);
    }

    const text =
      `🌤️ *CLIMA ECONÓMICO: ${weather.icon} ${weather.name.toUpperCase()}*\n` +
      `📢 _"${weather.description}"_ (Cambia en *${hours > 0 ? `${hours}h ` : ""}${minutes}m*)\n\n` +
      `👷 *Impacto en Oficios:*\n` +
      `${profLines.join("\n")}\n\n` +
      `💡 _Tirá \`!laburar\` para aprovechar los multiplicadores._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
