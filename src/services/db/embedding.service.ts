import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const EMBEDDING_MODEL = "gemini-embedding-001";
const FALLBACK_EMBEDDING_MODEL = "text-embedding-004";
const TARGET_DIMENSIONS = 768;
const MAX_EMBEDDINGS_RETENTION = 300;

export interface SearchMatch {
  senderName: string;
  body: string;
  createdAt: Date;
  similarity: number;
}

export interface ForensicStatementMatch {
  id: string;
  senderName: string;
  body: string;
  waMessageId: string | null;
  chatJid: string | null;
  createdAt: Date;
  similarity?: number;
  source: "vector" | "raw";
}

/**
 * Genera un vector de 768 dimensiones utilizando el modelo oficial de embeddings de Gemini en Google AI Studio.
 * Admite taskType (RETRIEVAL_DOCUMENT para indexar hechos o mensajes, RETRIEVAL_QUERY para consultas de búsqueda).
 */
export async function generateTextEmbedding(
  text: string,
  taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
): Promise<number[] | null> {
  const cleanText = text.trim();
  if (!cleanText || cleanText.length < 3) return null;

  const models = [EMBEDDING_MODEL, FALLBACK_EMBEDDING_MODEL];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
      const payload: any = {
        model: `models/${model}`,
        content: {
          parts: [{ text: cleanText.slice(0, 1000) }],
        },
        outputDimensionality: TARGET_DIMENSIONS,
      };

      if (taskType) {
        payload.taskType = taskType;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (data.embedding?.values && data.embedding.values.length === TARGET_DIMENSIONS) {
        return data.embedding.values;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Guarda una anécdota o mensaje memorable en Neon PostgreSQL con su embedding nativo en pgvector
 * e identificador forense waMessageId para citas automáticas.
 */
export async function saveMessageEmbedding(
  userJid: string,
  senderName: string,
  body: string,
  waMessageId?: string,
  chatJid?: string
): Promise<void> {
  try {
    const cleanBody = body.trim();
    if (cleanBody.length < 10) return;

    const vector = await generateTextEmbedding(cleanBody, "RETRIEVAL_DOCUMENT");
    if (!vector) return;

    const vectorStr = `[${vector.join(",")}]`;
    const id = randomUUID();

    // Inserción raw en PostgreSQL utilizando el tipo nativo vector(768)
    await prisma.$executeRaw`
      INSERT INTO "MessageEmbedding" ("id", "userJid", "senderName", "body", "waMessageId", "chatJid", "vector", "embedding", "createdAt")
      VALUES (${id}, ${userJid}, ${senderName}, ${cleanBody}, ${waMessageId || null}, ${chatJid || null}, ${vectorStr}, ${vectorStr}::vector, NOW());
    `;

    // Retención máxima de 300 recuerdos históricos
    const totalCount = await prisma.messageEmbedding.count();
    if (totalCount > MAX_EMBEDDINGS_RETENTION) {
      const oldRecords = await prisma.messageEmbedding.findMany({
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: totalCount - MAX_EMBEDDINGS_RETENTION,
      });
      const idsToDelete = oldRecords.map((r) => r.id);
      await prisma.messageEmbedding.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  } catch (error) {
    console.error("[Embedding Service] Error guardando embedding en Neon DB:", error);
  }
}

/**
 * Búsqueda semántica de recuerdos históricos en PostgreSQL mediante distancia coseno (<=>).
 */
export async function searchRelevantPastMessages(
  query: string,
  limit = 2,
  minSimilarity = 0.55
): Promise<SearchMatch[]> {
  try {
    const queryVector = await generateTextEmbedding(query, "RETRIEVAL_QUERY");
    if (!queryVector) return [];

    const vectorStr = `[${queryVector.join(",")}]`;

    // Consulta raw con pgvector usando el operador de distancia coseno (<=>)
    const rawResults = await prisma.$queryRaw<any[]>`
      SELECT
        "id",
        "senderName",
        "body",
        "createdAt",
        (1 - ("embedding" <=> ${vectorStr}::vector))::float AS similarity
      FROM "MessageEmbedding"
      WHERE "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vectorStr}::vector ASC
      LIMIT ${limit};
    `;

    const matches: SearchMatch[] = [];

    for (const r of rawResults) {
      const sim = Number(r.similarity ?? 0);
      if (sim >= minSimilarity) {
        matches.push({
          senderName: r.senderName,
          body: r.body,
          createdAt: new Date(r.createdAt),
          similarity: sim,
        });
      }
    }

    return matches;
  } catch (error) {
    console.error("[Embedding Service] Error en búsqueda semántica con pgvector:", error);
    return [];
  }
}

export interface SearchForensicOptions {
  excludeWaMessageId?: string;
  limit?: number;
  vectorQuery?: string;
}

/**
 * Búsqueda forense de declaraciones pasadas de un usuario específico para el Fiscal de Contradicciones.
 * Busca coincidencias precisas por palabras clave en RawMessage y por proximidad semántica en MessageEmbedding.
 */
export async function searchUserPastStatements(
  userJidOrList: string | string[],
  keywordsOrQuery: string | string[],
  options?: SearchForensicOptions
): Promise<ForensicStatementMatch[]> {
  const matches: ForensicStatementMatch[] = [];
  const seenTexts = new Set<string>();
  const seenIds = new Set<string>();

  const jidList = (Array.isArray(userJidOrList) ? userJidOrList : [userJidOrList]).filter(Boolean);
  if (jidList.length === 0) return [];

  const limit = options?.limit || 8;
  const excludeWaId = options?.excludeWaMessageId?.trim() || "";

  // Normalizar palabras clave
  let rawKeywords: string[] = [];
  if (Array.isArray(keywordsOrQuery)) {
    rawKeywords = keywordsOrQuery;
  } else if (typeof keywordsOrQuery === "string") {
    rawKeywords = keywordsOrQuery.split(/\s+/);
  }
  const keywords = rawKeywords
    .map((k) => k.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, "").trim())
    .filter((k) => k.length >= 3);

  try {
    // 1. Búsqueda en RawMessage con los términos de búsqueda (ILIKE / contains insensitive)
    if (keywords.length > 0) {
      const orConditions = keywords.map((kw) => ({
        body: { contains: kw, mode: "insensitive" as const },
      }));

      const rawRows = await prisma.rawMessage.findMany({
        where: {
          userJid: { in: jidList },
          isBot: false,
          waMessageId: excludeWaId ? { not: excludeWaId } : { not: null },
          OR: orConditions,
        },
        orderBy: { createdAt: "desc" },
        take: limit * 3,
      });

      for (const r of rawRows) {
        if (!r.waMessageId || seenIds.has(r.waMessageId)) continue;
        const normBody = r.body.toLowerCase().trim();
        if (seenTexts.has(normBody)) continue;

        seenIds.add(r.waMessageId);
        seenTexts.add(normBody);
        matches.push({
          id: r.id,
          senderName: r.senderName,
          body: r.body,
          waMessageId: r.waMessageId,
          chatJid: r.chatJid,
          createdAt: r.createdAt,
          source: "raw",
        });

        if (matches.length >= limit) break;
      }
    }

    // 2. Búsqueda semántica con pgvector si hay vectorQuery y aún hay cupo
    const vectorText = options?.vectorQuery?.trim() || (keywords.length > 0 ? keywords.join(" ") : "");
    if (vectorText.length >= 4 && matches.length < limit) {
      const queryVector = await generateTextEmbedding(vectorText, "RETRIEVAL_QUERY");
      if (queryVector) {
        const vectorStr = `[${queryVector.join(",")}]`;
        const rawVectorResults = await prisma.$queryRaw<any[]>`
          SELECT
            "id",
            "senderName",
            "body",
            "waMessageId",
            "chatJid",
            "createdAt",
            (1 - ("embedding" <=> ${vectorStr}::vector))::float AS similarity
          FROM "MessageEmbedding"
          WHERE "embedding" IS NOT NULL
            AND "userJid" IN (${Prisma.join(jidList)})
            ${excludeWaId ? Prisma.sql`AND "waMessageId" != ${excludeWaId}` : Prisma.empty}
          ORDER BY "embedding" <=> ${vectorStr}::vector ASC
          LIMIT ${limit};
        `;

        for (const row of rawVectorResults) {
          const sim = Number(row.similarity ?? 0);
          const cleanBody = (row.body || "").toLowerCase().trim();
          if (sim >= 0.50 && row.waMessageId && !seenIds.has(row.waMessageId) && !seenTexts.has(cleanBody)) {
            seenIds.add(row.waMessageId);
            seenTexts.add(cleanBody);
            matches.push({
              id: row.id,
              senderName: row.senderName,
              body: row.body,
              waMessageId: row.waMessageId,
              chatJid: row.chatJid,
              createdAt: new Date(row.createdAt),
              similarity: sim,
              source: "vector",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Embedding Service] Error buscando declaraciones forenses:", err);
  }

  return matches.slice(0, limit);
}
