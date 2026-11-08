import dotenv from "dotenv";
import { convertToWhatsAppPtt } from "./tts.service.js";

dotenv.config();

export const ELEVENLABS_TOMAS_VOICE_ID = "QK4xDwo9ESPHA4JNUpX3";
export const DEFAULT_ELEVENLABS_MODEL = "eleven_v4";
export const MAX_ELEVENLABS_CHARS = 350;

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/**
 * Genera audio utilizando la API de ElevenLabs (soporta modelo eleven_v4 con tags emocionales y efectos)
 * y lo convierte a formato OGG Opus nativo para WhatsApp (PTT).
 */
export async function generateElevenLabsTTS(
  text: string,
  voiceId: string = process.env.ELEVENLABS_VOICE_TOMAS || ELEVENLABS_TOMAS_VOICE_ID,
  modelId: string = process.env.ELEVENLABS_MODEL || DEFAULT_ELEVENLABS_MODEL
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("No se ha configurado ELEVENLABS_API_KEY en el archivo de entorno (.env).");
  }

  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("El texto a sintetizar no puede estar vacío.");
  }

  if (cleanText.length > MAX_ELEVENLABS_CHARS) {
    throw new Error(
      `El texto supera el límite seguro de ${MAX_ELEVENLABS_CHARS} caracteres (${cleanText.length} caracteres). Por favor recortalo para no agotar la cuota mensual.`
    );
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    if (response.status === 401) {
      throw new Error("Error 401 en ElevenLabs: API Key no autorizada o inválida.");
    }
    if (response.status === 429) {
      throw new Error("Error 429 en ElevenLabs: Se ha alcanzado el límite de cuota o rate-limit mensual.");
    }
    if (response.status === 400) {
      throw new Error(`Error 400 en ElevenLabs: Parámetros o voz no válidos. ${errorDetails}`);
    }
    throw new Error(`Error en ElevenLabs API (${response.status}): ${errorDetails}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mp3Buffer = Buffer.from(arrayBuffer);
  return convertToWhatsAppPtt(mp3Buffer);
}
