import { Command, CommandContext } from "../types.js";
import { clearUserProfession } from "../../services/economy.service.js";
import { isBotOwner } from "../../services/admin-economy.service.js";
import { cleanJid, extractDigits } from "../../services/whatsapp-identity.js";
import { findUserByNameOrAlias, resolveOrRegisterUser, formatUserName } from "../../services/db/user.service.js";

export const borrarTrabajoCommand: Command = {
  name: "borrartrabajo",
  aliases: ["borraroficio", "renunciar", "dejartrabajo", "despedir"],
  description: "Deja sin oficio a una persona o a uno mismo para poder elegir otro con !profesion.",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";

    // Detección de objetivo: mención nativa, quoted message o nombre en argumento
    let targetJid: string | null = null;

    if (ctx.contextInfo?.mentionedJid && ctx.contextInfo.mentionedJid.length > 0) {
      targetJid = ctx.contextInfo.mentionedJid[0];
    } else if (ctx.quotedSenderProfile?.jid) {
      targetJid = ctx.quotedSenderProfile.jid;
    } else if (ctx.contextInfo?.participant) {
      targetJid = ctx.contextInfo.participant;
    } else if (ctx.args.length > 0) {
      const cleanFirst = ctx.args[0].trim().replace(/^@/, "");
      const digits = cleanFirst.replace(/\D/g, "");
      if (digits.length >= 8 && /^\d+$/.test(digits)) {
        targetJid = `${digits}@s.whatsapp.net`;
      } else {
        const matched = findUserByNameOrAlias(cleanFirst);
        if (matched) {
          targetJid = matched.jid;
        }
      }
    }

    // Si citó al propio bot, se interpreta como renuncia propia (no despido al bot)
    const botRaw = ctx.sock.user?.id ? cleanJid(ctx.sock.user.id) : null;
    const botDigits = botRaw ? extractDigits(botRaw) : null;
    if (targetJid && (targetJid === botRaw || (botDigits && targetJid.includes(botDigits)))) {
      targetJid = null;
    }

    // Si no hay objetivo especificado o el objetivo es uno mismo: renuncia propia
    let isSelf = !targetJid || targetJid === senderJid || targetJid === ctx.senderProfile?.jid;
    if (!isSelf && targetJid && ctx.senderProfile) {
      try {
        const targetUser = await resolveOrRegisterUser(targetJid);
        if (targetUser.id === ctx.senderProfile.id) {
          isSelf = true;
        }
      } catch {}
    }

    if (!isSelf) {
      // Solo Creador o admins pueden despedir a otro
      const isAdmin = isBotOwner(ctx.senderProfile, senderJid) || ctx.senderProfile?.role === "admin";
      if (!isAdmin) {
        await ctx.sock.sendMessage(
          ctx.remoteJid,
          {
            text:
              `🚫 *¡ACCESO DENEGADO!*\n\n` +
              `Solo los administradores pueden rescindir el contrato laboral de otro miembro.\n` +
              `💡 Si querés renunciar a tu propio laburo, escribí simplemente \`!borrartrabajo\` sin etiquetar a nadie.`,
          },
          { quoted: ctx.msg as any }
        );
        return;
      }

      const res = await clearUserProfession(targetJid!);
      if (!res.success) {
        await ctx.sock.sendMessage(
          ctx.remoteJid,
          { text: `⚠️ *No se pudo borrar oficio:* ${res.error}` },
          { quoted: ctx.msg as any }
        );
        return;
      }

      const targetName = formatUserName(targetJid!);
      const prevName = res.previousProfession
        ? `${res.previousProfession.icon} *${res.previousProfession.name}*`
        : "un oficio previo";

      const text =
        `📋 *¡CONTRATO LABORAL RESCINDIDO!* 📋\n\n` +
        `Por disposición administrativa, se revocó el oficio de ${targetName} (anteriormente ${prevName}).\n\n` +
        `🔓 Ahora está desempleado y puede elegir un nuevo rubro con \`!profesion <oficio>\` o consultar la lista con \`!profesion\`.`;

      await ctx.sock.sendMessage(ctx.remoteJid, {
        text,
      }, { quoted: ctx.msg as any });
      return;
    }

    // Renuncia propia del usuario
    const res = await clearUserProfession(senderJid);
    if (!res.success) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `⚠️ *No se pudo renunciar:* ${res.error}` },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const prevName = res.previousProfession
      ? `${res.previousProfession.icon} *${res.previousProfession.name}*`
      : "tu oficio";

    const text =
      `🚪 *¡RENUNCIA CONFIRMADA!* 🚪\n\n` +
      `Has dejado formalmente tu puesto de ${prevName}.\n\n` +
      `💼 Ahora estás desempleado. Tus herramientas anteriores permanecen en tu mochila.\n` +
      `✨ Podés consultar los rubros disponibles con \`!profesion\` y elegir un nuevo oficio cuando quieras con \`!profesion <nombre>\`.`;

    await ctx.sock.sendMessage(ctx.remoteJid, { text }, { quoted: ctx.msg as any });
  },
};
