import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import Groq, { toFile } from "groq-sdk";
import axios from "axios";
import dotenv from "dotenv";
import sharp from "sharp";
import { geminiTools } from "./tools.js";
import { buildDynamicSystemPrompt } from "./prompts.js";
import { UserProfileWithFacts, getContextualUsersPrompt } from "./db/user.service.js";
import { getRecentConversationContext } from "./db/message.service.js";
import {
  getActiveLessonsContext,
  getBurnedJokesContext,
  recordSessionBurnedJoke,
  getGroupLexiconContext,
  getRecentToneContext,
} from "./db/reflection.service.js";
import { searchRelevantPastMessages } from "./db/embedding.service.js";
import { trackTokens, isNearGroqLimit, canUseModel, setModelCooldown } from "./token.service.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const GEMINI_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const TEXT_MODEL_PIPELINE = [
  { provider: "gemini", model: "gemini-2.5-flash-lite", maxRpm: 30 },
  { provider: "gemini", model: "gemini-2.0-flash-lite", maxRpm: 30 },
  { provider: "gemini", model: "gemini-flash-lite-latest", maxRpm: 30 },
  { provider: "gemini", model: "gemma-4-26b-a4b-it", maxRpm: 30 },
  { provider: "gemini", model: "gemini-flash-latest", maxRpm: 15 },
  { provider: "groq", model: "qwen/qwen3.8-27b", maxRpm: 30 },
  { provider: "groq", model: "openai/gpt-oss-20b", maxRpm: 30 },
  { provider: "groq", model: "openai/gpt-oss-120b", maxRpm: 15 },
];

const VISION_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
];

const ACTION_INTENT_REGEX =
  /\b(avisa|avisame|tiktok|tt|descarga|descargar|sticker|pegatina)\b/i;

const TASK_INTENT_REGEX =
  /\b(cuanto|cuánto|calcula|calculame|sum[aá]|rest[aá]|multiplic[aá]|divid[ií]|porcentaje|%|decile|decele|mandale|avisale|preguntale|pasa(me)?|pásame|que es|qué es|como se|cómo se|donde|dónde|cual es|cuál es|quien es|quién es|explica|explicame|hace(me)?|hacé(me)?|resuelve|resolvé|cuantos|cuántos)\b/i;

export async function isTaskIntent(prompt: string, quotedContext?: string): Promise<boolean> {
  const combined = `${prompt} ${quotedContext || ""}`.trim();
  if (
    ACTION_INTENT_REGEX.test(combined) ||
    TASK_INTENT_REGEX.test(combined) ||
    REALTIME_SEARCH_REGEX.test(combined)
  ) {
    return true;
  }
  // Expresiones matemáticas como "15% de 700", "500 * 2", "12 / 4"
  if (/(\d+[\s\+\-\*\/%\^]+\d+)|(\d+\s*%)|(\b\d+\s*[\+\-\*\/]\s*\d+\b)/.test(combined)) {
    return true;
  }
  if (!combined.includes("?") && combined.split(/\s+/).length <= 4) {
    return false;
  }
  // Chequeo rápido con Groq qwen/qwen3.8-27b si está disponible
  if (canUseModel("qwen/qwen3.8-27b", 30, "classifier")) {
    try {
      const completion = await groq.chat.completions.create({
        model: "qwen/qwen3.8-27b",
        messages: [
          {
            role: "system",
            content:
              "Determina si el usuario solicita una TAREA, CONSULTA FÁCTICA, CÁLCULO o MENSAJE A TRANSMITIR que exige resolución objetiva (TASK), o si es solo CHARLA INFORMAL / SALUDO / MEME / BARDO CASUAL (CASUAL). Responde solo JSON: {\"is_task\": true/false}",
          },
          { role: "user", content: combined.slice(0, 300) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 50,
        temperature: 0.1,
      });
      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.is_task === "boolean") return parsed.is_task;
      }
    } catch {}
  }
  return false;
}

const PAST_QUERY_REGEX =
  /\b(te acordas|te acordás|quien|quién|cuando|cuándo|el otro dia|el otro día|ayer|semana pasada|mes pasado|historia|habian dicho|habían dicho|resumen)\b/i;

export const REALTIME_SEARCH_REGEX =
  /\b(clima|tiempo|temperatura|grados|lluvia|juega|partido|resultado|jugo|jugó|boca|river|racing|independiente|san lorenzo|tabla|puntos|dolar|dólar|cotizacion|cotización|precio|euro|noticia|noticias|hoy|contra quien|contra quién|a que hora|a qué hora)\b/i;

// Caché en memoria para búsquedas en tiempo real (TTL 2 minutos)
const liveSearchCache = new Map<string, { data: string; timestamp: number }>();
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;

// Definición de respuesta de la IA
export interface AIResponse {
  type: "text" | "tool_call";
  text?: string;
  mood?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
}

