import { Command, CommandContext } from "../types.js";
import { claimActiveLoot } from "../../services/economy.service.js";

export const reclamarCommand: Command = {
  name: "reclamar",
  aliases: ["agarrar", "botin", "juntar", "manotear"],
  description: "Manotea y reclama un botín espontáneo tirado en la calle.",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const name = senderProfile?.primaryName || "Vecino";

    const res = await claimActiveLoot(senderJid, remoteJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No pudiste reclamar ningún botín." },
        { quoted: msg as any }
      );
      return;
    }

    const text =
      `🏃‍♂️💨 *¡BOTÍN ASEGURADO!* 💰\n\n` +
      `¡${name} tuvo las manos más rápidas del barrio y manoteó el fajo de la calle!\n\n` +
      `• *Monto guardado:* +*$${res.amount?.toLocaleString("es-AR")}* fichas\n` +
      `• *Nuevo saldo en mano:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas\n\n` +
      `👀 _Mantené los ojos abiertos en el chat para el próximo botín._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
