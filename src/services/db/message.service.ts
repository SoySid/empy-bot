import { RawMessage } from "@prisma/client";
import { prisma } from "./prisma.js";
import { cleanJid } from "./user.service.js";
import { triggerDebouncedSynthesis, runSynthesis } from "../../workers/memory-synthesizer.js";
import { isSpamOrLowValue } from "../ai.service.js";

interface LiveMessage {
  sender: string;
  jid: string;
  text: string;
  timestamp: number;
  isBot: boolean;
  replyToSender?: string;
  replyToSnippet?: string;
  rawMsg?: any;
}

const liveBuffer: LiveMessage[] = [];
const MAX_LIVE_BUFFER = 50;
const CONTEXT_TTL_MS = 45 * 60 * 1000;
let unhandledMessageCount = 0;
let lastSynthesisTriggerTime = Date.now();
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let lastRecordedRawId: string | null = null;
let lastRecordedRawJid: string | null = null;
let lastRecordedRawTime = 0;
let lastRecordedRawBody = "";

/**
 * Reconstruye el objeto mínimo de Baileys para citar visualmente un mensaje del pasado en WhatsApp.
 */
export function buildForensicQuotedMessage(params: {
  chatJid: string;
  waMessageId: string;
  senderJid: string;
  exactText: string;
}) {
  return {
    key: {
      remoteJid: params.chatJid,
      fromMe: false,
      id: params.waMessageId,
      participant: params.senderJid,
    },
    message: {
      conversation: params.exactText,
    },
  };
}

export async function recordIncomingMessage(
  userJid: string,
  senderName: string,
  body: string,
  isBot = false,
  replyToSender?: string,
  replyToSnippet?: string,
  rawMsg?: any
): Promise<void> {
  const cleanText = body.trim().slice(0, 1500);
  if (!cleanText) return;

  const normalizedJid = cleanJid(userJid || (isBot ? "bot" : "usuario"));
  const now = Date.now();
  const cleanSenderName = senderName.trim() || (isBot ? "empy-bot" : "Integrante");
  const cleanReplySender = replyToSender?.trim() || undefined;
  const cleanReplySnippet = replyToSnippet?.trim() || undefined;

  const waMessageId = rawMsg?.key?.id || null;
  const chatJid = rawMsg?.key?.remoteJid || null;

  // Detección de ráfaga (burst) rápida del mismo remitente (< 6 segundos)
  const lastLive = liveBuffer.length > 0 ? liveBuffer[liveBuffer.length - 1] : null;
  const isBurst =
    !isBot &&
    lastLive !== null &&
    lastLive.jid === normalizedJid &&
    !lastLive.isBot &&
    now - lastLive.timestamp <= 6000 &&
    lastLive.replyToSender === cleanReplySender;

  if (isBurst && lastLive) {
    lastLive.text = `${lastLive.text} ${cleanText}`.slice(0, 2500);
    lastLive.timestamp = now;
    if (rawMsg) lastLive.rawMsg = rawMsg;
  } else {
    liveBuffer.push({
      sender: cleanSenderName,
      jid: normalizedJid,
      text: cleanText,
      timestamp: now,
      isBot,
      replyToSender: cleanReplySender,
      replyToSnippet: cleanReplySnippet,
      rawMsg: rawMsg || undefined,
    });
  }

  while (
    liveBuffer.length > MAX_LIVE_BUFFER ||
    (liveBuffer.length > 0 && now - liveBuffer[0].timestamp > CONTEXT_TTL_MS)
  ) {
    liveBuffer.shift();
  }

  // Filtro anti-basura: risas solas, stickers, emojis, mensajes del bot o comandos del sistema no se guardan en RawMessage
  if (isBot || isSpamOrLowValue(cleanText) || cleanText.startsWith("!") || cleanText.startsWith(".") || cleanText.startsWith("/")) {
    return;
  }

  const snippetClean = cleanReplySnippet ? ` "${cleanReplySnippet.slice(0, 50).replace(/[\r\n]+/g, " ")}"` : "";
  const contextNote = cleanReplySender ? ` [Respondiendo a @${cleanReplySender}${snippetClean}]` : "";

  try {
    // Si es ráfaga consecutiva en la DB (< 6s del mismo usuario), anexar al mensaje anterior para evitar fragmentación
    if (
      isBurst &&
      lastRecordedRawId &&
      lastRecordedRawJid === normalizedJid &&
      now - lastRecordedRawTime <= 6000
    ) {
      const updatedBody = `${lastRecordedRawBody} ${cleanText}`.slice(0, 2500);
      await prisma.rawMessage.update({
        where: { id: lastRecordedRawId! },
        data: { body: updatedBody },
      });
      lastRecordedRawBody = updatedBody;
      lastRecordedRawTime = now;
      return;
    }

    const created = await prisma.rawMessage.create({
      data: {
        userJid: normalizedJid,
        senderName: cleanSenderName,
        body: `${cleanText}${contextNote}`,
        waMessageId,
        chatJid,
        isBot,
      },
    });
    lastRecordedRawId = created.id;
    lastRecordedRawJid = normalizedJid;
    lastRecordedRawTime = now;
    lastRecordedRawBody = `${cleanText}${contextNote}`;

    if (!isBot) {
      unhandledMessageCount++;

      const timeSinceLast = Date.now() - lastSynthesisTriggerTime;
      // Disparar síntesis por lote (>= 35 mensajes o >= 15 minutos transcurridos)
      if (unhandledMessageCount >= 35 || (unhandledMessageCount >= 10 && timeSinceLast >= FIFTEEN_MINUTES_MS)) {
        unhandledMessageCount = 0;
        lastSynthesisTriggerTime = Date.now();
        runSynthesis().catch(() => {});
      } else {
        triggerDebouncedSynthesis();
      }
    }
  } catch (error) {
    console.error("[Message DB] Error guardando RawMessage:", error);
  }
}

