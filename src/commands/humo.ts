import { Command, CommandContext } from "./types.js";
import {
  getPendingPromises,
  getSmokeRanking,
  resolveSocialPromise,
  findPendingPromiseForUser,
  createSocialPromise,
} from "../services/promise.service.js";
import { buildForensicQuotedMessage } from "../services/db/message.service.js";
import {
  normalizeToPhoneJid,
  resolveToCanonicalJid,
} from "../services/whatsapp-identity.js";
import { formatUserName, findUserByNameOrAlias, resolveOrRegisterUser } from "../services/db/user.service.js";

export const humoCommand: Command = {
  name: "humo",
  aliases: ["promesas", "promesa", "apuestas", "apuesta", "vendehumo", "escrow"],
  description: "Cazador de promesas y apuestas del grupo: ranking de vende-humo y seguimiento de compromisos.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, contextInfo, args } = ctx;

    const targetGroupJid = process.env.GROUP_JID?.replace(/['"]/g, "").trim() || "";
    const effectiveChatJid = remoteJid.endsWith("@g.us") ? remoteJid : targetGroupJid || remoteJid;

    const sub = args[0]?.toLowerCase().trim() || "lista";

    // Subcomando: Anotar / Agregar manualmente
    if (["agregar", "anotar", "registrar", "prometo", "nueva"].includes(sub)) {
      const quotedText =
        contextInfo?.quotedMessage?.conversation ||
        contextInfo?.quotedMessage?.extendedTextMessage?.text ||
        "";
      const promiseText = args.slice(1).join(" ").trim() || quotedText;

      if (!promiseText) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `💨 *Uso:* Citá un mensaje o escribí: \`!humo anotar <promesa>\``,
          },
          { quoted: msg as any }
        );
        return;
      }

      let targetJid = contextInfo?.participant
        ? normalizeToPhoneJid(contextInfo.participant)
        : ctx.senderProfile?.jid || "";
      if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
        targetJid = normalizeToPhoneJid(contextInfo.mentionedJid[0]);
      }

      const canonicalJid = await resolveToCanonicalJid(targetJid);
      const targetUser = await resolveOrRegisterUser(canonicalJid);

      await createSocialPromise({
        chatJid: effectiveChatJid,
        userJid: canonicalJid,
        senderName: targetUser.primaryName,
        promiseText,
        waMessageId: msg.key?.id || undefined,
      });

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✍️", key: msg.key } }).catch(() => {});
      }

      await sock.sendMessage(
        remoteJid,
        {
          text: `✍️ *Promesa anotada:* @${targetUser.primaryName} se comprometió a: "${promiseText}".\n\n_Para consultar la lista de promesas: \`!humo\`_`,
          mentions: [canonicalJid],
        },
        { quoted: msg as any }
      );
      return;
    }

    // Subcomando A: Ranking de Vende-Humo
    if (sub === "ranking" || sub === "top") {
      const ranking = await getSmokeRanking(effectiveChatJid);
      if (ranking.length === 0) {
        await sock.sendMessage(
          remoteJid,
          {
            text: "💨 *Ranking de Vende-Humo Vacío:* No hay promesas ni apuestas resueltas todavía en este chat. Apenas alguien cumpla o rompa una promesa, aparecerá acá.",
          },
          { quoted: msg as any }
        );
        return;
      }

      const medals = ["🥇", "🥈", "🥉", "💨", "💨"];
      const lines = ranking.slice(0, 10).map((r, i) => {
        const medal = medals[i] || "💨";
        return `${medal} *#${i + 1} ${r.senderName}* — ${r.smokePercentage}% humo (${r.broken} rotas / ${r.total} totales)`;
      });

      await sock.sendMessage(
        remoteJid,
        {
          text: `💨 *TABLA OFICIAL DE VENDE-HUMO (EMPYREAL)* 💨\n\n${lines.join(
            "\n"
          )}\n\n_Para cobrar o marcar una promesa: !humo cumplio @usuario o !humo vendio @usuario_`,
        },
        { quoted: msg as any }
      );
      return;
    }

    // Subcomando B: Marcar Cumplida o Rota
    if (["cumplio", "cumplió", "pago", "pagó", "vendio", "vendió", "rompio", "rompió"].includes(sub)) {
      const isFulfilled = ["cumplio", "cumplió", "pago", "pagó"].includes(sub);

      let targetJid: string | null = null;
      if (contextInfo?.participant) {
        targetJid = normalizeToPhoneJid(contextInfo.participant);
      } else if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
        targetJid = normalizeToPhoneJid(contextInfo.mentionedJid[0]);
      } else if (args[1]) {
        const query = args[1].replace(/^@/, "").trim();
        const found = findUserByNameOrAlias(query);
        if (found) targetJid = found.jid;
      }

      if (!targetJid) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `💨 *Uso:* Citá el mensaje de la persona o mencionala: \`!humo ${sub} @usuario\``,
          },
          { quoted: msg as any }
        );
        return;
      }

      const canonicalJid = await resolveToCanonicalJid(targetJid);
      const targetName = formatUserName(canonicalJid).replace(/\*/g, "");
      const pending = await findPendingPromiseForUser(effectiveChatJid, canonicalJid);

      if (!pending) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `💨 No hay promesas pendientes registradas para @${targetName} en este grupo.`,
            mentions: [canonicalJid],
          },
          { quoted: msg as any }
        );
        return;
      }

      await resolveSocialPromise(pending.id, isFulfilled ? "FULFILLED" : "BROKEN");

      const replyQuote = pending.waMessageId
        ? buildForensicQuotedMessage({
            chatJid: effectiveChatJid,
            waMessageId: pending.waMessageId,
            senderJid: canonicalJid,
            exactText: pending.promiseText,
          })
        : msg;

      if (isFulfilled) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `🤝 *PROMESA CUMPLIDA:* @${targetName} cumplió con su palabra: "${pending.promiseText}". La credibilidad sigue intacta.`,
            mentions: [canonicalJid],
          },
          { quoted: replyQuote as any }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          {
            text: `🚨 *VENDE-HUMO CONFIRMADO:* @${targetName} no cumplió con: "${pending.promiseText}". Se computa un punto más al ranking de humo.`,
            mentions: [canonicalJid],
          },
          { quoted: replyQuote as any }
        );
      }
      return;
    }

    // Subcomando C: Lista de Promesas Pendientes en el Chat
    const pendingList = await getPendingPromises(effectiveChatJid, 8);
    if (pendingList.length === 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `👀 *No hay promesas ni apuestas pendientes en el chat.* Cuando alguien diga "prometo que...", "apuesto que..." o "si apruebo pago las pizzas", le voy a clavar el ojo en el acto.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const lines = pendingList.map((p, i) => {
      const days = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const ageStr = days === 0 ? "hoy" : `hace ${days} días`;
      return `• *#${i + 1} ${p.senderName}* (${ageStr}):\n  "${p.promiseText}"`;
    });

    await sock.sendMessage(
      remoteJid,
      {
        text: `👀 *PROMESAS Y APUESTAS ACTIVAS EN EL GRUPO* (${pendingList.length}):\n\n${lines.join(
          "\n\n"
        )}\n\n_Para resolver una promesa: !humo cumplio @usuario o !humo vendio @usuario_\n_Para ver la tabla de humo: !humo ranking_`,
      },
      { quoted: msg as any }
    );
  },
};