export function isSpamOrLowValue(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean || clean.length < 2) return true;

  // Signos de puntuación o emojis puros
  if (/^[\p{P}\p{Emoji}\s]+$/u.test(clean)) return true;
  if (/^(\?|\.|!|\+|-|\/|\*)+$/.test(clean)) return true;

  // Remover signos de puntuación y emojis para analizar las palabras
  const stripped = clean.replace(/[\p{P}\p{Emoji}]/gu, " ").trim();
  if (!stripped) return true;

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Patrones de risa: jaja, jeje, kjj, xd, lol, lmao, etc.
  const isLaughToken = (w: string) =>
    /^(j[aeiou]+|h[aeiou]+|kjj+|xd+|js+|ks+|sk+|lol+|lmao+|khe+|omg|wow)$/i.test(w) ||
    /^(ja|ha|je|he|ji|xd|kjj){2,}$/i.test(w);

  // Palabras comunes de reacción / muletilla ante un remate o chiste
  const isReactionFiller = (w: string) =>
    /^(lpm|hdp|hdps|q|que|mal|no+|podes|literal|me|meo|muero|mori|mor[ií]|tentad[oa]|tentad[ií]sim[oa]|amigo|dios|basta|total|same|uh|ah|ay|epa|uy|che|fa|faa|fua)$/i.test(w);

  const hasAtLeastOneLaugh = words.some(isLaughToken);
  const allAreLaughOrFiller = words.every((w) => isLaughToken(w) || isReactionFiller(w));

  // Si contiene risas y todas las palabras son risas o fillers de reacción
  if (hasAtLeastOneLaugh && allAreLaughOrFiller) {
    return true;
  }

  // Si son 1 o 2 palabras puramente de reacción/filler (ej: "mal", "literal", "lpm", "xd")
  if (words.length <= 2 && words.every((w) => isReactionFiller(w) || isLaughToken(w))) {
    return true;
  }

  return false;
}

