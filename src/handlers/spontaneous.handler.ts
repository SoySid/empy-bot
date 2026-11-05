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
    // Trigger A: Roast ante tilteos, mancos o burradas de gaming
    const roastCheck = await evaluateBurrada(body);
    if (roastCheck?.shouldRoast && canSendStickerCat(roastCheck.mood)) {
      const stickerData = await getRandomLocalSticker(roastCheck.mood);
      if (stickerData) {
        await sock.sendMessage(
          remoteJid,
          { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
          { quoted: msg as any }
        );
        markStickerCat(roastCheck.mood);
        lastSpontaneousTime = now;
        return true;
      }
    }

    // Trigger B: Detección de ráfagas/escalada (3+ mensajes del mismo usuario en <90s)
    const senderKey = senderProfile.jid;
    const userTimestamps = (userRecentMessages.get(senderKey) || []).filter(
      (t) => now - t < 90 * 1000
    );
    userTimestamps.push(now);
    userRecentMessages.set(senderKey, userTimestamps);

    // Rotar dinámicamente entre categorías disponibles con cooldown respetado
    const counts = getStickerCategoryCounts();
    const SPONTANEOUS_CATS = VALID_CATEGORIES.filter((c) => c !== "triggers");
    const eligibleCats = SPONTANEOUS_CATS.filter(
      (cat) => (counts[cat] ?? 0) > 0 && canSendStickerCat(cat)
    );

    if (userTimestamps.length >= 3 && Math.random() < 0.6 && eligibleCats.length > 0) {
      const chosenCat = eligibleCats[Math.floor(Math.random() * eligibleCats.length)];
      const stickerData = await getRandomLocalSticker(chosenCat);
      if (stickerData) {
        await sock.sendMessage(
          remoteJid,
          { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
          { quoted: msg as any }
        );
        markStickerCat(chosenCat);
        userRecentMessages.set(senderKey, []); // Limpiar ráfaga
        lastSpontaneousTime = now;
        return true;
      }
    }

    return false;
  } finally {
    interventionInProgress = false;
  }
}
