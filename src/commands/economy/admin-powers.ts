import { Command, CommandContext } from "../types.js";
import {
  muteGroupForCash,
  changeGroupNameForCash,
} from "../../services/admin-powers.service.js";
import { formatUserName } from "../../services/db/user.service.js";

/**
 * Comando !mutear [minutos]
 */
export const mutearCommand: Command = {
  name: "mutear",
  aliases: ["silencio", "mute", "callar"],
  description: "Silenciá el grupo durante 1 a 5 minutos pagando con fichas (!mutear [minutos]).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const minutes = parseInt(args[0] || "1", 10) || 1;

    const res = await muteGroupForCash(sock, remoteJid, senderJid, minutes);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
      return;
    }

    const buyerName = formatUserName(senderJid);
    const text =
      `🤐 *¡SILENCIO COMPRADO!* 🤐\n\n` +
      `${buyerName} puso la tarasca (*$${res.cost}* fichas) y silenció el grupo por *${res.minutes} minuto(s)*.\n\n` +
      `🔒 Solo los administradores pueden enviar mensajes hasta que termine el plazo.\n` +
      `💳 *Saldo restante del comprador:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text },
      { quoted: msg as any }
    );
  },
};

/**
 * Comando !comprarnombre <nuevo nombre>
 */
export const comprarNombreCommand: Command = {
  name: "comprarnombre",
  aliases: ["cambiarnombre", "renombrar", "nombregrupo"],
  description: "Cambiá el nombre del grupo de WhatsApp por $100,000 fichas (!comprarnombre <nuevo nombre>).",
  execute: async ({ sock, msg, remoteJid, cleanText, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    // Extraer el nuevo nombre
    const newName = cleanText.trim();

    if (!newName) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `👑 *COMPRAR NOMBRE DEL GRUPO*\n\n` +
            `Por *$100,000* fichas podés rebautizar el grupo como se te cante.\n\n` +
            `Uso: \`!comprarnombre <nuevo nombre>\`\n` +
            `_Ejemplo:_ \`!comprarnombre Los Reyes de la Pampa\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    const res = await changeGroupNameForCash(sock, remoteJid, senderJid, newName);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
      return;
    }

    const buyerName = formatUserName(senderJid);
    const text =
      `👑 *¡NUEVO NOMBRE DE GRUPO ADQUIRIDO!* 👑\n\n` +
      `${buyerName} garpó *$${res.cost}* fichas y acaba de rebautizar este antro como:\n` +
      `🏷️ *"${res.newName}"*\n\n` +
      `💳 *Saldo restante del magnate:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text },
      { quoted: msg as any }
    );
  },
};