export async function fetchLiveSearchData(query: string): Promise<string> {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return "";

  const cached = liveSearchCache.get(cleanQuery);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  let resultData = "";

  try {
    // 1. Cotizaciones del Dólar y Divisas (DolarApi Argentina)
    if (/\b(d[oó]lar|blue|oficial|mep|ccl|tarjeta|cripto|euro|cotizac|divisas?)\b/i.test(cleanQuery)) {
      try {
        const dolarRes = await axios.get("https://dolarapi.com/v1/dolares", { timeout: 3500 });
        if (Array.isArray(dolarRes.data) && dolarRes.data.length > 0) {
          const rates = dolarRes.data
            .map((d: any) => `${d.nombre}: Compra $${d.compra} / Venta $${d.venta}`)
            .join(" | ");
          resultData = `<live_finance_data source="DolarApi Argentina">\n${rates}\n</live_finance_data>`;
        }
      } catch (dolarErr: any) {
        console.warn("[Live Search] Error consultando DolarApi:", dolarErr?.message || dolarErr);
      }
    }

    // 2. Clima y Temperatura (wttr.in)
    if (!resultData && /\b(clima|temperatura|tiempo|grados|lluvia)\b/i.test(cleanQuery)) {
      const cityMatch = cleanQuery.match(/(?:en|de|para)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)/i);
      const targetCity = cityMatch ? cityMatch[1].trim() : "Buenos Aires";
      try {
        const weatherRes = await axios.get(
          `https://wttr.in/${encodeURIComponent(targetCity)}?format=%l:+%C,+temperatura:+%t,+humedad:+%h,+viento:+%w&lang=es`,
          { timeout: 3500 }
        );
        if (weatherRes.data && !weatherRes.data.includes("Unknown")) {
          resultData = `<live_weather_data city="${targetCity}">\n${weatherRes.data.trim()}\n</live_weather_data>`;
        }
      } catch {}
    }

    // 3. Fallback Instant Answer DuckDuckGo
    if (!resultData) {
      try {
        const instantRes = await axios.get(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`,
          { timeout: 3000 }
        );
        if (instantRes.data?.AbstractText) {
          resultData = `<live_web_data>\n${instantRes.data.AbstractText}\n</live_web_data>`;
        }
      } catch {}
    }
  } catch (err: any) {
    console.warn("[Live Search] Error general obteniendo datos web:", err?.message || err);
  }

  if (resultData) {
    liveSearchCache.set(cleanQuery, { data: resultData, timestamp: Date.now() });
  }

  return resultData;
}

function extractJsonCandidate(raw: string): any {
  if (!raw) return null;
  // 1. Intento directo
  try {
    return JSON.parse(raw);
  } catch {}

  // 2. Bloque markdown ```json ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }

  // 3. Buscar el bloque {...} balanceado o que contenga "reply"
  const startIdx = raw.indexOf("{");
  const lastIdx = raw.lastIndexOf("}");
  if (startIdx !== -1 && lastIdx !== -1 && lastIdx > startIdx) {
    try {
      return JSON.parse(raw.slice(startIdx, lastIdx + 1));
    } catch {}

    const replyPos = raw.indexOf('"reply"');
    if (replyPos !== -1) {
      const braceBefore = raw.lastIndexOf("{", replyPos);
      const braceAfter = raw.indexOf("}", replyPos);
      if (braceBefore !== -1 && braceAfter !== -1) {
        try {
          return JSON.parse(raw.slice(braceBefore, braceAfter + 1));
        } catch {}
      }
    }
  }

  return null;
}

function parseStructuredOutput(
  rawText: string,
  isTask = false
): { cleanText: string; mood: string; taskResult?: string } {
  if (!rawText) return { cleanText: "De una che.", mood: isTask ? "servicial" : "tranqui" };

  let sanitized = rawText.trim();
  sanitized = sanitized.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

  const data = extractJsonCandidate(sanitized);
  if (data && (data.reply || data.text || data.mensaje || data.task_result)) {
    let replyText = String(data.reply || data.text || data.mensaje || "").trim();
    const moodVal = data.mood ? String(data.mood).toLowerCase().trim() : isTask ? "servicial" : "tranqui";
    const taskResult =
      data.task_result && String(data.task_result).trim() !== "null"
        ? String(data.task_result).trim()
        : undefined;

    if (taskResult && taskResult.length > 0) {
      const evasiveRegex =
        /\b(no soy tu esclavo|no soy tu mucam[ao]|hacelo vos|hacélo vos|deja de joder|dejá de joder|no tengo ganas|que te pensas|qué te pensás)\b/i;
      if (evasiveRegex.test(replyText) || !replyText) {
        replyText = `${taskResult}. Dejá de joder che jaja.`;
      } else if (!replyText.toLowerCase().includes(taskResult.toLowerCase())) {
        replyText = `${taskResult}\n${replyText}`;
      }
    }

    return { cleanText: replyText || "De una che.", mood: moodVal, taskResult };
  }

  // 3. Fallback a extracción de tag [MOOD: xxx] y limpieza de bloques de ejecución de código
  const moodRegex = /\[MOOD:\s*([a-zA-Z]+)\]/i;
  const moodMatch = sanitized.match(moodRegex);
  const mood = moodMatch ? moodMatch[1].toLowerCase() : isTask ? "servicial" : "tranqui";
  let cleanText = sanitized.replace(moodRegex, "").trim();
  cleanText = cleanText.replace(/```(?:python)?[\s\S]*?```/gi, "").trim();

  return { cleanText: cleanText || "De una che.", mood };
}

export async function processUserMessage(
  prompt: string,
  quotedContext?: string,
  speakerProfile?: UserProfileWithFacts,
  quotedSenderProfile?: UserProfileWithFacts
): Promise<AIResponse> {
  const historyBlock = getRecentConversationContext(10);
  
  const usersBlock = getContextualUsersPrompt(
    speakerProfile?.jid || "",
    quotedSenderProfile?.jid,
    `${prompt} ${quotedContext || ""}`
  );
  
  const lessonsBlock = getActiveLessonsContext();
  const burnedJokesBlock = getBurnedJokesContext();

  let semanticHistoryContext = "";
  if (PAST_QUERY_REGEX.test(prompt) || (quotedContext && PAST_QUERY_REGEX.test(quotedContext))) {
    const matches = await searchRelevantPastMessages(prompt, 2);
    if (matches.length > 0) {
      const matchLines = matches.map(
        (m) => `• [${m.senderName} el ${m.createdAt.toLocaleDateString("es-AR")}]: "${m.body}"`
      );
      semanticHistoryContext = `<semantic_memories>\n${matchLines.join("\n")}\n</semantic_memories>\n`;
    }
  }

  let liveSearchBlock = "";
  if (REALTIME_SEARCH_REGEX.test(prompt) || (quotedContext && REALTIME_SEARCH_REGEX.test(quotedContext))) {
    const searchResult = await fetchLiveSearchData(prompt);
    if (searchResult) {
      liveSearchBlock = `\n${searchResult}\n`;
    }
  }

  const lexiconBlock = getGroupLexiconContext();
  const toneBlock = getRecentToneContext();
  const isTask = await isTaskIntent(prompt, quotedContext);

  const systemPrompt = `${buildDynamicSystemPrompt(
    usersBlock,
    lessonsBlock,
    burnedJokesBlock,
    semanticHistoryContext,
    isTask,
    lexiconBlock,
    toneBlock
  )}${liveSearchBlock}

<output_instructions>
Respondé ÚNICAMENTE un objeto JSON con esta estructura exacta:
{
  "task_result": ${isTask ? "\"Resolución concreta de la tarea o cálculo, o mención @Nombre con el mensaje a transmitir (OBLIGATORIO)\"" : "null"},
  "reply": "Tu mensaje completo para WhatsApp (si hay tarea, DEBE contener la resolución de task_result primero, seguida opcionalmente por el remate o comentario porteño. Negrita con *un solo asterisco*)",
  "mood": "servicial" | "bardo" | "risa" | "tranqui" | "pensativo" | "triste" | "festejo" | "afecto" | "duda" | "wtf"
}
</output_instructions>`;

  const senderName = speakerProfile?.primaryName || "Usuario";

  const safePrompt = (prompt || "")
    .slice(0, 1500)
    .replace(/<\/?(recent_chat_history|current_user_message|context|output_instructions)[^>]*>/gi, "");
  const safeQuotedContext = quotedContext
    ? quotedContext.slice(0, 600).replace(/<\/?(recent_chat_history|current_user_message|context|output_instructions)[^>]*>/gi, "")
    : undefined;

  let userMessageConstruct = "";
  if (safeQuotedContext) {
    const target = quotedSenderProfile ? ` de @${quotedSenderProfile.primaryName}` : "";
    userMessageConstruct += `[Mensaje citado${target}]: "${safeQuotedContext}"\n`;
  }
  userMessageConstruct += `[@${senderName}]: "${safePrompt}"`;

  const fullPromptWithHistory = `<recent_chat_history>
<!-- Historial de contexto reciente para entender el marco de la charla -->
${historyBlock}
</recent_chat_history>

<current_user_message>
${userMessageConstruct}
</current_user_message>

INSTRUCCIONES CLAVE DE RESPUESTA:
- Enfocate exactamente en lo que te dice o pide @${senderName}. Si te pide una tarea, un dato, una lista, un cálculo, o que le digas algo (como colores, palabras, etc.), CÚMPLILO SIEMPRE de forma directa, servicial y de buena onda.
- PROHIBIDO insultar, putear, agredir o negarte a ayudar diciendo que no sos su esclavo o mucama. Mantené siempre buena onda, humor sano y respeto.
- NO mezcles con temas anteriores del historial si no tienen que ver con lo que pide o habla ahora.
- PROHIBIDO inventar hechos, datos o historias falsas de los usuarios.
- Longitud adecuada y flexible: si es un remate o charla casual, sé conciso; si es una explicación o dato, podés explayarte en 1 o 2 párrafos completos según haga falta.

Generá el JSON con la respuesta para @${senderName}:`;

  const hasActionIntent =
    ACTION_INTENT_REGEX.test(prompt) ||
    (quotedContext ? ACTION_INTENT_REGEX.test(quotedContext) : false);

  const EVASION_CHECK =
    /\b(no soy tu esclavo|no soy tu mucam[ao]|hacelo vos|hacélo vos|deja de joder|dejá de joder|no tengo ganas)\b/i;

  for (let i = 0; i < TEXT_MODEL_PIPELINE.length; i++) {
    const candidate = TEXT_MODEL_PIPELINE[i];

    if (!canUseModel(candidate.model, candidate.maxRpm)) {
      continue;
    }

    if (candidate.provider === "groq" && isNearGroqLimit()) {
      continue;
    }

    try {
      if (candidate.model === "gemma-4-26b-a4b-it" || candidate.model.includes("flash-lite")) {
        if (hasActionIntent) continue; // Si requiere herramientas (alarmas, stickers, etc.), usar modelos Gemini con function calling

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
        if (!GEMINI_API_KEY) continue;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:generateContent`;
        const thinkingLevel = candidate.model.includes("gemma")
          ? (process.env.GEMMA_THINKING_LEVEL || "high")
          : (process.env.GEMINI_THINKING_LEVEL || "minimal");

        const payload: any = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: fullPromptWithHistory }] }],
          generationConfig: {
            temperature: isTask ? 0.35 : 0.7,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingLevel },
          },
        };

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          console.warn(`[AI Pipeline] HTTP ${res.status} con ${candidate.model}, probando siguiente...`);
          continue;
        }

        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const rawResult = parts
          .filter((p: any) => !p.thought && typeof p.text === "string")
          .map((p: any) => p.text.trim())
          .join("\n");

        if (data.usageMetadata) {
          trackTokens(
            "gemini",
            candidate.model,
            data.usageMetadata.promptTokenCount || 0,
            data.usageMetadata.candidatesTokenCount || 0
          );
        }

        const { cleanText, mood } = parseStructuredOutput(rawResult, isTask);
        if (isTask && EVASION_CHECK.test(cleanText) && !cleanText.match(/\d+/) && !cleanText.includes("@")) {
          continue;
        }

        if (mood === "bardo" || mood === "risa") {
          const firstWords = cleanText.split(" ").slice(0, 5).join(" ");
          recordSessionBurnedJoke(firstWords);
        }

        return {
          type: "text",
          text: cleanText || "De una che.",
          mood,
        };
      }

      if (candidate.provider === "gemini") {
        const isMathTask =
          /(\d+[\s\+\-\*\/%\^]+\d+)|(\d+\s*%)|(\b(calcula|calculame|sum[aá]|rest[aá]|multiplic[aá]|divid[ií]|raiz|raíz|porcentaje|cuanto es|cuánto es|promedio|estad[ií]stica|cuenta)\b)/i.test(
            `${prompt} ${quotedContext || ""}`
          );
        const useCodeExecution = isMathTask && !hasActionIntent && !candidate.model.includes("gemma");

        const toolsConfig: any[] = hasActionIntent
          ? geminiTools
          : useCodeExecution
          ? [{ codeExecution: {} }]
          : [];

        const generationConfig: any = {
          temperature: isTask ? 0.35 : 0.7,
          topP: 0.95,
        };
        if (!useCodeExecution) {
          generationConfig.responseMimeType = "application/json";
        }

        const model = genAI.getGenerativeModel({
          model: candidate.model,
          systemInstruction: systemPrompt,
          safetySettings: GEMINI_SAFETY_SETTINGS,
          generationConfig,
          ...(toolsConfig.length > 0 ? { tools: toolsConfig } : {}),
        });

        const result = await model.generateContent(fullPromptWithHistory);
        const response = result.response;
        const usage = (response as any).usageMetadata;

        if (usage) {
          trackTokens("gemini", candidate.model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
        }

        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          return {
            type: "tool_call",
            toolName: call.name,
            toolArgs: (call.args as Record<string, any>) || {},
          };
        }

        const rawResult = response.text() || "{}";
        const { cleanText, mood } = parseStructuredOutput(rawResult, isTask);

        if (isTask && EVASION_CHECK.test(cleanText) && !cleanText.match(/\d+/) && !cleanText.includes("@")) {
          console.warn(`[AI Task Check] Modelo ${candidate.model} evadió la tarea ("${cleanText}"). Reintentando con siguiente modelo...`);
          continue;
        }

        if (mood === "bardo" || mood === "risa") {
          const firstWords = cleanText.split(" ").slice(0, 5).join(" ");
          recordSessionBurnedJoke(firstWords);
        }

        return {
          type: "text",
          text: cleanText || "De una che.",
          mood,
        };
      } else if (candidate.provider === "groq") {
        const messages: any[] = [
          {
            role: "system",
            content: `${systemPrompt}\nRespondé únicamente un JSON válido con campos task_result, reply y mood.`,
          },
          { role: "user", content: fullPromptWithHistory },
        ];

        const completion = await groq.chat.completions.create({
          model: candidate.model,
          messages,
          response_format: { type: "json_object" },
          temperature: isTask ? 0.35 : 0.7,
          max_tokens: 1000,
        });

        if (completion.usage) {
          trackTokens(
            "groq",
            candidate.model,
            completion.usage.prompt_tokens || 0,
            completion.usage.completion_tokens || 0
          );
        }

        const choice = completion.choices[0]?.message;
        const rawResult = choice?.content || "{}";
        const { cleanText, mood } = parseStructuredOutput(rawResult, isTask);

        if (isTask && EVASION_CHECK.test(cleanText) && !cleanText.match(/\d+/) && !cleanText.includes("@")) {
          console.warn(`[AI Task Check] Groq ${candidate.model} evadió la tarea ("${cleanText}"). Reintentando...`);
          continue;
        }

        return {
          type: "text",
          text: cleanText || "De una che.",
          mood,
        };
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.warn(`[AI Pipeline] Falló ${candidate.model}: ${msg}`);
      if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        setModelCooldown(candidate.model, 5 * 60 * 1000);
      }
      if (i < TEXT_MODEL_PIPELINE.length - 1) continue;
    }
  }

  return { type: "text", text: "Perdón che, se me tildó la conexión. ¿Qué me decías?", mood: "tranqui" };
}

export async function evaluateBurrada(messageText: string): Promise<{ shouldRoast: boolean; mood: string } | null> {
  const clean = messageText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const cryTriggers =
    /\b(perdi|perdimos|manco|mancos|manco de mierda|soy malisimo|juego de mierda|juego del orto|la culpa es de|malardo|fui yo|pechito|pecho frio|tilt|tilteado|tilteadisimo|0 da[nñ]o|no pego una|fedee|feeder|me trollearon|troll|trolls|que asco de team|desinstalo|fedear|lo perdio)\b/i;

  if (cryTriggers.test(clean)) {
    return { shouldRoast: true, mood: "random" };
  }

  return null;
}

export async function processVisionMessage(
  mediaBuffer: Buffer,
  isSticker: boolean,
  prompt: string,
  speakerProfile?: UserProfileWithFacts
): Promise<string> {
  const senderName = speakerProfile?.primaryName || "Usuario";
  const userText = prompt.trim() || (isSticker ? "¿Qué opinás de este sticker?" : "¿Qué ves en esta foto?");

  let compressedBuffer: Buffer;
  try {
    compressedBuffer = await sharp(mediaBuffer)
      .resize(512, 512, { fit: "inside" })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    compressedBuffer = mediaBuffer;
  }

  const imagePart = {
    inlineData: {
      data: compressedBuffer.toString("base64"),
      mimeType: "image/jpeg",
    },
  };

  const visionSystemPrompt = `Sos empy-bot en el grupo Empyreal de WhatsApp (Argentina). Respondé con humor argentino, remate o comentario canchero a @${senderName}. Describí o comentá lo que ves con gracia y naturalidad de amigos (si es algo simple sé conciso en 1-2 oraciones; si amerita describir detalles, explayate con onda sin cortar la idea).`;
  const fullPrompt = `[@${senderName}]: ${userText}`;

  for (const modelName of VISION_MODELS) {
    if (!canUseModel(modelName, 15)) continue;

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: visionSystemPrompt,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        generationConfig: {
          maxOutputTokens: 240,
          temperature: 0.7,
        },
      });

      const result = await model.generateContent([fullPrompt, imagePart]);
      const usage = (result.response as any).usageMetadata;

      if (usage) {
        trackTokens("gemini", modelName, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, "vision");
      }

      const text = result.response.text();
      if (text) {
        return text.trim();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[Vision] Falló ${modelName}: ${msg}`);
      if (msg.includes("503") || msg.includes("429") || msg.includes("high demand") || msg.includes("quota")) {
        setModelCooldown(modelName, 60 * 1000);
      }
    }
  }

  return "No llego a ver bien la foto che, ¿me la mandás de nuevo?";
}

function supportsThinkingLevel(model: string): boolean {
  return model.includes("gemini-3") || model.includes("gemma-4");
}

function classifyHttpCooldownMs(status: number): number | null {
  if (status === 429 || status === 503) return 60 * 1000;
  if (status === 404) return 5 * 60 * 1000;
  return null;
}

export async function generateWithFlashLite(
  prompt: string,
  maxTokens = 300,
  temperature = 0.4,
  feature = "summary"
): Promise<string | null> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) return null;

  const configuredModel = process.env.GEMINI_FLASH_LITE_MODEL || "gemini-3.5-flash-lite";
  const models = Array.from(
    new Set([
      configuredModel,
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemma-4-26b-a4b-it",
    ])
  );

  for (const model of models) {
    if (!canUseModel(model, 30, feature)) continue;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const generationConfig: Record<string, any> = {
        temperature,
        maxOutputTokens: maxTokens,
      };
      if (supportsThinkingLevel(model)) {
        generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
      }

      const payload: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        console.warn(`[Flash-Lite Helper] HTTP ${res.status} con ${model}: ${errorBody.slice(0, 300)}`);
        const cooldownMs = classifyHttpCooldownMs(res.status);
        if (cooldownMs) {
          setModelCooldown(model, cooldownMs);
        }
        continue;
      }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts
        .filter((p: any) => !p.thought && typeof p.text === "string")
        .map((p: any) => p.text.trim())
        .filter(Boolean)
        .join("\n")
        .trim();

      if (text) {
        if (data.usageMetadata) {
          trackTokens(
            "gemini",
            model,
            data.usageMetadata.promptTokenCount || 0,
            data.usageMetadata.candidatesTokenCount || 0,
            feature
          );
        }
        return text;
      }
    } catch (err: any) {
      console.warn(`[Flash-Lite Helper] Error generando con ${model}:`, err?.message || err);
    }
  }

  return null;
}

