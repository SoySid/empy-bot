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
}

/**
 * Capa 2: Triage Rápido con qwen/qwen3.8-27b en Groq
 * Analiza los últimos 5 mensajes y devuelve un JSON tipado en ~1s.
 */
export async function evaluateTriage(
  recentHistoryText: string,
  isDirectCall: boolean,
  speakerName: string,
  quotedSpeakerName?: string
): Promise<TriageDecision> {
  // Si fue llamado directamente (@Empy o respuesta a Empy), bypass total de LLM para ahorrar 100% de tokens de clasificación
  if (isDirectCall) {
    const targets = [speakerName];
    if (quotedSpeakerName && quotedSpeakerName !== speakerName) {
      targets.push(quotedSpeakerName);
    }
    return {
      should_intervene: true,
      intent: "respuesta_directa",
      target_users: targets,
      suggested_angle: "Responder al usuario",
      reason: "Llamada directa al bot (bypass)",
    };
  }

  // Si es espontáneo, qwen/qwen3.8-27b evalúa si amerita meterse
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

Respondé ÚNICAMENTE un JSON con:
{
  "should_intervene": boolean,
  "intent": "broma" | "opinion" | "consejo" | "chicana" | "recuerdo" | "silencio",
  "target_users": string[],
  "suggested_angle": string,
  "reason": string
}

REGLAS PARA target_users Y suggested_angle:
- En target_users incluí a los participantes del debate Y a cualquier integrante del grupo mencionado en la charla.
- En suggested_angle definí la postura u objetivo (ej: "Burlarse de la derrota del Rojo", "Opinar sobre el juego"). NO asumas si conocés o no a los integrantes.`,
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
        "classifier"
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
  };
}
