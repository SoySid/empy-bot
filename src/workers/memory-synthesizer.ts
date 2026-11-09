import dotenv from "dotenv";
import { z } from "zod";
import {
  fetchRawMessagesBatch,
  setLastSynthesizedTime,
  cleanupOldRawMessages,
} from "../services/db/message.service.js";
import { prisma } from "../services/db/prisma.js";
import {
  upsertUserFact,
  deleteUserFact,
  cleanExpiredFacts,
} from "../services/db/user.service.js";
import {
  replaceMasterLessons,
  recordBurnedJoke,
  refreshReflectionCache,
  upsertGroupTerm,
  saveToneSnapshot,
} from "../services/db/reflection.service.js";
import { saveMessageEmbedding } from "../services/db/embedding.service.js";
import { createSocialPromise } from "../services/promise.service.js";
import { trackTokens, canUseModel } from "../services/token.service.js";
import { isSpamOrLowValue } from "../services/ai.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MEMORY_WORKER_MODEL = "gemini-3.5-flash-lite";

// ============================================================================
// ESQUEMAS ZOD PARA VALIDACIÓN ESTRICTA DE "STRUCTURED OUTPUTS"
// ============================================================================

export const UserFactExtractionSchema = z.object({
  jid: z.string(),
  accion: z.enum(["UPSERT", "DELETE"]),
  tipo: z.enum(["PERMANENTE", "TEMPORADA", "EPISODICO"]),
  clave: z.string().transform((k) => k.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40)),
  valor: z.string().transform((v) => v.trim().slice(0, 160)),
});

export const BotCorrectionSchema = z.object({
  authorJid: z.string(),
  correction: z.string().transform((c) => c.trim().slice(0, 200)),
});

export const MemorableMomentSchema = z.object({
  userJid: z.string(),
  senderName: z.string(),
  body: z.string(),
});

export const GroupLexiconSchema = z.object({
  term: z.string().transform((t) => t.trim()),
  category: z.enum(["slang", "insult_friendly", "expression", "reference"]).default("slang"),
  example: z.string().optional().default(""),
});

export const SocialPromiseExtractionSchema = z.object({
  userJid: z.string(),
  senderName: z.string(),
  promiseText: z.string(),
  condition: z.string().optional().default(""),
  dueDateApprox: z.string().optional().default(""),
});

export const MemorySynthesisSchema = z.object({
  userFacts: z.array(UserFactExtractionSchema).default([]),
  botCorrections: z.array(BotCorrectionSchema).default([]),
  burnedJokes: z.array(z.string()).default([]),
  memorableMoments: z.array(MemorableMomentSchema).default([]),
  groupLexicon: z.array(GroupLexiconSchema).default([]),
  socialPromises: z.array(SocialPromiseExtractionSchema).default([]),
  toneOfWindow: z.enum(["bardo", "joda", "serio", "mixto"]).default("mixto"),
});

export type MemorySynthesisResult = z.infer<typeof MemorySynthesisSchema>;

// Esquema JSON compatible con Gemini API para forzar Structured Outputs a nivel modelo
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    userFacts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          jid: { type: "STRING" },
          accion: { type: "STRING", enum: ["UPSERT", "DELETE"] },
          tipo: { type: "STRING", enum: ["PERMANENTE", "TEMPORADA", "EPISODICO"] },
          clave: { type: "STRING" },
          valor: { type: "STRING" },
        },
        required: ["jid", "accion", "tipo", "clave", "valor"],
      },
    },
    botCorrections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          authorJid: { type: "STRING" },
          correction: { type: "STRING" },
        },
        required: ["authorJid", "correction"],
      },
    },
    burnedJokes: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    memorableMoments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          userJid: { type: "STRING" },
          senderName: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["userJid", "senderName", "body"],
      },
    },
    groupLexicon: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          category: { type: "STRING", enum: ["slang", "insult_friendly", "expression", "reference"] },
          example: { type: "STRING" },
        },
        required: ["term", "category", "example"],
      },
    },
    socialPromises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          userJid: { type: "STRING" },
          senderName: { type: "STRING" },
          promiseText: { type: "STRING" },
          condition: { type: "STRING" },
          dueDateApprox: { type: "STRING" },
        },
        required: ["userJid", "senderName", "promiseText"],
      },
    },
    toneOfWindow: {
      type: "STRING",
      enum: ["bardo", "joda", "serio", "mixto"],
    },
  },
  required: ["userFacts", "botCorrections", "burnedJokes", "memorableMoments", "groupLexicon", "socialPromises", "toneOfWindow"],
};