export const generateWithGemma = generateWithFlashLite;

export async function generateWithGemini(
  prompt: string,
  maxTokens = 600,
  temperature = 0.5,
  feature = "astrology"
): Promise<string | null> {
  // 1. Prioridad: Gemini Flash Lite / Gemma vía REST (maneja thinkingConfig por modelo)
  const flashLiteRes = await generateWithFlashLite(prompt, maxTokens, temperature, feature);
  if (flashLiteRes) return flashLiteRes;

  // 2. Respaldo vía SDK @google/generative-ai con modelos vigentes no restringidos
  const candidates = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
  ];
  for (const cand of candidates) {
    if (!canUseModel(cand, 15, feature)) continue;
    try {
      const model = genAI.getGenerativeModel({
        model: cand,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      });
      const result = await model.generateContent(prompt);
      const usage = (result.response as any).usageMetadata;
      if (usage) {
        trackTokens("gemini", cand, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, feature);
      }
      const text = result.response.text();
      if (text) return text.trim();
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[Gemini Helper] Falló modelo ${cand}:`, msg);
      if (msg.includes("429") || msg.includes("503") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        setModelCooldown(cand, 60 * 1000);
      } else if (msg.includes("404") || msg.includes("not found")) {
        setModelCooldown(cand, 5 * 60 * 1000);
      } else {
        setModelCooldown(cand, 30 * 1000);
      }
    }
  }

  // 3. Fallback con Groq (respetando cuota diaria)
  if (process.env.GROQ_API_KEY && !isNearGroqLimit()) {
    const groqFallbacks = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
    for (const groqModel of groqFallbacks) {
      if (!canUseModel(groqModel, 30, feature)) continue;
      try {
        const completion = await groq.chat.completions.create({
          model: groqModel,
          messages: [{ role: "user", content: prompt }],
          temperature,
          max_tokens: maxTokens,
        });
        if (completion.usage) {
          trackTokens("groq", groqModel, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0, feature);
        }
        const content = completion.choices[0]?.message?.content?.trim();
        if (content) return content;
        console.warn(`[Gemini Helper] Groq ${groqModel} devolvió contenido vacío (finish_reason=${completion.choices[0]?.finish_reason || "unknown"}).`);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[Gemini Helper] Error en fallback de Groq (${groqModel}):`, msg);
        if (msg.includes("429") || msg.includes("rate_limit") || msg.includes("503")) {
          setModelCooldown(groqModel, 60 * 1000);
        }
      }
    }
  }

  return null;
}