export function isChatActive(minMessages = 3, withinMinutes = 5): boolean {
  const now = Date.now();
  const windowMs = withinMinutes * 60 * 1000;
  const recentCount = liveBuffer.filter((m) => !m.isBot && now - m.timestamp <= windowMs).length;
  return recentCount >= minMessages;
}

/**
 * Retorna la cantidad de mensajes de TEXTO REAL en la ventana (excluyendo bots, risas solas, stickers o fillers).
 */
export function getTextMessageRate(withinMinutes = 5): number {
  const now = Date.now();
  const windowMs = withinMinutes * 60 * 1000;
  return liveBuffer.filter(
    (m) => !m.isBot && now - m.timestamp <= windowMs && !isSpamOrLowValue(m.text)
  ).length;
}

/**
 * Retorna el timestamp del último mensaje de texto real recibido.
 */
export function getLastTextMessageTime(): number {
  for (let i = liveBuffer.length - 1; i >= 0; i--) {
    const m = liveBuffer[i];
    if (!m.isBot && !isSpamOrLowValue(m.text)) {
      return m.timestamp;
    }
  }
  return 0;
}

/**
 * Memoria a corto plazo inmediata:
 * Lee directamente los últimos 10-15 mensajes crudos del buffer en memoria.
 */
export function getRecentConversationContext(limit = 15): string {
  const now = Date.now();
  const valid = liveBuffer
    .filter((m) => now - m.timestamp <= CONTEXT_TTL_MS)
    .slice(-limit);

  if (valid.length === 0) return "Sin mensajes recientes.";

  const lines = valid.map((m, idx) => {
    const snippetClean = m.replyToSnippet ? ` "${m.replyToSnippet.slice(0, 40).replace(/[\r\n]+/g, " ")}"` : "";
    const reply = m.replyToSender ? ` (en respuesta a @${m.replyToSender}${snippetClean})` : "";
    const textSnippet = m.text.replace(/[\r\n]+/g, " ").slice(0, 500);
    return `[#${idx + 1}] [${m.sender}${reply}]: "${textSnippet}"`;
  });

  return lines.join("\n").slice(0, 4000);
}