const SYNTHESIS_SYSTEM_PROMPT = `Sos el analizador cognitivo del grupo de WhatsApp "Empyreal" (Argentina).
Tu tarea es analizar objetivamente la conversación reciente y extraer ÚNICAMENTE hechos reales comprobables, momentos memorables, jerga propia y tono predominante.

REGLAS DE ORO DE EXTRACCIÓN (LEER CON MÁXIMA ATENCIÓN):
1. HECHOS DE USUARIOS (userFacts):
   - PRIMERA PERSONA OBLIGATORIA (AUTODECLARACIÓN):
     * SOLO extraé un hecho si la MISMA persona lo declara explícitamente sobre sí misma en primera persona ("yo vivo en...", "laburo de...", "estudio abogacía", "tengo 24 años", "mi novia se llama...").
     * Si no está 100% claro que habla de sí misma, NO LO EXTRAIGAS.
   - CONSEJOS / SUGERENCIAS NO SON HECHOS:
     * Si el usuario A le dice a B: "hacete un cv", "trabajá de programador", "comprate zapatillas", "deberías hacer X", ESO NO ES UN HECHO de A ni de B. PROHIBIDO extraer de consejos u órdenes.
   - CHICANAS, BARDOS O BROMAS NO SON HECHOS:
     * Si le dicen a alguien "sos un albañil", "sos un vago", "el que juega al lol", "sos re manco", NO es un hecho real. Son descansos entre amigos.
   - SEPARACIÓN TOTAL DEL MINIJUEGO DEL BOT:
     * NUNCA extraigas profesiones virtuales de comandos o roles de minijuego (albañil, mecánico, espía, minero, etc.).
     * NUNCA extraigas hambre, guiso, fichas, saldo virtual, coimas o apuestas.
   - FILTRO DE CONTENIDO:
     * PROHIBIDO temas sexuales, genitales o íntimos.
     * Descartá trivialidades efímeras ("comió pizza", "se fue a dormir"). Solo datos identitarios reales (profesión real confirmada, ciudad, carrera universitaria, pareja formal, mascotas).
   - ACCIÓN: "UPSERT" o "DELETE" (si el propio usuario desmintió o rectificó un dato previo).
2. CORRECCIONES AL BOT (botCorrections):
   - Pautas explícitas de conducta si un integrante o admin le marcó un límite o error al bot ("bot pesado", "no digas más X", "aflojale a Y").
3. CHISTES QUEMADOS (burnedJokes):
   - Chicanas o remates que se volvieron repetitivos en esta charla.
4. MOMENTOS MEMORABLES (memorableMoments):
   - Frases icónicas, peleas épicas o anécdotas para el archivo histórico.
5. VOCABULARIO Y MODISMOS (groupLexicon):
   - Expresiones propias, chistes internos o apodos creados por el grupo (descartá palabras comunes del diccionario).
6. PROMESAS O APUESTAS SOCIALES (socialPromises):
   - ÚNICAMENTE compromisos o apuestas explícitas asumidas por un usuario en primera persona ("si apruebo pago las pizzas", "mañana paso el apunte", "apuesto que X pierde").
   - Descartá declaraciones vagas o bromas sin compromiso real.
7. TONO PREDOMINANTE (toneOfWindow):
   - "bardo" | "joda" | "serio" | "mixto"
`.trim();

let isSynthesizing = false;
let silenceTimer: NodeJS.Timeout | null = null;
let periodicTimer: NodeJS.Timeout | null = null;
let isWorkerReady = false;
let initTimer: NodeJS.Timeout | null = null;
let pendingTriggerCount = 0;

