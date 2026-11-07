import Groq from "groq-sdk";
import dotenv from "dotenv";
import { trackTokens } from "../token.service.js";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
const TRIAGE_MODEL = "qwen/qwen3.8-27b";

export interface TriageDecision {
  should_intervene: boolean;
  intent: "broma" | "opinion" | "consejo" | "chicana" | "recuerdo" | "respuesta_directa" | "silencio";
  target_users: string[];
  suggested_angle?: string;
  reason?: string;
  needs_web_search?: boolean;
  search_query?: string;
}

/**
 * Capa 2: Triage Rápido con qwen/qwen3.8-27b en Groq
 * Analiza el contexto de la conversación y devuelve un JSON tipado en ~1s,
 * incluyendo clasificación semántica de búsqueda web (cero regexes frágiles).
 */
export async function evaluateTriage(
  recentHistoryText: string,
  isDirectCall: boolean,
  speakerName: string,
  quotedSpeakerName?: string
): Promise<TriageDecision> {
  const targets = [speakerName];
  if (quotedSpeakerName && quotedSpeakerName !== speakerName) {
    targets.push(quotedSpeakerName);
  }

  // 1. Si es llamada directa (@Empy o respuesta a Empy)
  if (isDirectCall) {
    try {
      const completion = await groq.chat.completions.create({
        model: TRIAGE_MODEL,
        messages: [
          {
            role: "system",
            content: `Sos el clasificador de intenciones de "Empy", un bot de WhatsApp para un grupo de amigos.
El usuario le habló o etiquetó directamente a Empy.
Analizá el último mensaje del usuario en el contexto.

Determina si el usuario solicita información fáctica externa o en tiempo real que requiera buscar en internet:
- SÍ requiere búsqueda web (needs_web_search = true): noticias, resultados deportivos, partidos, clima, cotizaciones (dólar, cripto), fechas, eventos, lanzamientos, datos de personajes públicos, definiciones técnicas, etc.
- NO requiere búsqueda web (needs_web_search = false): saludos, bromas, anécdotas personales, chicanas, preguntas sobre integrantes del grupo, opiniones subjetivas, mini-juegos o charla casual.

Respondé ÚNICAMENTE un JSON:
{
  "needs_web_search": boolean,
  "search_query": string
}
Si needs_web_search es true, en search_query escribe una consulta de búsqueda en Google limpia, concisa y neutral (máximo 6 palabras). Si es false, escribe "".`,
          },
          {
            role: "user",
            content: recentHistoryText,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 100,
      });

      if (completion.usage) {
        trackTokens(
          "groq",
          TRIAGE_MODEL,
          completion.usage.prompt_tokens || 0,
          completion.usage.completion_tokens || 0,
          "classifier_direct"
        );
      }

      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          should_intervene: true,
          intent: "respuesta_directa",
          target_users: targets,
          suggested_angle: "Responder al usuario",
          reason: "Llamada directa al bot",
          needs_web_search: Boolean(parsed.needs_web_search),
          search_query: typeof parsed.search_query === "string" ? parsed.search_query.trim() : undefined,
        };
      }
    } catch (directErr) {
      console.warn("[Triage Service] Advertencia evaluando búsqueda en llamada directa:", directErr);
    }

    return {
      should_intervene: true,
      intent: "respuesta_directa",
      target_users: targets,
      suggested_angle: "Responder al usuario",
      reason: "Llamada directa al bot (fallback sin búsqueda)",
      needs_web_search: false,
    };
  }

  // 2. Si es intervención espontánea en la charla grupal
  try {
    const completion = await groq.chat.completions.create({
      model: TRIAGE_MODEL,
      messages: [
        {
          role: "system",
          content: `Sos el moderador de intervenciones de "Empy", un bot de WhatsApp que es un amigo argentino más en el grupo.
Analizá los mensajes recientes de la conversación.
Decidí si Empy debe intervenir espontáneamente.

Criterios para should_intervene = true:
- Hay un debate abierto u opinión colectiva donde Empy puede aportar con naturalidad ("opinion").
- Se prestó para un remate cómico o descansada amistosa muy oportuna ("broma" o "chicana").
- Alguien hizo una pregunta abierta al grupo o pidió una recomendación sincera ("consejo").
- Están hablando de algo que ocurrió en el pasado ("recuerdo").

Criterios para should_intervene = false (SILENCIO OBLIGATORIO):
- Diálogo privado o directo entre 2 personas pasándose datos, coordinando algo o aconsejándose mutuamente.
- Mensajes cortados, fragmentos o charla rápida donde una intervención del bot interrumpiría o sonaría forzada.
- Si no hay un pie CLARO y genuino para sumar, la respuesta DEBE ser should_intervene = false y intent = "silencio". Ante la menor duda, callate.

Criterio de búsqueda web semántica:
- needs_web_search = true si el debate grupal gira en torno a un dato fáctico del mundo real (ej: si están discutiendo quién ganó un partido o qué pasó en una noticia).

Respondé ÚNICAMENTE un JSON con:
{
  "should_intervene": boolean,
  "intent": "broma" | "opinion" | "consejo" | "chicana" | "recuerdo" | "silencio",
  "target_users": string[],
  "suggested_angle": string,
  "reason": string,
  "needs_web_search": boolean,
  "search_query": string
}

REGLAS PARA target_users Y suggested_angle:
- En target_users incluí a los participantes del debate Y a cualquier integrante del grupo mencionado en la charla.
- En suggested_angle definí la postura u objetivo (ej: "Burlarse de la derrota del Rojo", "Opinar sobre el juego"). NO asumas si conocés o no a los integrantes.
- Si needs_web_search es true, search_query debe ser una búsqueda limpia de Google (máximo 6 palabras). Si es false, escribe "".`,
        },
        {
          role: "user",
          content: recentHistoryText,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 160,
    });

    if (completion.usage) {
      trackTokens(
        "groq",
        TRIAGE_MODEL,
        completion.usage.prompt_tokens || 0,
        completion.usage.completion_tokens || 0,
        "classifier_spontaneous"
      );
    }

    const raw = completion.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw);
      let angle = (parsed.suggested_angle || "").trim();
      if (
        !angle ||
        /no tengo|no conozco|desconozco|sin contexto|a menos que|messi/i.test(angle) ||
        angle.length > 60
      ) {
        angle = "Aportar al debate con los datos del grupo";
      }

      return {
        should_intervene: Boolean(parsed.should_intervene),
        intent: parsed.intent || "silencio",
        target_users: Array.isArray(parsed.target_users) ? parsed.target_users : [],
        suggested_angle: angle,
        reason: parsed.reason,
        needs_web_search: Boolean(parsed.needs_web_search),
        search_query: typeof parsed.search_query === "string" ? parsed.search_query.trim() : undefined,
      };
    }
  } catch (err: any) {
    console.warn("[Triage Service] Error evaluando triage en Groq:", err?.message || err);
  }

  return {
    should_intervene: false,
    intent: "silencio",
    target_users: [],
    reason: "Fallback por error o descarte",
    needs_web_search: false,
  };
}