export async function generateWithGroqReasoning(
  prompt: string,
  maxTokens = 600,
  temperature = 0.5,
  feature = "reasoning"
): Promise<string | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const modelName = "openai/gpt-oss-120b";
  if (!canUseModel(modelName, 10, feature) || isNearGroqLimit()) return null;

  // Garantizar margen mínimo para el bloque reasoning interno sin vaciar choice.content
  const effectiveMaxTokens = Math.max(maxTokens, 900);

  try {
    const completion = await groq.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: effectiveMaxTokens,
    });

    if (completion.usage) {
      trackTokens(
        "groq",
        modelName,
        completion.usage.prompt_tokens || 0,
        completion.usage.completion_tokens || 0,
        feature
      );
    }

    const choice = completion.choices[0];
    const content = choice?.message?.content?.trim();
    if (content) {
      return content;
    }
    console.warn(
      `[Groq Reasoning] ${modelName} devolvió content vacío (feature=${feature}, finish_reason=${choice?.finish_reason || "unknown"}, max_tokens=${effectiveMaxTokens}).`
    );
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[Groq Reasoning] Falló ${modelName}:`, msg);
    if (msg.includes("429") || msg.includes("rate_limit")) {
      setModelCooldown(modelName, 10 * 60 * 1000);
    } else if (msg.includes("503")) {
      setModelCooldown(modelName, 60 * 1000);
    }
  }
  return null;
}

export async function generateGroupAudioScript(
  chatMessages: { senderName: string; body: string }[],
  mode: "recent" | "today" | "yesterday" = "recent",
  voiceStyle: "standard" | "tomas" = "standard"
): Promise<string> {
  if (chatMessages.length === 0) {
    return mode === "today"
      ? "No hay mensajes registrados de hoy para armar el guion."
      : mode === "yesterday"
      ? "No hay mensajes registrados de ayer para armar el guion."
      : "No hay suficientes mensajes recientes para armar el guion.";
  }

  const transcript = chatMessages
    .map((m) => `[${m.senderName}]: ${m.body}`)
    .join("\n");

  const participantsList = Array.from(new Set(chatMessages.map((m) => m.senderName)));

  const scriptPrompt = voiceStyle === "tomas"
    ? `Sos empy-bot (grupo Empyreal de WhatsApp, Argentina) narrando con la voz de Tomás en ElevenLabs v4.
