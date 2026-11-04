import { Command, CommandContext } from "./types.js";
import { isBotOwner } from "../services/admin-economy.service.js";

/**
 * Comando para apagar el bot de forma segura.
 * Restringido estrictamente al Creador del bot.
 */
export const shutdownCommand: Command = {
  name: "apagar",
  aliases: ["shutdown", "off", "apagate"],
  description: "Apaga el proceso del bot de forma segura (solo Creador).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";

    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: "⛔ Solo el Creador tiene autorización para apagar el bot." },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    if (ctx.msg.key) {
      await ctx.sock.sendMessage(ctx.remoteJid, { react: { text: "🔌", key: ctx.msg.key } }).catch(() => {});
    }

    await ctx.sock.sendMessage(
      ctx.remoteJid,
      {
        text: "🔌 *Apagando Empy-Bot...*\n\nSesión cerrada de forma segura por el Creador. ¡Hasta la próxima!",
      },
      { quoted: ctx.msg as any }
    ).catch(() => {});

    // Margen para asegurar el envío del mensaje en el socket antes de la salida limpia
    setTimeout(() => {
      console.log("[Shutdown] Apagado solicitado por el Creador. Finalizando proceso...");
      process.exit(0);
    }, 1200);
  },
};
