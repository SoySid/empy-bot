import { Command, CommandContext } from "./types.js";
import { prisma } from "../services/db/prisma.js";
import { getLiveBufferMessages } from "../services/db/message.service.js";
import {
  generateGroupAudioScript,
  generateGroupSummary,
} from "../services/ai.service.js";
import {
  getFishVoiceMap,
  generateFishAudioTTS,
  generateMicrosoftTTS,
} from "../services/tts.service.js";
import { registerBotResponse } from "../services/feedback.service.js";
import {
  generateElevenLabsTTS,
  ELEVENLABS_TOMAS_VOICE_ID,
  isElevenLabsConfigured,
} from "../services/elevenlabs.service.js";
import { getGroupParticipantJidSet } from "../services/whatsapp-identity.js";

function getArgentinaDayBounds(offsetDays = 0): { start: Date; end: Date } {
  const now = new Date();
  const argDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
  const [year, month, day] = argDateStr.split("-").map(Number);
  // Argentina está en UTC-3. 00:00 en Argentina equivale a las 03:00 UTC.
  const startMs = Date.UTC(year, month - 1, day + offsetDays, 3, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
}

export const summaryCommand: Command = {
  name: "resumen",
  aliases: ["resumengrupo", "summary", "resume"],
  description: "Genera un resumen oral en nota de voz (PTT nativo de WhatsApp vía Fish Audio) o texto.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    try {
      const tokens = cleanText.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const isToday = tokens.some((t) => t === "hoy" || t === "today" || t === "dia" || t === "día");
      const isYesterday = tokens.some((t) => t === "ayer" || t === "yesterday");
      const wantsText = tokens.some((t) => t === "texto" || t === "txt");

      const parsedCount = tokens.map((t) => parseInt(t, 10)).find((n) => !isNaN(n) && n > 0);

      let limit = 100;
      let dateFilter: { gte?: Date; lte?: Date } | undefined;
      let mode: "recent" | "today" | "yesterday" = "recent";

      if (isToday) {
        mode = "today";
        const bounds = getArgentinaDayBounds(0);
        dateFilter = { gte: bounds.start, lte: new Date() };
        limit = parsedCount ? Math.min(parsedCount, 500) : 300;
      } else if (isYesterday) {
        mode = "yesterday";
        const bounds = getArgentinaDayBounds(-1);
        dateFilter = { gte: bounds.start, lte: bounds.end };
        limit = parsedCount ? Math.min(parsedCount, 500) : 300;
      } else if (parsedCount) {
        limit = Math.min(parsedCount, 500);
        mode = "recent";
      }

      // Reacción de micrófono mientras procesa
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🎙️", key: msg.key } });
      }

      const allowedUserJids = await getGroupParticipantJidSet(sock, remoteJid);

      const whereClause: any = {
        isBot: false,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(allowedUserJids ? { userJid: { in: allowedUserJids } } : {}),
      };

      const rawMessages = await prisma.rawMessage.findMany({
        where: whereClause,
        take: limit,
        orderBy: { createdAt: "desc" },
      });

      let chronological: { senderName: string; body: string }[] = [];

      if (rawMessages.length > 0) {
        chronological = rawMessages
          .reverse()
          .filter((m) => m.body && !m.body.startsWith("!") && !m.body.startsWith(".") && !m.body.startsWith("/"))
          .map((m) => ({
            senderName: m.senderName,
            body: m.body,
          }));
      } else {
        chronological = getLiveBufferMessages(limit).filter(
          (m) => m.body && !m.body.startsWith("!") && !m.body.startsWith(".") && !m.body.startsWith("/")
        );
      }

      if (chronological.length === 0) {
        const emptyMsg =
          mode === "today"
            ? "Che, todavía no tengo mensajes guardados de hoy para resumir."
            : mode === "yesterday"
            ? "Che, no encontré mensajes guardados de ayer para resumir."
            : "Che, no hay suficientes mensajes recientes para resumir.";
        await sock.sendMessage(remoteJid, { text: emptyMsg }, { quoted: msg as any });
        return;
      }

      // Modo texto explícito (fallback si el usuario pidió !resumen texto)
      if (wantsText) {
        const summaryText = await generateGroupSummary(chronological, mode);
        const sent = await sock.sendMessage(
          remoteJid,
          { text: summaryText },
          { quoted: msg as any }
        );
        if (sent?.key?.id) registerBotResponse(sent.key.id);
        return;
      }

      // MODO POR DEFECTO: NOTA DE VOZ (PTT FISH AUDIO)
      // Resolver voz elegida o aleatoria sin colisionar con palabras de fecha o cantidad
      const voiceMap = getFishVoiceMap();
      const availableVoices = Object.keys(voiceMap).filter((v) => Boolean(voiceMap[v]));

      const reservedWords = new Set([
        "hoy", "dia", "día", "today",
        "ayer", "yesterday",
        "audio", "texto", "txt",
        "resumen", "resume", "summary"
      ]);

      const requestedVoiceToken = tokens.find(
        (t) => !reservedWords.has(t) && isNaN(Number(t)) && voiceMap[t]
      );

      let selectedVoice = requestedVoiceToken || "";
      if (!selectedVoice && availableVoices.length > 0) {
        // Voz aleatoria si no especificó ninguna
        selectedVoice = availableVoices[Math.floor(Math.random() * availableVoices.length)];
      }

      const referenceId = selectedVoice ? voiceMap[selectedVoice] : "";

      // Generar guion oral ultra conciso y picante (30-45s)
      const isTomas = tokens.some((t) => t === "tomas" || t === "tomás" || t === "chris");
      const audioScript = await generateGroupAudioScript(chronological, mode, isTomas ? "tomas" : "standard");

      let pttBuffer: Buffer | null = null;

      if (isTomas) {
        if (isElevenLabsConfigured()) {
          try {
            console.log(`[Summary Command] 🎙️ Generando resumen con voz de Tomás (ElevenLabs v4, ${audioScript.length} chars)...`);
            const voiceId = process.env.ELEVENLABS_VOICE_TOMAS || ELEVENLABS_TOMAS_VOICE_ID;
            const modelId = process.env.ELEVENLABS_MODEL || "eleven_v4";
            pttBuffer = await generateElevenLabsTTS(audioScript, voiceId, modelId, 650);
          } catch (elevenErr: any) {
            console.error("[Summary Command] ❌ ElevenLabs falló para Tomás:", elevenErr?.message || elevenErr);
          }
        } else {
          console.warn("[Summary Command] ⚠️ isElevenLabsConfigured() retornó false (falta ELEVENLABS_API_KEY).");
        }
      } else if (referenceId) {
        try {
          pttBuffer = await generateFishAudioTTS(audioScript, referenceId);
        } catch (fishErr: any) {
          console.warn(`[Summary Command] Fish Audio falló (${selectedVoice}), usando fallback voz argentina:`, fishErr?.message || fishErr);
        }
      }

      // Fallback a Microsoft TTS argentino si Fish Audio no tenía voz o falló
      if (!pttBuffer) {
        pttBuffer = await generateMicrosoftTTS(audioScript, "es-AR-TomasNeural");
      }

      console.log(`[Summary Command] 🎙️ Audio generado (${pttBuffer?.length || 0} bytes). Enviando PTT a ${remoteJid}...`);
      const sentAudio = await sock.sendMessage(
        remoteJid,
        {
          audio: pttBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        },
        { quoted: msg as any }
      );

      if (sentAudio?.key?.id) {
        console.log(`[Summary Command] ✅ Audio enviado exitosamente (ID: ${sentAudio.key.id})`);
        registerBotResponse(sentAudio.key.id);
      }
    } catch (error) {
      console.error("[Summary Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al generar el resumen en audio del grupo." },
        { quoted: msg as any }
      );
    }
  },
};
