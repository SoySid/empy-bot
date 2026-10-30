import { Command, CommandContext } from "../types.js";
import {
  normalizeSignName,
  getSynastryReading,
} from "../../services/astrology.service.js";
import {
  resolveOrRegisterUser,
  findUserByNameOrAlias,
  formatUserName,
} from "../../services/db/user.service.js";
import { extractUserSignFromFacts } from "./horoscopo.js";

export const sinastriaCommand: Command = {
  name: "sinastria",
  aliases: ["compatibilidad", "matchastral", "parejaastral"],
  description: "Compara la química y compatibilidad astral entre vos y otro integrante del grupo.",
  execute: async ({ sock, msg, remoteJid, args, senderProfile, contextInfo }: CommandContext) => {
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "💫", key: msg.key } }).catch(() => {});
    }

    const nameA = senderProfile?.primaryName || "Vos";
    let signA = extractUserSignFromFacts(senderProfile?.facts);

    let targetUser: any = null;
    const mentionedJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;

    if (mentionedJid) {
      targetUser = await resolveOrRegisterUser(mentionedJid);
    } else if (args.length > 0) {
      const query = args[0].replace("@", "");
      targetUser = findUserByNameOrAlias(query);
    }

    if (!targetUser) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `💫 *SINASTRÍA Y COMPATIBILIDAD ASTRAL*\n\n` +
            `Etiquetá o nombrá al integrante con quien querés chequear compatibilidad:\n` +
            `👉 *!sinastria @usuario*\n` +
            `👉 *!compatibilidad @usuario*`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const nameB = targetUser.primaryName || formatUserName(targetUser.jid);
    let signB = extractUserSignFromFacts(targetUser.facts);

    // Si los signos no están en los perfiles, permitir pasarlos en los args (ej: !sinastria @cris aries leo)
    if (!signA || !signB) {
      const explicitSigns = args
        .map((a) => normalizeSignName(a))
        .filter((s): s is string => Boolean(s));

      if (!signA && explicitSigns.length > 0) {
        signA = explicitSigns.shift() || null;
      }
      if (!signB && explicitSigns.length > 0) {
        signB = explicitSigns.shift() || null;
      }
    }

    if (!signA || !signB) {
      const missing: string[] = [];
      if (!signA) missing.push(`@${nameA}`);
      if (!signB) missing.push(`@${nameB}`);

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `💫 *Falta conocer el signo de:* ${missing.join(" y ")}.\n\n` +
            `Registralo con *!setsigno <signo>* o pasalos en el comando:\n` +
            `👉 *!sinastria @${nameB} <tu_signo> <su_signo>*`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const synastryText = await getSynastryReading(nameA, signA, nameB, signB);
    await sock.sendMessage(remoteJid, { text: synastryText }, { quoted: msg as any });
  },
};
