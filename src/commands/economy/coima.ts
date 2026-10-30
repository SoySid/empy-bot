import { Command, CommandContext } from "../types.js";
import { payBribe } from "../../services/economy.service.js";

export const coimaCommand: Command = {
  name: "coima",
  aliases: ["soborno", "policia", "cana", "bribe"],
  description: "Pagale $15,000 fichas a la policía para borrar tu cooldown de robo y asaltar ya (!coima).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await payBribe(senderJid);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
      return;
    }

    const text =
      `👮 *¡COIMA ACEPTADA BAJO LA MESA!* 👮\n\n` +
      `Le deslizaste *$15,000* fichas al comisario de turno.\n\n` +
      `📁 Tu prontuario policial quedó limpito y tu cooldown de asalto volvió a *0*.\n` +
      `🥷 ¡Ya podés salir a robar con \`!robar @usuario\`!\n\n` +
      `💳 *Tu nuevo saldo:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text },
      { quoted: msg as any }
    );
  },
};
