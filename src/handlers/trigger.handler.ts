import { getTriggerSticker, getAvailableTriggerPrefixes } from "../services/sticker.service.js";
import { MessageContext } from "./types.js";

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

  // 1. Reglas fijas especiales
  for (const rule of TRIGGER_RULES) {
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
    const cleanPrefix = prefix
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Buscar coincidencia de palabra completa
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(cleanPrefix)}([^a-z0-9]|$)`, "i");

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
