import { Command, CommandContext } from "../types.js";
import { buyShield } from "../../services/economy.service.js";
import { ECONOMY_CONFIG } from "../../config/economy.config.js";

export const escudoCommand: Command = {
  name: "escudo",
  aliases: ["shield", "comprarescudo", "proteger"],
  description: "Informa sobre el estado de los escudos (abolidos).",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    await sock.sendMessage(
      remoteJid,
      {
        text: "🚫 *ESCUDOS ABOLIDOS:* Los escudos anti-robo han sido eliminados de la ciudad por ley marcial. ¡Ahora nadie tiene inmunidad y los asaltos son libres para todos!",
      },
      { quoted: msg as any }
    );
  },
};
