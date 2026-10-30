import { Command, CommandContext } from "./types.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import { commandMap } from "./index.js";
import {
  banCommandForUser,
  unbanCommandForUser,
  getUserBannedCommands,
  normalizeBanCommandName,
} from "../services/command-ban.service.js";
import { resolveOrRegisterUser } from "../services/db/user.service.js";

/**
 * Comando para bloquear el uso de un comando a un usuario específico.
 * Solo puede ser utilizado por el creador del bot citando al usuario objetivo.
 */
export const banCommand: Command = {
  name: "ban",
  aliases: ["banear", "blockcmd", "bloquearcmd"],
  description: "Bloquea el uso de un comando a un usuario respondiendo a su mensaje (solo Creador).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: "⛔ Solo el creador tiene autorización para banear comandos." },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const targetJid =
      ctx.quotedSenderProfile?.jid ||
      (ctx.contextInfo?.participant ? ctx.contextInfo.participant : undefined);

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `⚠️ *Debés responder al mensaje del usuario* al que querés banearle un comando.\n\n` +
            `_Uso:_ respondé a su mensaje con:\n` +
            `• \`!ban besar\`\n` +
            `• \`!ban laburo\`\n` +
            `• \`!ban pesca\``,
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const rawCommand = ctx.args[0]?.trim();
    if (!rawCommand) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `⚠️ Indicá qué comando querés banear respondiendo al usuario.\n\n` +
            `_Ejemplos:_\n` +
            `• \`!ban besar\`\n` +
            `• \`!ban laburo\`\n` +
            `• \`!ban pesca\``,
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const normalizedCmd = normalizeBanCommandName(rawCommand);
    if (!normalizedCmd) return;

    // Si intenta banear comandos administrativos críticos del creador
    if (["ban", "unban", "desban", "desbanear", "bans"].includes(normalizedCmd)) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: "⚠️ No se pueden banear los comandos del sistema de administración." },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const targetProfile =
      ctx.quotedSenderProfile || (await resolveOrRegisterUser(targetJid).catch(() => null));
    const targetName = targetProfile?.primaryName || "usuario";

    // Registrar el ban para el comando especificado
    await banCommandForUser(targetJid, normalizedCmd, senderJid);

    // Si el comando tiene una raíz distinta y no es de interacción abierta, también bloquear la raíz
    const mappedCmd = commandMap.get(normalizedCmd);
    if (mappedCmd && mappedCmd.name !== normalizedCmd && mappedCmd.name !== "interaccion") {
      await banCommandForUser(targetJid, mappedCmd.name, senderJid);
    }

    await ctx.sock.sendMessage(
      ctx.remoteJid,
      {
        text: `🚫 *Comando bloqueado*\n\nSe restringió el uso de *!${normalizedCmd}* para @${targetName}.`,
        mentions: [targetJid],
      },
      { quoted: ctx.msg as any }
    ).catch(() => {});
  },
};

/**
 * Comando para desbloquear el uso de un comando a un usuario previamente baneado.
 */
export const unbanCommand: Command = {
  name: "unban",
  aliases: ["desban", "desbanear", "unblockcmd"],
  description: "Desbloquea un comando a un usuario respondiendo a su mensaje (solo Creador).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: "⛔ Solo el creador tiene autorización para desbanear comandos." },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const targetJid =
      ctx.quotedSenderProfile?.jid ||
      (ctx.contextInfo?.participant ? ctx.contextInfo.participant : undefined);

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `⚠️ *Debés responder al mensaje del usuario* para desbloquearle el comando.\n\n` +
            `_Uso:_ respondé a su mensaje con:\n` +
            `• \`!desban besar\`\n` +
            `• \`!desban laburo\``,
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const rawCommand = ctx.args[0]?.trim();
    if (!rawCommand) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `⚠️ Indicá qué comando querés desbloquear.\n\n_Ejemplo:_ \`!desban besar\``,
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const normalizedCmd = normalizeBanCommandName(rawCommand);
    const targetProfile =
      ctx.quotedSenderProfile || (await resolveOrRegisterUser(targetJid).catch(() => null));
    const targetName = targetProfile?.primaryName || "usuario";

    await unbanCommandForUser(targetJid, normalizedCmd);

    const mappedCmd = commandMap.get(normalizedCmd);
    if (mappedCmd && mappedCmd.name !== normalizedCmd) {
      await unbanCommandForUser(targetJid, mappedCmd.name);
    }

    await ctx.sock.sendMessage(
      ctx.remoteJid,
      {
        text: `✅ *Comando desbloqueado*\n\nSe restableció el uso de *!${normalizedCmd}* para @${targetName}.`,
        mentions: [targetJid],
      },
      { quoted: ctx.msg as any }
    ).catch(() => {});
  },
};

/**
 * Alias explícito con nombre primario 'desban'.
 */
export const desbanCommand: Command = {
  ...unbanCommand,
  name: "desban",
  aliases: ["unban", "desbanear", "desbloquearcmd", "unblockcmd"],
};

/**
 * Consulta la lista de comandos bloqueados del usuario citado o propio.
 */
export const bansListCommand: Command = {
  name: "bans",
  aliases: ["comandosbaneados", "cmdlistban"],
  description: "Muestra los comandos actualmente baneados a un usuario.",
  execute: async (ctx: CommandContext) => {
    const targetJid =
      ctx.quotedSenderProfile?.jid ||
      (ctx.contextInfo?.participant ? ctx.contextInfo.participant : undefined) ||
      ctx.senderProfile?.jid ||
      "";

    if (!targetJid) return;

    const targetProfile =
      ctx.quotedSenderProfile ||
      (targetJid === ctx.senderProfile?.jid
        ? ctx.senderProfile
        : await resolveOrRegisterUser(targetJid).catch(() => null));

    const targetName = targetProfile?.primaryName || "usuario";
    const banned = getUserBannedCommands(targetJid);

    if (banned.length === 0) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `✨ @${targetName} no tiene comandos restringidos.` },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return;
    }

    const listText = banned.map((cmd) => `• !${cmd}`).join("\n");
    await ctx.sock.sendMessage(
      ctx.remoteJid,
      {
        text: `🚫 *Comandos bloqueados para @${targetName}:*\n\n${listText}`,
        mentions: [targetJid],
      },
      { quoted: ctx.msg as any }
    ).catch(() => {});
  },
};
