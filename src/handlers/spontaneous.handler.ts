import { evaluateBurrada, isSpamOrLowValue } from "../services/ai.service.js";
import { getTextMessageRate, isChatActive } from "../services/db/message.service.js";
import { getRandomLocalSticker, VALID_CATEGORIES, getStickerCategoryCounts } from "../services/sticker.service.js";
import { MessageContext } from "./types.js";

const PREFIX: string = process.env.BOT_PREFIX || "!";

// Buffer en memoria de timestamps por emisor para detectar ráfagas/escaladas
const userRecentMessages = new Map<string, number[]>();

// Lock para evitar doble-disparo simultáneo cuando llegan mensajes casi al mismo tiempo
let interventionInProgress = false;
let lastSpontaneousTime = 0;
const SPONTANEOUS_COOLDOWN_MS = 60_000; // 1 minuto entre stickers espontáneos

// Cooldown por categoría de sticker (evita mandar 3 veces el mismo tipo seguido)
const STICKER_CAT_COOLDOWN_MS = 45_000;
const lastStickerByCat = new Map<string, number>();

function canSendStickerCat(cat: string): boolean {
  const last = lastStickerByCat.get(cat) ?? 0;
  return Date.now() - last >= STICKER_CAT_COOLDOWN_MS;
}

function markStickerCat(cat: string): void {
  lastStickerByCat.set(cat, Date.now());
}

/**
 * Evalúa si un mensaje merece una reacción espontánea basada en heurística sin LLM
 * (roast a mancos, tilteos, ráfagas de usuarios).
 */
export async function handleSpontaneousReaction(ctx: MessageContext): Promise<boolean> {
  const { sock, msg, remoteJid, body, senderProfile } = ctx;

  if (!body || body.startsWith(PREFIX)) {
    return false;
  }

  // 1. Filtrar mensajes de bajo valor (risas solas o emojis no disparan intervención)
  if (isSpamOrLowValue(body)) {
    return false;
  }

  const now = Date.now();

  // 2. Respetar cooldown espontáneo
  if (now - lastSpontaneousTime < SPONTANEOUS_COOLDOWN_MS) {
    return false;
  }

  // Solo intervenir espontáneamente si el chat está activo con al menos 2 mensajes reales
  if (!isChatActive(2, 4)) {
    return false;
  }

  // 3. Lock anti-doble-disparo: si ya hay una intervención en curso, descartar
  if (interventionInProgress) {
    return false;
  }
  interventionInProgress = true;

  try {
    // Categorías elegibles con stickers reales y con cooldown respetado
    const counts = getStickerCategoryCounts();
    const SPONTANEOUS_CATS = VALID_CATEGORIES.filter((c) => c !== "triggers");
    let eligibleCats = SPONTANEOUS_CATS.filter(
      (cat) => (counts[cat] ?? 0) > 0 && canSendStickerCat(cat)
    );

    // Si todas las categorías entraron en cooldown, liberar cooldowns de categorías para seguir rotando
    if (eligibleCats.length === 0) {
      eligibleCats = SPONTANEOUS_CATS.filter((c) => (counts[c] ?? 0) > 0);
      lastStickerByCat.clear();
    }

    if (eligibleCats.length === 0) {
      return false;
    }

    // Evaluación: mayor probabilidad si detecta tilteo/burrada (70%), o probabilidad natural (25%) en chat activo
    const roastCheck = await evaluateBurrada(body);
    const triggerChance = roastCheck?.shouldRoast ? 0.7 : 0.25;

    if (Math.random() < triggerChance) {
      // Selección equilibrada y puramente aleatoria entre todas las categorías disponibles
      const chosenCat = eligibleCats[Math.floor(Math.random() * eligibleCats.length)];
      const stickerData = await getRandomLocalSticker(chosenCat);

      if (stickerData) {
        await sock.sendMessage(
          remoteJid,
          { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
          { quoted: msg as any }
        );
        markStickerCat(chosenCat);
        lastSpontaneousTime = now;
        return true;
      }
    }

    return false;
  } finally {
    interventionInProgress = false;
  }
}
