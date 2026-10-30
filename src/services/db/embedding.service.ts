import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
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

/**
 * Búsqueda forense de declaraciones pasadas de un usuario específico para el Fiscal de Contradicciones.
 * Combina búsqueda semántica con pgvector + mensajes directos de RawMessage.
 */
export async function searchUserPastStatements(
  userJid: string,
  query: string,
  limit = 6
): Promise<ForensicStatementMatch[]> {
  const matches: ForensicStatementMatch[] = [];
  const seenTexts = new Set<string>();

  try {
    // 1. Búsqueda vectorial si hay query temática
    if (query.trim().length >= 3) {
      const queryVector = await generateTextEmbedding(query, "RETRIEVAL_QUERY");
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
          WHERE "embedding" IS NOT NULL AND "userJid" = ${userJid}
          ORDER BY "embedding" <=> ${vectorStr}::vector ASC
          LIMIT ${limit};
        `;

        for (const row of rawVectorResults) {
          const sim = Number(row.similarity ?? 0);
          if (sim >= 0.45 && !seenTexts.has(row.body)) {
            seenTexts.add(row.body);
            matches.push({
              id: row.id,
              senderName: row.senderName,
              body: row.body,
              waMessageId: row.waMessageId || null,
              chatJid: row.chatJid || null,
              createdAt: new Date(row.createdAt),
              similarity: sim,
              source: "vector",
            });
          }
        }
      }
    }

    // 2. Traer mensajes recientes de RawMessage con waMessageId no nulo del mismo usuario
    const rawRows = await prisma.rawMessage.findMany({
      where: {
        userJid,
        isBot: false,
        waMessageId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const normQueryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    for (const r of rawRows) {
      if (seenTexts.has(r.body)) continue;

      const normBody = r.body.toLowerCase();
      const hasWordMatch = normQueryWords.some((w) => normBody.includes(w));

      if (hasWordMatch || normQueryWords.length === 0 || matches.length < limit) {
        seenTexts.add(r.body);
        matches.push({
          id: r.id,
          senderName: r.senderName,
          body: r.body,
          waMessageId: r.waMessageId,
          chatJid: r.chatJid,
          createdAt: r.createdAt,
          source: "raw",
        });
      }

      if (matches.length >= limit * 2) break;
    }
  } catch (err) {
    console.error("[Embedding Service] Error buscando declaraciones forenses:", err);
  }

  return matches.slice(0, limit);
}
