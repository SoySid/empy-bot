import { Command, CommandContext } from "../types.js";
import {
  normalizeSignName,
  getSignFromDate,
  parseDateString,
} from "../../services/astrology.service.js";
import { upsertUserFact } from "../../services/db/user.service.js";

export const setCumpleCommand: Command = {
  name: "setcumple",
  aliases: ["setsigno", "micumple", "misigno"],
  description: "Guarda tu fecha de cumpleaños o signo en tu perfil para el horóscopo y carta astral.",
  execute: async ({ sock, msg, remoteJid, cleanText, senderProfile }: CommandContext) => {
    const userJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const userName = senderProfile?.primaryName || "Che";

    const clean = cleanText.replace(/^[!\./]?(setcumple|setsigno|micumple|misigno)\b/i, "").trim();
    if (!clean) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🎂 *REGISTRO ASTRAL PERSONAL*\n\n` +
            `Podés registrar tu fecha o tu signo directamente:\n` +
            `👉 *!setcumple DD/MM/AAAA [HH:MM] [Ciudad]* _(ej: !setcumple 15/05/1998 14:30 Córdoba)_\n` +
            `👉 *!setcumple DD/MM* _(ej: !setcumple 15/05)_\n` +
            `👉 *!setsigno <signo>* _(ej: !setsigno escorpio)_`,
        },
        { quoted: msg as any }
      );
      return;
    }

    // 1. Probar si ingresó un signo directo
    const directSign = normalizeSignName(clean);
    if (directSign) {
      await upsertUserFact(userJid, "PERMANENTE", "signo", directSign);
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "♈", key: msg.key } }).catch(() => {});
      }
      await sock.sendMessage(
        remoteJid,
        {
          text: `✅ *¡Listo @${userName}!* Registré tu signo como *${directSign}*.\nAhora podés tirar *!horoscopo* o *!sinastria* sin tener que escribirlo.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    // 2. Probar si ingresó una fecha
    const tokens = clean.split(/\s+/);
    const dateToken = tokens.find((t) => /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/.test(t));
    if (!dateToken) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `❌ No reconocí el signo ni la fecha. Ingresá algo como \`!setcumple 15/05/1998\` o \`!setsigno tauro\`.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const parsed = parseDateString(dateToken);
    if (!parsed) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ Fecha inválida. Usá DD/MM o DD/MM/AAAA.` },
        { quoted: msg as any }
      );
      return;
    }

    const sign = getSignFromDate(parsed.day, parsed.month);
    await upsertUserFact(userJid, "PERMANENTE", "fecha_nacimiento", dateToken);
    await upsertUserFact(userJid, "PERMANENTE", "signo", sign);

    // Chequear si también pasó hora o ciudad
    const hourToken = tokens.find((t) => /^(\d{1,2}):(\d{2})$/.test(t));
    if (hourToken) {
      await upsertUserFact(userJid, "PERMANENTE", "hora_nacimiento", hourToken);
    }
    const cityTokens = tokens.filter((t) => t !== dateToken && t !== hourToken);
    if (cityTokens.length > 0) {
      await upsertUserFact(userJid, "PERMANENTE", "ciudad_nacimiento", cityTokens.join(" "));
    }

    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🎂", key: msg.key } }).catch(() => {});
    }

    await sock.sendMessage(
      remoteJid,
      {
        text: `🎂 *¡Datos guardados con éxito, @${userName}!*
📅 Cumpleaños: *${dateToken}*
♈ Signo Solar: *${sign}*${hourToken ? `\n⏰ Hora: *${hourToken}*` : ""}${cityTokens.length > 0 ? `\n📍 Ciudad: *${cityTokens.join(" ")}*` : ""}

Ya podés tirar *!horoscopo*, *!cartaastral* o *!sinastria* directamente.`,
      },
      { quoted: msg as any }
    );
  },
};
