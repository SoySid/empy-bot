import { recordSessionBurnedJoke, addMasterLesson } from "./db/reflection.service.js";

interface LastBotResponseState {
  timestamp: number;
  messageId: string;
}

let lastBotResponse: LastBotResponseState | null = null;
const FEEDBACK_WINDOW_MS = 45 * 1000;

const NEGATIVE_FEEDBACK_REGEX =
  /\b(callate|malo|malisimo|nada que ver|malardo|bot malo|cerra el orto|callate bot|inutil|pesado|repetitivo|siempre lo mismo|aburris)\b/i;

export function registerBotResponse(messageId: string): void {
  lastBotResponse = {
    timestamp: Date.now(),
    messageId,
  };
}

/**
 * Procesa el feedback inmediato de los usuarios:
 * Si el bot acaba de hablar y lo mandan a callar por repetitivo o pesado,
 * aprende la lección agregándola sin borrar el historial completo.
 */
export async function processImplicitFeedback(messageText: string): Promise<void> {
  if (!lastBotResponse) return;

  const now = Date.now();
  if (now - lastBotResponse.timestamp > FEEDBACK_WINDOW_MS) {
    lastBotResponse = null;
    return;
  }

  const cleanText = messageText.trim();

  if (NEGATIVE_FEEDBACK_REGEX.test(cleanText)) {
    console.log(`[Feedback] 🛑 Feedback negativo detectado ("${cleanText}"). Ajustando conducta en vivo.`);
    
    // Si lo retaron por pesado o repetitivo, añade la regla de conducta sin borrar las anteriores
    if (/repetitivo|siempre lo mismo|aburris|pesado/i.test(cleanText)) {
      await addMasterLesson(
        "No repetir el mismo chiste ni ser denso si el grupo pide parar",
        "Feedback en vivo del grupo"
      );
    }

    lastBotResponse = null;
  }
}