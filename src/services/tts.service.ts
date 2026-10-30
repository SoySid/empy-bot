import { MsEdgeTTS, OUTPUT_FORMAT } from "edge-tts-node";
import * as googleTTS from "google-tts-api";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import { getCustomVoicesMap } from "./voice.service.js";

dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Mapa de voces de Fish Audio (escaneo dinámico de process.env)
export function getFishVoiceMap(): Record<string, string> {
  const configuredMap: Record<string, string> = {};

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("FISH_VOICE_")) {
      const voiceName = key.replace("FISH_VOICE_", "").toLowerCase();
      const val = process.env[key]?.trim();
      if (val) {
        configuredMap[voiceName] = val;
      }
    }
  }

  // Aliases compartidos
  const voiceAliasesEnv = process.env.VOICE_ALIASES || "";
  if (voiceAliasesEnv) {
    for (const pair of voiceAliasesEnv.split(",")) {
      const [a, b] = pair.split(":").map((s) => s.trim().toLowerCase());
      if (a && b) {
        if (configuredMap[a] && !configuredMap[b]) configuredMap[b] = configuredMap[a];
        if (configuredMap[b] && !configuredMap[a]) configuredMap[a] = configuredMap[b];
      }
    }
  }


  // Incorporar voces personalizadas guardadas dinámicamente
  const customMap = getCustomVoicesMap();
  for (const [k, v] of Object.entries(customMap)) {
    if (v && v.trim().length > 0) {
      configuredMap[k.toLowerCase()] = v.trim();
    }
  }

  return configuredMap;
}

/**
 * Convierte cualquier Buffer de audio (MP3/WAV) a formato OGG Opus (PTT de WhatsApp).
 * Limpieza garantizada en bloque finally.
 */
export async function convertToWhatsAppPtt(inputBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
  const outputPath = path.join(tmpDir, `output_${Date.now()}_${Math.random().toString(36).substring(7)}.ogg`);

  await fs.promises.writeFile(inputPath, inputBuffer);

  try {
    return await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-c:a libopus",
          "-b:a 32k",
          "-vbr on",
          "-ar 48000",
          "-ac 1",
        ])
        .toFormat("ogg")
        .on("end", async () => {
          try {
            const oggBuffer = await fs.promises.readFile(outputPath);
            resolve(oggBuffer);
          } catch (err) {
            reject(err);
          }
        })
        .on("error", (err) => {
          reject(err);
        })
        .save(outputPath);
    });
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}

/**
 * Genera audio usando Microsoft Edge Neural TTS (Gratuito 🇦🇷) con fallback a Google TTS.
 */