// Espera de 15 minutos continuos de inactividad para activar el análisis
const SILENCE_DELAY_MS = 15 * 60 * 1000;
const PERIODIC_BACKUP_MS = 60 * 60 * 1000; // 1 hora
const MIN_MESSAGES_TO_SYNTHESIZE = 10;
const BATCH_SIZE = 40;

/**
 * Ejecuta el proceso de síntesis asíncrona de memoria sobre un lote de mensajes.
 */
export async function runSynthesis(): Promise<void> {
  if (isSynthesizing || !isWorkerReady) return;
  isSynthesizing = true;

  try {
    await cleanExpiredFacts();

    const batch = await fetchRawMessagesBatch(BATCH_SIZE);
    if (batch.length < MIN_MESSAGES_TO_SYNTHESIZE) {
      return;
    }

    const batchIds = batch.map((m) => m.id);
    const lastMsg = batch[batch.length - 1];
    console.log(`\n[Memory Worker] 🧠 Procesando lote de ${batch.length} mensajes con ${MEMORY_WORKER_MODEL}...`);

    const activeJids = Array.from(new Set(batch.map((m) => m.userJid))).filter(
      (jid) => jid && !jid.includes("bot")
    );

    const existingUsers = await prisma.userProfile.findMany({
      where: { jid: { in: activeJids } },
      include: { facts: true },
    });

    const currentKnowledge = existingUsers
      .map((u) => {
        const factsStr = u.facts.map((f) => `[${f.clave}: ${f.valor}]`).join(", ");
        return `• ${u.primaryName} (${u.jid}): ${factsStr || "Sin hechos previos"}`;
      })
      .join("\n");

    // Filtrar para el análisis cognitivo: SOLO mensajes de personas reales, nunca del bot ni comandos
    const conversationalBatch = batch.filter((m) => {
      if (m.isBot) return false;
      const text = m.body.trim();
      if (text.startsWith("!") || text.startsWith(".") || text.startsWith("/")) return false;
      return true;
    });

    if (conversationalBatch.length === 0) {
      if (lastMsg) {
        await setLastSynthesizedTime(lastMsg.createdAt);
      }
      return;
    }

    const sanitizeTranscriptLine = (text: string) => {
      return (text || "")
        .replace(/<\/?(chat_transcript|known_user_facts)[^>]*>/gi, "")
        .replace(/\n\s*\[[^\]]+\]:/g, " ")
        .slice(0, 400)
        .trim();
    };

    const formattedTranscript = conversationalBatch
      .map((m) => `[${(m.senderName || "").replace(/[<>[\]{}\r\n]/g, "").slice(0, 35)} (${m.userJid})]: ${sanitizeTranscriptLine(m.body)}`)
      .join("\n");

    const userPrompt = `<known_user_facts>\n${currentKnowledge || "Sin datos previos."}\n</known_user_facts>\n\n<chat_transcript>\n${formattedTranscript}\n</chat_transcript>`;

    if (!GEMINI_API_KEY) {
      console.warn("[Memory Worker] Falta GEMINI_API_KEY. Saltando síntesis.");
      return;
    }

    if (!canUseModel(MEMORY_WORKER_MODEL, 15, "memory_synth")) {
      console.warn(`[Memory Worker] Rate limit preventivo activo para ${MEMORY_WORKER_MODEL}. Pospuesto para el próximo ciclo.`);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MEMORY_WORKER_MODEL}:generateContent`;
    const payload = {
      systemInstruction: { parts: [{ text: SYNTHESIS_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };

    let parsedData: MemorySynthesisResult | null = null;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const rawParsed = JSON.parse(rawJsonText);
          // Validación estricta con Zod
          parsedData = MemorySynthesisSchema.parse(rawParsed);

          if (data.usageMetadata) {
            trackTokens(
              "gemini",
              MEMORY_WORKER_MODEL,
              data.usageMetadata.promptTokenCount || 0,
              data.usageMetadata.candidatesTokenCount || 0,
              "memory_synth"
            );
          }
        }
      } else {
        console.warn(`[Memory Worker] Error HTTP ${res.status} llamando a ${MEMORY_WORKER_MODEL}`);
      }
    } catch (err: any) {
      console.error("[Memory Worker] Excepción durante la llamada a Gemini:", err?.message || err);
    }

    if (!parsedData) {
      console.warn("[Memory Worker] ⚠️ Lote descartado para no trabar la cola de memoria.");
      if (lastMsg) {
        await setLastSynthesizedTime(lastMsg.createdAt);
      }
      await cleanupOldRawMessages(168);
      return;
    }

    console.log(`[Memory Worker] ✅ Datos extraídos y validados con Zod: ${parsedData.userFacts.length} hechos, ${parsedData.groupLexicon.length} términos.`);

    const FORBIDDEN_FACT_KEYWORDS = [
      "hambre", "guiso", "saldo", "situacionfinanciera", "plata", "fichas", "laburojuego",
      "trabajojuego", "juegotrabajorol", "roljuego", "juegoapuestas", "juegomecanicoideas",
      "frecuenciamasturbacion", "masturbacion", "sexo", "coima", "casino", "prepucio", "semen",
      "simulador", "oficio virtual", "albanil", "albañil", "mecanico", "mecánico", "espia",
      "espía", "cartonero", "minero", "cv", "curriculum"
    ];

    // 1. Aplicar hechos aprendidos (con deduplicación en el lote y validación de presencia real)
    const activeJidsInBatch = new Set(conversationalBatch.map((m) => m.userJid));

    if (Array.isArray(parsedData.userFacts)) {
      const uniqueFactsMap = new Map<string, z.infer<typeof UserFactExtractionSchema>>();
      for (const fact of parsedData.userFacts) {
        if (!fact.jid || !fact.clave || !activeJidsInBatch.has(fact.jid)) continue;

        const lowerKey = fact.clave.toLowerCase();
        const lowerVal = fact.valor.toLowerCase();
        const isForbidden = FORBIDDEN_FACT_KEYWORDS.some(
          (kw) => lowerKey.includes(kw) || lowerVal.includes(kw)
        );
        if (isForbidden) {
          console.log(`[Memory Worker] 🛡️ Hecho descartado por filtro de seguridad/minijuego: [${fact.clave}: ${fact.valor}]`);
          continue;
        }

        const key = `${fact.jid}:${fact.clave}`;
        uniqueFactsMap.set(key, fact);
      }

      for (const fact of uniqueFactsMap.values()) {
        if (fact.accion === "DELETE") {
          await deleteUserFact(fact.jid, fact.clave);
        } else {
          await upsertUserFact(
            fact.jid,
            fact.tipo || "TEMPORADA",
            fact.clave,
            fact.valor,
            fact.tipo === "EPISODICO" ? 48 : undefined
          );
        }
      }
    }

    // 2. Aplicar lecciones/reglas aprendidas por el bot (restringido a instrucciones explícitas del Creador)
    if (Array.isArray(parsedData.botCorrections) && parsedData.botCorrections.length > 0) {
      const validOwnerLessons = parsedData.botCorrections
        .filter((c) => {
          if (!c.correction || !c.authorJid) return false;
          const isOwner = isBotOwner(null, c.authorJid);
          const authorInBatch = conversationalBatch.some((m) => m.userJid === c.authorJid);
          return isOwner && authorInBatch;
        })
        .map((c) => c.correction);

      if (validOwnerLessons.length > 0) {
        await replaceMasterLessons(validOwnerLessons);
      } else {
        console.log(`[Memory Worker] 🛡️ Ignorando botCorrections sin autorización válida del Creador.`);
      }
    }

    // 3. Aplicar chistes quemados
    if (Array.isArray(parsedData.burnedJokes)) {
      for (const joke of parsedData.burnedJokes) {
        if (typeof joke === "string" && joke.trim()) {
          await recordBurnedJoke(joke.trim());
        }
      }
    }

    // 4. Guardar momentos memorables en base de datos (con enlace forense a su waMessageId)
    if (Array.isArray(parsedData.memorableMoments)) {
      for (const m of parsedData.memorableMoments) {
        if (m.body && m.body.trim().length >= 10) {
          const matchedRaw = batch.find((b) => b.body.includes(m.body.trim().slice(0, 30)));
          await saveMessageEmbedding(
            m.userJid,
            m.senderName,
            m.body,
            matchedRaw?.waMessageId || undefined,
            matchedRaw?.chatJid || undefined
          );
        }
      }
    }

    // 4b. Guardar promesas o apuestas sociales
    if (Array.isArray(parsedData.socialPromises)) {
      for (const p of parsedData.socialPromises) {
        if (p.promiseText && p.promiseText.trim().length >= 8) {
          const matchedRaw = batch.find((b) => b.body.includes(p.promiseText.trim().slice(0, 20)));
          await createSocialPromise({
            chatJid: matchedRaw?.chatJid || "global",
            userJid: p.userJid,
            senderName: p.senderName,
            promiseText: p.promiseText,
            condition: p.condition || undefined,
            waMessageId: matchedRaw?.waMessageId || undefined,
          });
        }
      }
    }

    // 5. Guardar vocabulario y modismos propios del grupo
    if (Array.isArray(parsedData.groupLexicon)) {
      for (const item of parsedData.groupLexicon) {
        if (item.term && typeof item.term === "string") {
          await upsertGroupTerm(item.term, item.category || "slang", item.example || "");
        }
      }
    }

    // 6. Guardar snapshot del tono predominante
    const firstMsg = batch[0];
    const avgTone = parsedData.toneOfWindow || "mixto";
    const textMsgCount = batch.filter((m) => !isSpamOrLowValue(m.body)).length;
    const textRatio = batch.length > 0 ? Number((textMsgCount / batch.length).toFixed(2)) : 1.0;
    const activeUsersCount = activeJids.length;

    await saveToneSnapshot(
      avgTone,
      textRatio,
      activeUsersCount,
      firstMsg ? firstMsg.createdAt : new Date(),
      lastMsg ? lastMsg.createdAt : new Date()
    );

    await refreshReflectionCache();
    if (lastMsg) {
      await setLastSynthesizedTime(lastMsg.createdAt);
    }
    await cleanupOldRawMessages(168);
    console.log(`[Memory Worker] ✨ Lote de ${batchIds.length} mensajes sintetizado y avanzado exitosamente en Neon PostgreSQL.`);
  } catch (error) {
    console.error("[Memory Worker] ❌ Error crítico durante la síntesis:", error);
  } finally {
    isSynthesizing = false;
  }
}

/**
 * Disparador con debounce de 15 minutos de inactividad, con bypass por acumulación de mensajes
 */
export function triggerDebouncedSynthesis(): void {
  if (!isWorkerReady) return;
  pendingTriggerCount++;

  // Si se acumulan 50 llamadas de trigger sin haber tenido 15m de silencio continuo, forzar síntesis
  if (pendingTriggerCount >= 50) {
    pendingTriggerCount = 0;
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    runSynthesis().catch((e) => console.error("[Memory Worker] Error in forced synthesis:", e));
    return;
  }

  if (silenceTimer) clearTimeout(silenceTimer);

  silenceTimer = setTimeout(async () => {
    pendingTriggerCount = 0;
    await runSynthesis();
  }, SILENCE_DELAY_MS);
}

export function stopMemorySynthesizer(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  pendingTriggerCount = 0;
  isSynthesizing = false;
  isWorkerReady = false;
}

export function startMemorySynthesizer(): void {
  if (isWorkerReady) return;
  if (initTimer) clearTimeout(initTimer);

  console.log("[Memory Worker] ⏳ Pausa inicial de 30 segundos activa para evitar ráfagas al iniciar...");
  initTimer = setTimeout(() => {
    isWorkerReady = true;
    console.log("[Memory Worker] 🧠 Worker de memoria listo (Gemini 3.5 Flash Lite + Zod) escuchando ingestas.");

    // Backup periódico cada 1 hora para procesar chats activos continuamente
    if (periodicTimer) clearInterval(periodicTimer);
    periodicTimer = setInterval(() => {
      runSynthesis().catch((e) => console.error("[Memory Worker] Error in periodic synthesis:", e));
    }, PERIODIC_BACKUP_MS);
  }, 30000);
}