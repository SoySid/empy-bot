import { Command, CommandContext } from "../types.js";
import { repairTool } from "../../services/economy.service.js";

export const afilarCommand: Command = {
  name: "afilar",
  aliases: ["reparar_herramienta", "service_herramienta", "afilar_herramienta", "arreglar"],
  description: "Afilá y repará tu herramienta principal al 100% de durabilidad por unas fichas (!afilar).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await repairTool(senderJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const message =
      `🧰 *¡SERVICE DE HERRAMIENTA COMPLETADO!* 🧰\n\n` +
      `Le hiciste el service oficial a tu *${res.toolName}*:\n` +
      `✨ *Durabilidad restaurada:* 100% [🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩]\n` +
      `🛡️ *Buffs restaurados:* Vuelve tu resistencia a bloopers y bonificación plena de cobro.\n` +
      `💳 *Costo del service:* *$${res.cost}* fichas (Saldo restante: *$${res.newBalance}*).`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};