export async function generateMicrosoftTTS(
  text: string,
  voice = "es-AR-TomasNeural"
): Promise<Buffer> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("El texto está vacío.");

  const tmpDir = os.tmpdir();
  const tmpFilePath = path.join(tmpDir, `edge_tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

  try {
    const tts = new MsEdgeTTS({});
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    await tts.toFile(tmpFilePath, cleanText);
    const mp3Buffer = await fs.promises.readFile(tmpFilePath);
    return await convertToWhatsAppPtt(mp3Buffer);
  } catch (edgeErr: any) {
    console.warn("[Microsoft TTS] Falló Edge-TTS WebSocket, usando fallback Google TTS:", edgeErr?.message || edgeErr);
    const audioChunks = await googleTTS.getAllAudioBase64(cleanText, {
      lang: "es",
      slow: false,
      host: "https://translate.google.com",
      timeout: 20000,
    });
    const mp3Buffer = Buffer.concat(audioChunks.map((chunk) => Buffer.from(chunk.base64, "base64")));
    return await convertToWhatsAppPtt(mp3Buffer);
  } finally {
    await fs.promises.unlink(tmpFilePath).catch(() => {});
  }
}

/**
 * Mapeador de emociones y prosodia para Fish Audio y TTS.
 * Traduce tags en español/inglés a descriptores acústicos de Fish Audio S2
 * y calibra la temperatura para máxima expresividad.
 */
export interface ProcessedTTSInput {
  processedText: string;
  temperature: number;
  topP: number;
  prosody?: {
    speed?: number;
    volume?: number;
  };
}

export function processEmotionTags(rawText: string): ProcessedTTSInput {
  let text = rawText.trim();
  let hasEmotion = false;
  let isSinging = false;
  let speedMultiplier = 1.0;

  // Mapa de expresiones y emociones (soporta [tag] y (tag))
  const emotionRules: [RegExp, string][] = [
    // Cantar / Melodía
    [/[\[\(](?:cantar|cantando|canto|canta|sing|singing)[\]\)]/gi, "[singing]"],
    // Gritar / Screaming
    [/[\[\(](?:grito|gritando|gritar|shout|shouting|screaming|grita)[\]\)]/gi, "[shouting]"],
    // Enojo / Furia / Angry
    [/[\[\(](?:enojado|enojada|furia|furiose|caliente|bronca|angry|furious)[\]\)]/gi, "[angry]"],
    // Susurro / Whispering
    [/[\[\(](?:susurro|susurrando|susurrar|whisper|whispering)[\]\)]/gi, "[whispering]"],
    // Llanto / Triste / Crying
    [/[\[\(](?:llanto|llorando|llorar|triste|tristeza|sad|crying|sob)[\]\)]/gi, "[sad]"],
    // Risa / Laughing
    [/[\[\(](?:risa|risas|riendo|reir|laugh|laughing|laughter)[\]\)]/gi, "[laughing]"],
    // Sorpresa / Gasp
    [/[\[\(](?:sorpresa|sorprendido|asombrado|gasp|shocked)[\]\)]/gi, "[gasp]"],
    // Suspiro / Sigh
    [/[\[\(](?:suspiro|suspirando|sigh)[\]\)]/gi, "[sigh]"],
    // Miedo / Asustado / Scared
    [/[\[\(](?:miedo|asustado|cagazo|scared|terrified)[\]\)]/gi, "[scared]"],
    // Sarcástico / Mocking
    [/[\[\(](?:sarcasmo|sarcastico|sarcastic|burlon|burla)[\]\)]/gi, "[sarcastic]"],
    // Feliz / Alegre / Excited
    [/[\[\(](?:feliz|alegre|emocionado|contento|happy|excited)[\]\)]/gi, "[happy]"],
    // Rápido / Lento
    [/[\[\(](?:rapido|fast|speedup)[\]\)]/gi, ""],
    [/[\[\(](?:lento|slow)[\]\)]/gi, ""],
  ];

  if (/[\[\(](?:rapido|fast|speedup)[\]\)]/i.test(text)) {
    speedMultiplier = 1.25;
    hasEmotion = true;
  } else if (/[\[\(](?:lento|slow)[\]\)]/i.test(text)) {
    speedMultiplier = 0.8;
    hasEmotion = true;
  }

  for (const [regex, replacement] of emotionRules) {
    if (regex.test(text)) {
      hasEmotion = true;
      if (replacement.includes("singing")) {
        isSinging = true;
      }
      text = text.replace(regex, replacement).trim();
    }
  }

  // Si el usuario ya usó un tag en inglés nativo (ej: [whispering] o [angry])
  if (/\[[a-zA-Z\s,]+\]/.test(text)) {
    hasEmotion = true;
    if (/\[.*sing.*\]/i.test(text)) {
      isSinging = true;
    }
  }

  // Asegurar que el texto termine con puntuación normal para facilitar el corte limpio del audio
  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  // Temperatura fija en 0.70 (valor oficial y estable para Fish Audio S2/S2.1)
  // Temperaturas >0.80 provocan desbordes, glitches y bucles acústicos infinitos
  const temperature = 0.7;
  const topP = 0.7;

  return {
    processedText: text,
    temperature,
    topP,
    ...(speedMultiplier !== 1.0 ? { prosody: { speed: speedMultiplier } } : {}),
  };
}

/**
 * Genera audio clonado usando la API de Fish Audio.
 * Admite modulación emocional nativa vía tags [enojado], [grito], [cantando], [susurro], [triste], etc.
 */
export async function generateFishAudioTTS(
  text: string,
  referenceId: string
): Promise<Buffer> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) {
    throw new Error("No se ha configurado FISH_AUDIO_API_KEY en el archivo .env.");
  }

  const cleanText = text.trim();
  if (!cleanText) throw new Error("El texto está vacío.");

  const { processedText, temperature, topP, prosody } = processEmotionTags(cleanText);

  const payload: Record<string, any> = {
      text: processedText,
      reference_id: referenceId,
      format: "mp3",
      temperature,
      top_p: topP,
    };

    if (prosody) {
      payload.prosody = prosody;
    }

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: process.env.FISH_AUDIO_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 400) {
        throw new Error(
          `⚠️ Referencia de voz no encontrada (400). Verificá que el reference_id "${referenceId}" exista en tu cuenta Fish Audio. Usa la API /v1/voices o el SDK para listar tus voces y obtener el ID correcto.\nDetalles: ${errorText}`
        );
      }
      if (response.status === 402) {
        throw new Error(
          "⚠️ Tu cuenta de Fish Audio se quedó sin saldo/créditos (Error 402). Recargá créditos en https://fish.audio o usá otra voz gratuita."
        );
      }
      throw new Error(`Error de Fish Audio API (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mp3Buffer = Buffer.from(arrayBuffer);
    return convertToWhatsAppPtt(mp3Buffer);
}
