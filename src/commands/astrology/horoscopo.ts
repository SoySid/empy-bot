import { Command, CommandContext } from "../types.js";
import {
  normalizeSignName,
  getSignFromDate,
  parseDateString,
  getDailyHoroscope,
} from "../../services/astrology.service.js";
import {
  resolveOrRegisterUser,
} from "../../services/db/user.service.js";

export function extractUserSignFromFacts(facts?: { clave: string; valor: string }[]): string | null {
  if (!facts) return null;
  const signFact = facts.find((f) => f.clave.toLowerCase() === "signo")?.valor;
  if (signFact) {
    const norm = normalizeSignName(signFact);
    if (norm) return norm;
  }
  const bdayFact = facts.find((f) => f.clave.toLowerCase() === "fecha_nacimiento" || f.clave.toLowerCase() === "cumpleanos")?.valor;
  if (bdayFact) {
    const parsed = parseDateString(bdayFact);
    if (parsed) {
      return getSignFromDate(parsed.day, parsed.month);
    }
  }
  return null;
}

export const horoscopoCommand: Command = {
  name: "horoscopo",
  aliases: ["horoscope", "signo", "mihoroscopo"],
  description: "Muestra tu predicción astral del día (amor, plata, ánimo y alerta roja) según el zodíaco de Empy.",
  execute: async ({ sock, msg, remoteJid, args, senderProfile, contextInfo }: CommandContext) => {
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🔮", key: msg.key } }).catch(() => {});
    }

    let targetSign: string | null = null;
    let targetName = senderProfile?.primaryName || "Che";

    // 1. Caso A: Si se mencionó a un usuario, buscar el signo de ese usuario
    const mentionedJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;
    if (mentionedJid && (!args[0] || args[0].startsWith("@"))) {
      const targetUser = await resolveOrRegisterUser(mentionedJid);
      targetName = targetUser.primaryName;
      targetSign = extractUserSignFromFacts(targetUser.facts);
      if (!targetSign) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `🔮 @${targetName} todavía no tiene su signo registrado.\nPuede registrarlo con *!setsigno <signo>* o *!setcumple <DD/MM>*. O podés consultar directo: *!horoscopo <signo>*`,
          },
          { quoted: msg as any }
        );
        return;
      }
    }

    // 2. Caso B: Si se pasó un signo como texto (ej: !horoscopo aries)
    if (!targetSign && args.length > 0) {
      for (const arg of args) {
        const norm = normalizeSignName(arg);
        if (norm) {
          targetSign = norm;
          break;
        }
      }
    }

    // 3. Caso C: Consultar el propio perfil del remitente
    if (!targetSign) {
      targetSign = extractUserSignFromFacts(senderProfile?.facts);
    }

    // Si aún no se sabe el signo, dar instrucciones claras y simpáticas
    if (!targetSign) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🔮 *¿De qué signo sos che?*\n\n` +
            `Tirá el comando con tu signo:\n` +
            `👉 *!horoscopo <tu_signo>* _(ej: !horoscopo aries)_\n\n` +
            `💡 *O guardalo para siempre en tu perfil:*\n` +
            `👉 *!setsigno <signo>* _(ej: !setsigno escorpio)_\n` +
            `👉 *!setcumple <DD/MM>* _(ej: !setcumple 15/05)_`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const horoscopeText = await getDailyHoroscope(targetSign, targetName);
    await sock.sendMessage(remoteJid, { text: horoscopeText }, { quoted: msg as any });
  },
};