Armá un guion corto y picante para mandar en un audio de voz de 20 a 25 segundos (máximo 280 caracteres).
Reglas:
- Hablá en 1ra persona como compinche de grupo, con humor argentino y chicana.
- Resumí de qué hablaron: ${participantsList.join(", ")}.
- Es OBLIGATORIO intercalar tags expresivos entre corchetes para modular la voz y los efectos en ElevenLabs v4, exactamente como en este formato:
  [happy] ¡Hola! ¿Cómo están? [chuckles] Yo por suerte muy bien... aunque por momentos me acuerdo que renunció Messi y... [sad] [sniffles] me pongo a llorar.
- Podés usar únicamente los siguientes tags permitidos:
  Emociones: [weak], [angry], [bored], [menacing], [playful], [tired], [excited], [happy], [sad]
  Vocalizaciones: [clears throat], [coughing], [chuckling], [chuckles], [sighing], [sniffling], [sniffles], [yawning], [laughing], [sharp exhale], [scoffing], [humming], [panting], [gasping]
  Cadencia: [whispering], [singing], [slowly], [softly], [pause], [voice breaking]
  Personaje: [sleepy drowsy voice], [witch voice], [drunken voice]
  Efectos de sonido: [keyboard typing], [echoing], [knocking on door], [bell ringing], [phone ringing], [dog barking], [crowd cheering], [applause], [rain falling], [drum roll], [heartbeat], [engine starting]
