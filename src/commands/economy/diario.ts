import { Command, CommandContext } from "../types.js";
import { getWallet } from "../../services/economy.service.js";

export const diarioCommand: Command = {
  name: "diario",
  aliases: ["daily", "ingresopasivo"],
  description: "Informa sobre el estado del cobro pasivo automático (ciclo de 20 horas).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const wallet = await getWallet(senderJid);

    const bonusText = wallet.dailyBusinessBonus > 0
      ? ` (Base: $${wallet.dailyBaseAmount} + Negocios: $${wallet.dailyBusinessBonus})`
      : "";

    if (wallet.dailyCreditedJustNow) {
      const text =
        `🎁 *¡COBRO PASIVO ACREDITADO!*\n\n` +
        `• *Monto:* +*$${wallet.dailyAmount}* fichas${bonusText}\n` +
        `• *Saldo:* *$${wallet.balance}* fichas\n\n` +
        `🕒 _Próximo cobro automático en 20 horas._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    const totalMinutes = Math.ceil(wallet.dailyRemainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const text =
      `📅 *INGRESO PASIVO DIARIO (20hs)*\n\n` +
      `• *Próximo cobro:* en *${hours}h ${minutes}m*\n` +
      `• *Monto a recibir:* +*$${wallet.dailyAmount}* fichas${bonusText}\n` +
      `• *Saldo actual:* *$${wallet.balance}* fichas`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
