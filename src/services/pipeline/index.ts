import { MessageContext } from "../../handlers/types.js";
import { evaluateHeuristic, recordInterventionTime, tryAcquirePipeline, releasePipeline } from "./heuristic-filter.js";
import { evaluateTriage } from "./triage.service.js";
import { hydrateContextForActiveUsers } from "./rag-hydration.service.js";
import { generateGroupResponse } from "./generator.service.js";
import { getRecentLiveMessages, recordIncomingMessage } from "../db/message.service.js";
import { parseOutboundMentions } from "../db/user.service.js";
import { registerBotResponse } from "../feedback.service.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pipeline de Chat en Vivo (4 Capas)
 * 1. Heurística TypeScript (costo $0)
 * 2. Triage ultrarrápido con qwen/qwen3.8-27b (Groq)
 * 3. Hidratación RAG selectiva (Neon DB + GroupLexicon)
 * 4. Generación conversacional con Gemma 4 26B (Google AI Studio)
 */
export async function runLiveChatPipeline(ctx: MessageContext): Promise<boolean> {
  const { sock, msg, remoteJid, senderProfile, quotedSenderProfile } = ctx;

  // ==========================================
  // CAPA 1: Heurística en TypeScript (Local)
  // ==========================================
  const heuristic = evaluateHeuristic(ctx);
  if (!heuristic.pass) {
    return false;
  }

  if (!tryAcquirePipeline()) {
    return false;
  }
  try {

  // Ventana de contexto ampliada (15 mensajes en llamada directa, 20 en espontáneo) para capturar el debate completo
  const historyLimit = heuristic.isDirectCall ? 15 : 20;
  const recentLive = getRecentLiveMessages(historyLimit);
  const activeUserJids: string[] = [senderProfile.jid];
  const historyLines: string[] = [];

  for (const m of recentLive) {
    if (m.jid && !activeUserJids.includes(m.jid)) {
      activeUserJids.push(m.jid);
    }
    const reply = m.replyToSender ? ` (a @${m.replyToSender})` : "";
    historyLines.push(`[${m.sender}${reply}]: ${m.text}`);
  }

  // Si el mensaje actual no está en la lista aún, añadirlo al final
  const currentReply = quotedSenderProfile?.primaryName ? ` (a @${quotedSenderProfile.primaryName})` : "";
  const currentMsgLine = `[${senderProfile.primaryName}${currentReply}]: ${ctx.cleanBody}`;
  if (!historyLines.some((l) => l.startsWith(`[${senderProfile.primaryName}`) && l.includes(ctx.cleanBody))) {
    historyLines.push(currentMsgLine);
  }

  const recentHistoryText = historyLines.slice(-historyLimit).join("\n");
  const speakerName = senderProfile.primaryName || "Usuario";
  const quotedSpeakerName = quotedSenderProfile?.primaryName;

  // ==========================================
  // CAPA 2: Triage Rápido (qwen/qwen3.8-27b en Groq)
  // ==========================================
  const triage = await evaluateTriage(
    recentHistoryText,
    heuristic.isDirectCall,
    speakerName,
    quotedSpeakerName
  );

  if (!triage.should_intervene || triage.intent === "silencio") {
    console.log(`[Pipeline Triage] 🤫 Decisión: Silencio (${triage.reason || "Sin aporte necesario"}).`);
    return false;
  }

  console.log(`[Pipeline Triage] 💡 Intervención aprobada! Intención: "${triage.intent}" | Enfoque: "${triage.suggested_angle || "general"}"`);

  // ==========================================
  // CAPA 3: Hidratación RAG Quirúrgica (Neon DB)
  // ==========================================
  const ragContext = await hydrateContextForActiveUsers(
    activeUserJids,
    recentHistoryText,
    triage.intent,
    triage.target_users
  );

  // Simular presencia de tipeo natural antes de responder
  try {
    await sock.sendPresenceUpdate("composing", remoteJid);
  } catch {}

  // ==========================================
  // CAPA 4: Generación con Gemma 4 31B (AI Studio)
  // ==========================================
  const replyText = await generateGroupResponse(
    recentHistoryText,
    triage,
    ragContext,
    speakerName
  );

  if (!replyText) {
    console.warn("[Pipeline] No se obtuvo respuesta del generador.");
    try {
      await sock.sendPresenceUpdate("paused", remoteJid);
    } catch {}
    if (heuristic.isDirectCall) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "Che, se me complicó la conexión con la IA en este momento. Probá de nuevo en un toque o avisale al admin que revise las API keys.",
        },
        { quoted: msg as any }
      ).catch(() => {});
    }
    return false;
  }

  // Parsear menciones salientes para que WhatsApp cree los tags azules reales
  const { formattedText, mentions } = parseOutboundMentions(replyText);

  // Enviar mensaje a WhatsApp mediante Baileys
  const sentMsg = await sock.sendMessage(
    remoteJid,
    {
      text: formattedText,
      mentions,
    },
    { quoted: msg as any }
  );

  if (sentMsg?.key?.id) {
    registerBotResponse(sentMsg.key.id);
  }

  try {
    await sock.sendPresenceUpdate("paused", remoteJid);
  } catch {}

  // Registrar intervención para métricas y memoria viva
  recordInterventionTime();
  await recordIncomingMessage(
    "bot@s.whatsapp.net",
    "Empy",
    formattedText,
    true,
    speakerName,
    ctx.cleanBody
  );

  console.log(`[Pipeline] 💬 Respuesta enviada exitosamente al grupo por @Empy.`);
  return true;
  } finally {
    releasePipeline();
  }
}
