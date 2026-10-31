import { prisma } from "./db/prisma.js";
import { cleanJid } from "./db/user.service.js";

export interface SocialPromiseRecord {
  id: string;
  chatJid: string;
  userJid: string;
  senderName: string;
  promiseText: string;
  condition: string | null;
  waMessageId: string | null;
  status: "PENDING" | "FULFILLED" | "BROKEN";
  dueDate: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface SmokeRankingEntry {
  userJid: string;
  senderName: string;
  total: number;
  fulfilled: number;
  broken: number;
  smokePercentage: number;
}

// Regex de alta precisión para detectar compromisos o apuestas en primera persona
const PROMISE_TRIGGER_REGEX =
  /\b(prometo(\s+que)?|te\s+prometo|les\s+prometo|juro\s+que|te\s+juro(\s+que)?|les\s+juro(\s+que)?|doy\s+mi\s+palabra|me\s+comprometo\s+a|apuesto(\s+que)?|te\s+apuesto|les\s+apuesto|si\s+(apruebo|paso|pierdo|gano|termino)|mañana\s+(subo|paso|hago|voy|lo\s+hago)|hoy\s+(subo|paso|lo\s+hago)|pago\s+(las?\s+)?(pizzas?|birras?|coca|escabio|asado|cena|comida|tragos?|fernet|merienda|medialunas))\b/i;

/**
 * Evalúa si un mensaje humano contiene una declaración de promesa o apuesta social verificable.
 */
export function detectPromiseIntent(text: string): boolean {
  // Ignorar citas previas incrustadas
  const clean = text.replace(/\[Respondiendo a [^\]]+\]/gi, "").trim();
  if (clean.length < 6 || clean.length > 350) return false;
  return PROMISE_TRIGGER_REGEX.test(clean);
}

/**
 * Registra una promesa social en la base de datos.
 */
export async function createSocialPromise(data: {
  chatJid: string;
  userJid: string;
  senderName: string;
  promiseText: string;
  condition?: string;
  waMessageId?: string;
  dueDate?: Date;
}): Promise<SocialPromiseRecord> {
  const cleanUserJid = cleanJid(data.userJid);
  const cleanText = data.promiseText.trim();

  // Evitar duplicados idénticos en una ventana de 5 minutos
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const existing = await prisma.socialPromise.findFirst({
    where: {
      chatJid: data.chatJid,
      userJid: cleanUserJid,
      promiseText: cleanText,
      status: "PENDING",
      createdAt: { gte: fiveMinAgo },
    },
  });
  if (existing) return existing as unknown as SocialPromiseRecord;

  const created = await prisma.socialPromise.create({
    data: {
      chatJid: data.chatJid,
      userJid: cleanUserJid,
      senderName: data.senderName.trim() || "Integrante",
      promiseText: cleanText,
      condition: data.condition?.trim() || null,
      waMessageId: data.waMessageId || null,
      status: "PENDING",
      dueDate: data.dueDate || null,
    },
  });

  return created as unknown as SocialPromiseRecord;
}

/**
 * Obtiene las promesas pendientes de un grupo.
 */
export async function getPendingPromises(chatJid: string, limit = 10): Promise<SocialPromiseRecord[]> {
  const rows = await prisma.socialPromise.findMany({
    where: {
      chatJid,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows as unknown as SocialPromiseRecord[];
}

/**
 * Resuelve una promesa marcándola como cumplida o rota.
 */
export async function resolveSocialPromise(
  promiseId: string,
  newStatus: "FULFILLED" | "BROKEN"
): Promise<SocialPromiseRecord | null> {
  try {
    const updated = await prisma.socialPromise.update({
      where: { id: promiseId },
      data: {
        status: newStatus,
        resolvedAt: new Date(),
      },
    });
    return updated as unknown as SocialPromiseRecord;
  } catch (error) {
    console.error("[Promise Service] Error actualizando promesa:", error);
    return null;
  }
}

/**
 * Elimina una promesa pendiente de la base de datos (cancelación sin penalización).
 */
export async function deleteSocialPromise(promiseId: string): Promise<boolean> {
  try {
    await prisma.socialPromise.delete({
      where: { id: promiseId },
    });
    return true;
  } catch (error) {
    console.error("[Promise Service] Error eliminando promesa:", error);
    return false;
  }
}

/**
 * Busca promesas pendientes para un usuario particular dentro de un chat.
 */
export async function findPendingPromiseForUser(
  chatJid: string,
  userJid: string
): Promise<SocialPromiseRecord | null> {
  const row = await prisma.socialPromise.findFirst({
    where: {
      chatJid,
      userJid: cleanJid(userJid),
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
  });

  return row as unknown as SocialPromiseRecord | null;
}

/**
 * Calcula el Ranking de Vende-Humo del chat basado en la proporción de promesas rotas.
 */
export async function getSmokeRanking(chatJid: string): Promise<SmokeRankingEntry[]> {
  const allRecords = await prisma.socialPromise.findMany({
    where: {
      chatJid,
      status: { in: ["FULFILLED", "BROKEN"] },
    },
  });

  const statsMap = new Map<
    string,
    { userJid: string; senderName: string; fulfilled: number; broken: number }
  >();

  for (const record of allRecords) {
    const entry = statsMap.get(record.userJid) || {
      userJid: record.userJid,
      senderName: record.senderName,
      fulfilled: 0,
      broken: 0,
    };

    if (record.status === "FULFILLED") entry.fulfilled++;
    if (record.status === "BROKEN") entry.broken++;

    statsMap.set(record.userJid, entry);
  }

  const ranking: SmokeRankingEntry[] = [];

  for (const data of statsMap.values()) {
    const total = data.fulfilled + data.broken;
    const smokePercentage = total > 0 ? Math.round((data.broken / total) * 100) : 0;
    ranking.push({
      userJid: data.userJid,
      senderName: data.senderName,
      total,
      fulfilled: data.fulfilled,
      broken: data.broken,
      smokePercentage,
    });
  }

  // Ordenar de mayor a menor porcentaje de humo
  return ranking.sort((a, b) => b.smokePercentage - a.smokePercentage || b.broken - a.broken);
}

/**
 * Revisa promesas pendientes con fecha límite vencida para cobrar en el grupo.
 */
export async function getExpiredPendingPromises(): Promise<SocialPromiseRecord[]> {
  const now = new Date();
  const rows = await prisma.socialPromise.findMany({
    where: {
      status: "PENDING",
      dueDate: {
        not: null,
        lte: now,
      },
    },
    take: 5,
  });

  return rows as unknown as SocialPromiseRecord[];
}
