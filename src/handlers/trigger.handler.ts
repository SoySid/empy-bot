import { getTriggerSticker, getAvailableTriggerPrefixes } from "../services/sticker.service.js";
import { MessageContext } from "./types.js";
import { isUserCommandBanned } from "../services/command-ban.service.js";

// Reglas fijas especiales para palabras compuestas o variaciones fonéticas
export const TRIGGER_RULES: { pattern: RegExp; prefix: string }[] = [
  { pattern: /\bverg[uü]enza\b/i, prefix: "vergue" },
  { pattern: /\bkeke\b/i, prefix: "keke" },
  { pattern: /\brose{1,2}\b/i, prefix: "rose" },
  { pattern: /\bbuen(os)?\s+d[ií]as?\b/i, prefix: "buendia" },
  { pattern: /\bme\s+das\b/i, prefix: "medas" },
  { pattern: /\bfestejo\b/i, prefix: "festejo" },
];

const PREFIX: string = process.env.BOT_PREFIX || "!";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Procesa triggers automáticos basados en palabras clave y envía el sticker correspondiente.
 * Soporta reglas especiales y triggers dinámicos creados desde WhatsApp con !sticker triggers <palabra>.
 */
export async function handleTriggerStickers(ctx: MessageContext): Promise<boolean> {
  if (!ctx.cleanBody || ctx.cleanBody.startsWith(PREFIX)) {
    return false;
  }

  // Si el mensaje está dirigido directamente al bot (mención explícita o respuesta directa),
  // no debe ser interceptado por triggers de stickers para permitir que el bot responda con IA.
  const hasBotTextMention = /@?empy(-bot)?\b/i.test(ctx.cleanBody);
  const isDirectlyAddressed = Boolean(
    hasBotTextMention ||
    (ctx.botDigits && ctx.quotedParticipant.includes(ctx.botDigits)) ||
    (ctx.botLidDigits && ctx.quotedParticipant.includes(ctx.botLidDigits)) ||
    ctx.mentionedJidList.some((j) => (ctx.botDigits && j.includes(ctx.botDigits)) || (ctx.botLidDigits && j.includes(ctx.botLidDigits)))
  );

  if (isDirectlyAddressed) {
    return false;
  }

  const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
  if (isUserCommandBanned(senderJid, "triggers", "stickertriggers", "stickers", "sticker")) {
    return false;
  }

  // 1. Reglas fijas especiales
  for (const rule of TRIGGER_RULES) {
    if (isUserCommandBanned(senderJid, rule.prefix)) continue;
    if (rule.pattern.test(ctx.cleanBody)) {
      const stickerData = await getTriggerSticker(rule.prefix);
      if (stickerData) {
        try {
          await ctx.sock.sendMessage(
            ctx.remoteJid,
            { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
            { quoted: ctx.msg as any }
          );
          return true;
        } catch (err) {
          console.error(`[Trigger Handler] Error enviando sticker para regla "${rule.prefix}":`, err);
        }
      }
    }
  }

  // 2. Triggers dinámicos según archivos existentes en stickers/triggers/ (ej: leo, leo2, etc.)
  const normalizedBody = ctx.cleanBody
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const dynamicPrefixes = await getAvailableTriggerPrefixes();

  for (const prefix of dynamicPrefixes) {
    if (isUserCommandBanned(senderJid, prefix)) continue;
    const cleanPrefix = prefix
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Buscar coincidencia de palabra completa o frases compuestas (ej: "me_das", "que_onda")
    const escapedParts = cleanPrefix
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .map(escapeRegex);
    const pattern = new RegExp(`(^|[^a-z0-9])${escapedParts.join("\\s+")}([^a-z0-9]|$)`, "i");

    if (pattern.test(normalizedBody)) {
      const stickerData = await getTriggerSticker(prefix);
      if (stickerData) {
        try {
          await ctx.sock.sendMessage(
            ctx.remoteJid,
            { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
            { quoted: ctx.msg as any }
          );
          return true;
        } catch (err) {
          console.error(`[Trigger Handler] Error enviando sticker para prefijo dinámico "${prefix}":`, err);
        }
      }
    }
  }

  return false;
}