/**
 * Retorna los mensajes recientes acompañados de su referencia cruda de mensaje para permitir citas
 */
export function getRecentLiveMessages(limit = 15): {
  sender: string;
  jid: string;
  text: string;
  rawMsg?: any;
  replyToSender?: string;
  replyToSnippet?: string;
}[] {
  const now = Date.now();
  return liveBuffer
    .filter((m) => now - m.timestamp <= CONTEXT_TTL_MS)
    .slice(-limit)
    .map((m) => ({
      sender: m.sender,
      jid: m.jid,
      text: m.text,
      rawMsg: m.rawMsg,
      replyToSender: m.replyToSender,
      replyToSnippet: m.replyToSnippet,
    }));
}

const MEMORY_SYNC_KEY = "state:memory_sync";
let memorySyncTimeCache: Date | null = null;

export async function getLastSynthesizedTime(): Promise<Date> {
  if (memorySyncTimeCache) return memorySyncTimeCache;
  try {
    const row = await prisma.baileysSession.findUnique({
      where: { key: MEMORY_SYNC_KEY },
    });
    if (row?.value) {
      const data = JSON.parse(row.value);
      if (data.lastSynthesizedAt) {
        memorySyncTimeCache = new Date(data.lastSynthesizedAt);
        return memorySyncTimeCache;
      }
    }
  } catch {}
  memorySyncTimeCache = new Date(0);
  return memorySyncTimeCache;
}

export async function setLastSynthesizedTime(date: Date): Promise<void> {
  memorySyncTimeCache = date;
  try {
    const value = JSON.stringify({ lastSynthesizedAt: date.toISOString() });
    await prisma.baileysSession.upsert({
      where: { key: MEMORY_SYNC_KEY },
      update: { value },
      create: { key: MEMORY_SYNC_KEY, value },
    });
  } catch (err) {
    console.error("[Message Service] Error guardando estado de sincronización en DB:", err);
  }
}

/**
 * Obtiene el lote de mensajes pendientes para síntesis con salvaguarda de desborde.
 * Si se acumulan más de 150 mensajes sin procesar (ráfaga extrema), poda los mensajes de baja
 * densidad y prioriza los de mayor valor semántico para ponerse al día sin saturar la cuota.
 */
export async function fetchRawMessagesBatch(limit = 35): Promise<RawMessage[]> {
  const lastTime = await getLastSynthesizedTime();
  
  const pendingCount = await prisma.rawMessage.count({
    where: { createdAt: { gt: lastTime } },
  });

  // Salvaguarda de desborde: cola mayor a 150 mensajes
  if (pendingCount > 150) {
    console.log(`[Message Service] 🌊 Desborde detectado (${pendingCount} mensajes pendientes). Aplicando poda inteligente.`);
    const rawBatch = await prisma.rawMessage.findMany({
      where: { createdAt: { gt: lastTime } },
      take: 80,
      orderBy: { createdAt: "asc" },
    });

    // Descartar mensajes extremadamente cortos (< 20 caracteres) y retener los sustanciales
    const filtered = rawBatch.filter((m) => m.body.trim().length >= 20 || m.body.includes("?"));
    return filtered.length >= limit ? filtered.slice(0, limit) : rawBatch.slice(0, limit);
  }

  return prisma.rawMessage.findMany({
    where: { createdAt: { gt: lastTime } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
}

export async function cleanupOldRawMessages(retentionHours = 168): Promise<void> {
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  await prisma.rawMessage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}

export async function deleteRawMessagesBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.rawMessage.deleteMany({
    where: { id: { in: ids } },
  });
}

export function getLiveBufferMessages(limit = 40): { senderName: string; body: string }[] {
  const now = Date.now();
  return liveBuffer
    .filter((m) => now - m.timestamp <= CONTEXT_TTL_MS && !(!m.isBot && isSpamOrLowValue(m.text)))
    .slice(-limit)
    .map((m) => {
      const reply = m.replyToSender ? ` [Respondiendo a @${m.replyToSender}]` : "";
      return {
        senderName: m.sender,
        body: `${m.text}${reply}`,
      };
    });
}
