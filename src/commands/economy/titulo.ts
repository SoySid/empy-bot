import { Command, CommandContext } from "../types.js";
import { buyCustomTitle } from "../../services/economy.service.js";
import { prisma } from "../../services/db/prisma.js";

export const tituloCommand: Command = {
  name: "titulo",
  aliases: ["title", "rango", "chapa"],
  description: "Comprá y ponete un título de honor visible por $6,900 fichas (!titulo <texto>).",
  execute: async ({ sock, msg, remoteJid, cleanText, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    // Extraer el texto del título
    const titleText = cleanText.trim();

    if (!titleText) {
      // Si no pasa argumentos, mostrar su título actual o cómo comprarlo
      const current = await (prisma.userProfile as any).findUnique({
        where: { jid: senderJid },
        select: { title: true, balance: true },
      });

      const currentTitle = current?.title ? `🎖️ *Tu título actual:* "${current.title}"` : "🎖️ *No tenés ningún título asignado.*";

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🎖️ *TÍTULOS DE HONOR SOCIAL*\n\n` +
            `${currentTitle}\n\n` +
            `Podés comprar cualquier título personalizado por *$6,900* fichas para que aparezca en tu perfil, billetera y changas.\n\n` +
            `Uso: \`!titulo <nombre del título>\`\n` +
            `_Ejemplos:_\n` +
            `• \`!titulo Papá de Empy\`\n` +
            `• \`!titulo Magnate de la Pampa\`\n` +
            `• \`!titulo Chorro Veterano\`\n` +
            `• \`!titulo Fantasmón Rehabilitado\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    const res = await buyCustomTitle(senderJid, titleText);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
      return;
    }

    const text =
      `🎖️ *¡TÍTULO ADQUIRIDO CON ÉXITO!* 🎖️\n\n` +
      `Pusiste *$6,900* fichas y ahora ostentás con orgullo la chapa de:\n` +
      `👑 *"${res.title}"*\n\n` +
      `💳 *Nuevo saldo:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text },
      { quoted: msg as any }
    );
  },
};
