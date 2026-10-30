import { Command, CommandContext } from "../types.js";
import { executeRobbery } from "../../services/economy.service.js";
import { formatUserName } from "../../services/db/user.service.js";
import { isBotJid, normalizeToPhoneJid } from "../../services/whatsapp-identity.js";

export const robarCommand: Command = {
  name: "robar",
  aliases: ["asalto", "afanar", "asaltar"],
  description: "Intentá asaltar a otro usuario (65% éxito, cooldown 30s, indemnización en fracaso).",
  execute: async ({ sock, msg, remoteJid, contextInfo, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    // Extraer víctima: mención en texto o quoted message
    const rawVictim =
      contextInfo?.mentionedJid?.[0] ||
      contextInfo?.participant ||
      "";

    if (!rawVictim) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "🚨 *¿A quién le vas a robar?*\n\nEtiquetá a alguien con `@usuario` o respondé a su mensaje usando `!robar`.",
        },
        { quoted: msg as any }
      );
      return;
    }

    const victimJid = normalizeToPhoneJid(rawVictim);
    const normalizedSender = normalizeToPhoneJid(senderJid);

    if (isBotJid(sock, victimJid) || isBotJid(sock, rawVictim)) {
      await sock.sendMessage(
        remoteJid,
        { text: "🤖 *¿Robarle al bot?* ¡Ni lo sueñes, pibe! Tengo alarmas láser y cámaras de seguridad." },
        { quoted: msg as any }
      );
      return;
    }

    if (victimJid === normalizedSender || victimJid === senderJid) {
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No podés asaltarte a vos mismo, loco." },
        { quoted: msg as any }
      );
      return;
    }

    const res = await executeRobbery(senderJid, victimJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ *Asalto cancelado:* ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const aggressorName = formatUserName(senderJid);
    const victimName = formatUserName(victimJid);

    if (res.isSuccessfulRobbery) {
      const text =
        `🦹 *¡ASALTO EXITOSO!*\n\n` +
        `${aggressorName} le puso un caño imaginario en las costillas a ${victimName} y le sacó *$${res.stolenAmount}* fichas limpias de la billetera.\n\n` +
        `• *Saldo ladrón:* *$${res.aggressorBalance}* fichas\n` +
        `• *Saldo víctima:* *$${res.victimBalance}* fichas`;

      await sock.sendMessage(remoteJid, {
        text,
      });
    } else {
      const text =
        `🚨 *¡FALLÓ EL ASALTO!*\n\n` +
        `${aggressorName} intentó punguear a ${victimName}, pero se tropezó con una baldosa floja y los vecinos casi lo linchan.\n\n` +
        `⚖️ *Indemnización obligatoria:* Tuviste que pagarle *$${res.finePaid}* fichas a la víctima por el susto y daños morales.\n\n` +
        `• *Saldo agresor:* *$${res.aggressorBalance}* fichas\n` +
        `• *Saldo víctima:* *$${res.victimBalance}* fichas`;

      await sock.sendMessage(remoteJid, {
        text,
      });
    }
  },
};