- CERO asteriscos, CERO emojis, CERO markdown (#, _, ~). Solo texto plano con los tags entre corchetes intercalados.

Mensajes:
${transcript}

Guion:`.trim()
    : `Sos empy-bot (grupo Empyreal de WhatsApp, Argentina).
Armá un guion corto y picante para mandar en un audio de voz de 20 a 30 segundos.
Reglas:
- Hablá en 1ra persona como compinche de grupo, con humor argentino y chicana.
- Resumí de qué hablaron: ${participantsList.join(", ")}.
- CERO formato, CERO emojis, CERO asteriscos o acotaciones. Solo el texto corrido que dirías al micro.

Mensajes:
${transcript}

Guion:`.trim();

  // 1. Prioridad: Gemma 4 (262K contexto, 14.4K RPD, voz argentina excepcional y ultra rápida)
  const gemmaScript = await generateWithGemma(scriptPrompt, 180, 0.5, "audio-script");
  if (gemmaScript) return gemmaScript.replace(/[*#_~`]/g, "").trim();

  const scriptCandidates = [
    { provider: "gemini", model: "gemini-flash-lite-latest", maxRpm: 15 },
    { provider: "gemini", model: "gemini-flash-latest", maxRpm: 15 },
    { provider: "gemini", model: "gemini-3.1-flash-lite", maxRpm: 15 },
    { provider: "groq", model: "qwen/qwen3.8-27b", maxRpm: 30 },
  ];

  for (const cand of scriptCandidates) {
    if (!canUseModel(cand.model, cand.maxRpm)) continue;
    if (cand.provider === "groq" && isNearGroqLimit()) continue;

    try {
      if (cand.provider === "gemini") {
        const model = genAI.getGenerativeModel({
          model: cand.model,
          safetySettings: GEMINI_SAFETY_SETTINGS,
          generationConfig: { temperature: 0.6, maxOutputTokens: 180 },
        });

        const result = await model.generateContent(scriptPrompt);
        const usage = (result.response as any).usageMetadata;

        if (usage) {
          trackTokens("gemini", cand.model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, "audio-script");
        }

        const text = result.response.text();
        if (text) return text.replace(/[*#_~`]/g, "").trim();
      } else if (cand.provider === "groq") {
        const completion = await groq.chat.completions.create({
          model: cand.model,
          messages: [{ role: "user", content: scriptPrompt }],
          temperature: 0.6,
          max_tokens: 180,
        });

        if (completion.usage) {
          trackTokens("groq", cand.model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0, "audio-script");
        }

        const text = completion.choices[0]?.message?.content;
        if (text) return text.replace(/[*#_~`]/g, "").trim();
      }
    } catch (err: any) {
      console.warn(`[Audio Script AI] Falló ${cand.model}:`, err?.message || err);
    }
  }

  return `Arrancó el bardo en el chat entre ${participantsList.slice(0, 3).join(" y ")} mientras los demás miraban de fondo. Se tiraron chicanas de todo tipo y al final no se pusieron de acuerdo en nada.`;
}

export async function generateGroupSummary(
  chatMessages: { senderName: string; body: string }[],
  mode: "recent" | "today" | "yesterday" = "recent"
): Promise<string> {
  if (chatMessages.length === 0) {
    return mode === "today"
      ? "Che, no encontré mensajes guardados de hoy para resumir."
      : mode === "yesterday"
      ? "Che, no encontré mensajes guardados de ayer para resumir."
      : "Che, no hay suficientes mensajes recientes para resumir.";
  }

  const transcript = chatMessages
    .map((m) => `[${m.senderName}]: ${m.body}`)
    .join("\n");

  const participantsList = Array.from(new Set(chatMessages.map((m) => m.senderName)));
  const modeLabel = mode === "today" ? "DEL DÍA" : mode === "yesterday" ? "DE AYER" : "LO ÚLTIMO";

  const summaryPrompt = `Sos empy-bot (grupo Empyreal de WhatsApp, Argentina). Hacé una síntesis ultra concisa y picante de lo que pasó en el chat.
Participantes: ${participantsList.join(", ")}.
Estructura:
⚡ *RESUMEN RÁPIDO (${modeLabel})*
• *El bardo:* qué desató la charla.
• *Personajes:* qué dijeron o chicanearon.
• *Desenlace:* en qué quedó o remate.
Máximo 3 viñetas breves. Tono porteño compinche. Negrita con un solo asterisco.

Mensajes:
${transcript}

Resumen:`.trim();

  // 1. Prioridad: Gemma 4 (262K contexto, 14.4K RPD, ideal para síntesis largas de chat)
  const gemmaSummary = await generateWithGemma(summaryPrompt, 250, 0.4, "summary");
  if (gemmaSummary) return gemmaSummary;

  const summaryCandidates = [
    { provider: "gemini", model: "gemini-flash-lite-latest", maxRpm: 15 },
    { provider: "gemini", model: "gemini-flash-latest", maxRpm: 15 },
    { provider: "gemini", model: "gemini-3.1-flash-lite", maxRpm: 15 },
    { provider: "groq", model: "qwen/qwen3.8-27b", maxRpm: 30 },
  ];

  for (const cand of summaryCandidates) {
    if (!canUseModel(cand.model, cand.maxRpm)) continue;
    if (cand.provider === "groq" && isNearGroqLimit()) continue;

    try {
      if (cand.provider === "gemini") {
        const model = genAI.getGenerativeModel({
          model: cand.model,
          safetySettings: GEMINI_SAFETY_SETTINGS,
          generationConfig: { temperature: 0.4, maxOutputTokens: 250 },
        });

        const result = await model.generateContent(summaryPrompt);
        const usage = (result.response as any).usageMetadata;

        if (usage) {
          trackTokens("gemini", cand.model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, "summary");
        }

        const text = result.response.text();
        if (text) return text.trim();
      } else if (cand.provider === "groq") {
        const completion = await groq.chat.completions.create({
          model: cand.model,
          messages: [{ role: "user", content: summaryPrompt }],
          temperature: 0.4,
          max_tokens: 250,
        });

        if (completion.usage) {
          trackTokens("groq", cand.model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0, "summary");
        }

        const text = completion.choices[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (err: any) {
      console.warn(`[Summary AI] Falló ${cand.model}:`, err?.message || err);
    }
  }

  return "Perdón che, se me complicó armar el resumen ahora mismo. Intentalo de nuevo en un toque.";
}

export async function askAI(prompt: string, context?: string): Promise<string> {
  const res = await processUserMessage(prompt, context);
  return res.text || "";
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  if (audioBuffer.length > 20 * 1024 * 1024) {
    console.warn("[Whisper Audio] Audio supera el tamaño máximo permitido de 20MB.");
    return null;
  }

  try {
    const file = await toFile(audioBuffer, "voice_note.ogg", { type: "audio/ogg" });
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "es",
      temperature: 0.2,
    });

    trackTokens("groq", "whisper-large-v3-turbo", Math.ceil(audioBuffer.length / 1000), 100, "transcribe");
    return transcription.text.trim();
  } catch (error) {
    console.error("[Whisper Audio] Error:", error);
    return null;
  }
}

export async function processAudioMessage(
  audioBuffer: Buffer,
  prompt: string,
  speakerProfile?: UserProfileWithFacts
): Promise<string> {
  const senderName = speakerProfile?.primaryName || "Usuario";
  const userText = prompt.trim() || "¿Qué opinás de este audio?";

  const audioPart = {
    inlineData: {
      data: audioBuffer.toString("base64"),
      mimeType: "audio/ogg",
    },
  };

  const audioSystemPrompt = `Sos Empy, un integrante más del grupo de WhatsApp "Empyreal" (Argentina).
Acabás de escuchar una nota de voz enviada por @${senderName}.
INSTRUCCIONES:
- Escuchá con atención el audio: analizá tanto el contenido de lo que dice como el tono acústico (risas, bardo, ironía, tristeza, relajo o si está tilteado).
- Respondé como compinche de grupo, con humor argentino, chicana o empatía según corresponda.
- Sé natural y conciso (1 a 2 párrafos cortos como en WhatsApp). Cero formalismos ni saludos robóticos.
- Si el usuario te preguntó algo específico o te pidió tu opinión sobre el audio, respondéselo directo.`;

  const fullPrompt = `[@${senderName}]: ${userText}`;

  const audioCandidates = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.1-flash-lite"];

  for (const modelName of audioCandidates) {
    if (!canUseModel(modelName, 15)) continue;

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: audioSystemPrompt,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
        },
      });

      const result = await model.generateContent([fullPrompt, audioPart]);
      const usage = (result.response as any).usageMetadata;

      if (usage) {
        trackTokens("gemini", modelName, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, "audio-multimodal");
      }

      const text = result.response.text();
      if (text) {
        return text.trim();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[Audio Multimodal] Falló ${modelName}:`, msg);
      if (msg.includes("503") || msg.includes("429") || msg.includes("quota")) {
        setModelCooldown(modelName, 60 * 1000);
      }
    }
  }

  // Fallback transparente: Transcribir con Whisper Turbo y responder mediante el pipeline de texto
  const transcription = await transcribeAudio(audioBuffer);
  if (transcription) {
    const fallbackRes = await processUserMessage(
      `[El usuario mandó una nota de voz que dice: "${transcription}"]. ${userText}`,
      undefined,
      speakerProfile
    );
    return fallbackRes.text || `Escuché que dijiste: "${transcription}".`;
  }

  return "No pude escuchar bien el audio che, ¿me lo mandás de nuevo?";
}