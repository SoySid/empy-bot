import { Command, CommandContext } from "./types.js";
import {
  ANIME_REACTIONS,
  REACTION_ALIASES,
  fetchOtakuGifBuffer,
} from "../services/otakugifs.service.js";
import {
  resolveOrRegisterUser,
  findUserByNameOrAlias,
  parseOutboundMentions,
} from "../services/db/user.service.js";

export const ALL_REACTION_NAMES = [
  ...Object.keys(ANIME_REACTIONS),
  ...Object.keys(REACTION_ALIASES),
];

export const reactionCommand: Command = {
  name: "interaccion",
  aliases: ALL_REACTION_NAMES,
  description: "Envía GIFs animados de anime con menciones y frases personalizadas.",
  execute: async ({ sock, msg, remoteJid, contextInfo }: CommandContext) => {
    const rawBody =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    // 1. Detectar comando invocado
    const parts = rawBody.trim().split(/\s+/);
    const firstWord = parts[0].replace(/^!/, "").toLowerCase();
    const textArgument = parts.slice(1).join(" ").trim();

    const resolvedKey = REACTION_ALIASES[firstWord] || firstWord;
    const reactionCfg = ANIME_REACTIONS[resolvedKey];

    if (!reactionCfg) return;

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🎬", key: msg.key } });
      }

      // 2. Identificar al emisor
      const senderRaw = (msg.key?.participant || msg.key?.remoteJid || "") as string;
      const senderProfile = await resolveOrRegisterUser(senderRaw, msg.pushName);
      const senderName = senderProfile.primaryName || "Alguien";

      // 3. Identificar al objetivo (1° por mención @, 2° por citado, 3° por texto escrito)
      const mentionedJids = contextInfo?.mentionedJid || [];
      const quotedParticipant = contextInfo?.participant || "";

      let targetProfile = null;
      let rawTargetText = "";

      if (mentionedJids.length > 0) {
        targetProfile = await resolveOrRegisterUser(mentionedJids[0]);
      } else if (quotedParticipant) {
        targetProfile = await resolveOrRegisterUser(quotedParticipant);
      } else if (textArgument) {
        targetProfile = findUserByNameOrAlias(textArgument);
        if (!targetProfile) {
          rawTargetText = textArgument.replace(/^@/, "");
        }
      }

      // 4. Armar el texto con la etiqueta (@Nombre)
      let targetTag = "";
      if (targetProfile) {
        targetTag = `@${targetProfile.primaryName}`;
      } else if (rawTargetText) {
        targetTag = `@${rawTargetText}`;
      }

      let rawCaption = "";
      if (targetTag && (!targetProfile || targetProfile.jid !== senderProfile.jid)) {
        const phraseList = reactionCfg.targetTexts(senderName, targetTag);
        rawCaption = phraseList[Math.floor(Math.random() * phraseList.length)];
      } else {
        const phraseList = reactionCfg.soloTexts(senderName);
        rawCaption = phraseList[Math.floor(Math.random() * phraseList.length)];
      }

      // 5. Parsear menciones reales para WhatsApp
      const { formattedText, mentions } = parseOutboundMentions(rawCaption);

      // 6. Descargar el archivo
      const videoBuffer = await fetchOtakuGifBuffer(reactionCfg.apiReaction);

      if (!videoBuffer) {
        await sock.sendMessage(
          remoteJid,
          { text: "❌ No pude obtener la animación en este momento." },
          { quoted: msg as any }
        );
        return;
      }

      // 7. Enviar GIF en bucle con la mención azul clickable
      await sock.sendMessage(
        remoteJid,
        {
          video: videoBuffer,
          gifPlayback: true,
          caption: formattedText,
          mentions: Array.from(new Set(mentions)),
        },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Reaction Command] Error ejecutando comando de interacción:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Falló el envío del gif de anime." },
        { quoted: msg as any }
      );
    }
  },
};