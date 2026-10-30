import { MessageContext } from "../../handlers/types.js";
import { getTextMessageRate } from "../db/message.service.js";
import { cleanJid, extractDigits, isBotJid } from "../whatsapp-identity.js";

const PREFIX = process.env.BOT_PREFIX || "!";

// Cooldown de seguridad entre intervenciones espontáneas (15 minutos mínimo)
const SPONTANEOUS_COOLDOWN_MS = 15 * 60_000;
const SPONTANEOUS_CHANCE = 0.20; // 20% de probabilidad cuando el cooldown venció para no forzar charla
let lastInterventionTimestamp = 0;
let isPipelineBusy = false;

export function isPipelineActive(): boolean {
  return isPipelineBusy;
}

export function setPipelineActive(active: boolean): void {
  isPipelineBusy = active;
}

export function tryAcquirePipeline(): boolean {
  if (isPipelineBusy) return false;
  isPipelineBusy = true;
  return true;
}

export function releasePipeline(): void {
  isPipelineBusy = false;
}

export interface HeuristicResult {
  pass: boolean;
  isDirectCall: boolean;
  reason?: string;
}

const LOW_VALUE_REGEX =
  /^([?¿!¡\s.,;:_~()\-+*/\\]+|[a-z0-9]\s*|\b(si|no|ok|se|va|ah|uh|eh|che|bueno|dale|jaja+|jeje+|jiji+|jojo+|xd+|lol|lmao|k+|w+)\b)$/i;

const PURE_EMOJI_REGEX =
  /^[\p{Extended_Pictographic}\s\u200d\ufe0f]+$/u;

/**
 * Capa 1: Filtro Heurístico en TypeScript
 * Descarta spam, risas aisladas, comandos clásicos y valida cooldowns sin gastar un solo token.
 */
export function evaluateHeuristic(ctx: MessageContext): HeuristicResult {
  const {
    body,
    cleanBody,
    mentionedJidList,
    botDigits,
    botLidDigits,
    quotedParticipant,
    remoteJid,
  } = ctx;

  // 1. Si es un comando con prefijo (!laburar, !casino, etc.), descartar del pipeline de IA
  if (!cleanBody || cleanBody.startsWith(PREFIX)) {
    return { pass: false, isDirectCall: false, reason: "prefix_command" };
  }

  // 2. Detección de llamada directa al bot (mención explícita o respuesta/cita a un mensaje de Empy)
  const isMentioned = mentionedJidList.some((jid) => {
    if (isBotJid(ctx.sock, jid)) return true;
    const digits = extractDigits(cleanJid(jid));
    return Boolean(
      (botDigits && digits === botDigits) ||
      (botLidDigits && digits === botLidDigits)
    );
  });

  const isReplyingToBot = Boolean(
    isBotJid(ctx.sock, quotedParticipant) ||
    (() => {
      const qDigits = extractDigits(cleanJid(quotedParticipant));
      return Boolean(
        (botDigits && qDigits === botDigits) ||
        (botLidDigits && qDigits === botLidDigits)
      );
    })()
  );

  // 2b. Si el usuario cita un sticker del bot, ignorar siempre (la gente reacciona con risas al sticker y no debe responder)
  const hasQuotedSticker = Boolean(ctx.quotedMsg?.stickerMessage);
  if (hasQuotedSticker && isReplyingToBot) {
    return { pass: false, isDirectCall: false, reason: "reply_to_bot_sticker" };
  }

  const hasBotTextMention = /@?empy(-bot)?\b/i.test(cleanBody);
  const isDirectCall = isMentioned || isReplyingToBot || hasBotTextMention;

  // Si el pipeline ya está procesando una generación en curso, descartar llamadas concurrentes para no saturar
  if (isPipelineBusy) {
    return { pass: false, isDirectCall, reason: "pipeline_busy" };
  }

  // Si es llamada directa, tiene pase prioritario garantizado
  if (isDirectCall) {
    return { pass: true, isDirectCall: true };
  }

  // 3. Si es un chat privado y no fue llamada directa, ignorar
  if (!remoteJid.endsWith("@g.us")) {
    return { pass: false, isDirectCall: false, reason: "private_chat_not_allowed" };
  }

  // 4. Filtrar mensajes de longitud ínfima o emojis puros
  if (cleanBody.length < 3) {
    return { pass: false, isDirectCall: false, reason: "too_short" };
  }

  if (PURE_EMOJI_REGEX.test(cleanBody)) {
    return { pass: false, isDirectCall: false, reason: "pure_emojis" };
  }

  if (LOW_VALUE_REGEX.test(cleanBody)) {
    return { pass: false, isDirectCall: false, reason: "low_value_expression" };
  }

  // 5. Cooldown dinámico entre intervenciones espontáneas (15 minutos mínimo)
  const now = Date.now();
  if (now - lastInterventionTimestamp < SPONTANEOUS_COOLDOWN_MS) {
    return { pass: false, isDirectCall: false, reason: "cooldown_active" };
  }

  // 6. Validar que el chat tenga al menos 3 mensajes en los últimos 5 minutos
  const recentRate = getTextMessageRate(5);
  if (recentRate < 3) {
    return { pass: false, isDirectCall: false, reason: "chat_inactive" };
  }

  // 7. Compuerta probabilística: solo intervenir en 1 de cada 5 oportunidades cuando el cooldown expire
  if (Math.random() > SPONTANEOUS_CHANCE) {
    return { pass: false, isDirectCall: false, reason: "probability_gate" };
  }

  return { pass: true, isDirectCall: false };
}

export function recordInterventionTime(): void {
  lastInterventionTimestamp = Date.now();
}
