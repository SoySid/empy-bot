import { WASocket, proto } from "@whiskeysockets/baileys";
import { resolveOrRegisterUser, syncGroupParticipants } from "../services/db/user.service.js";
import { recordIncomingMessage } from "../services/db/message.service.js";
import { processImplicitFeedback } from "../services/feedback.service.js";
import { extractMessageAuthor, normalizeToPhoneJid } from "../services/whatsapp-identity.js";
import { MessageContext } from "./types.js";
import { handleTriggerStickers } from "./trigger.handler.js";
import { handlePrefixCommand } from "./command.handler.js";
import { handleAiInteraction } from "./ai.handler.js";
import { handleSpontaneousReaction } from "./spontaneous.handler.js";
import { handleDestinyEvents, handleBusinessPassiveIncome } from "../services/economy.service.js";
import { consumeHungerOnMessage, interceptStarvedUserMessage } from "../services/hunger.service.js";
import { runLiveChatPipeline } from "../services/pipeline/index.js";
import { interceptGameGuess } from "../services/games/game-interceptor.js";
import { detectPromiseIntent, createSocialPromise } from "../services/promise.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import { isUserIgnoredByRoulette } from "../services/games/ruletarusa.service.js";


const TARGET_GROUP_JID: string = (process.env.GROUP_JID || "").replace(/['"]/g, "").trim();
const PREFIX: string = process.env.BOT_PREFIX || "!";
const BOT_BOOT_TIME = Math.floor(Date.now() / 1000);
const processedMessageMap = new Map<string, number>();
const MESSAGE_DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutos

// Rate limiter en memoria para mitigar ráfagas/flooding maliciosas por usuario
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const userRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 3500;
const MAX_MESSAGES_PER_WINDOW = 8;

function isSenderFlooding(senderJid: string): boolean {
  const now = Date.now();
  const entry = userRateLimits.get(senderJid);
  if (!entry || now > entry.resetAt) {
    userRateLimits.set(senderJid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (userRateLimits.size > 500) {
      for (const [key, value] of userRateLimits.entries()) {
        if (now > value.resetAt) userRateLimits.delete(key);
      }
    }
    return false;
  }
  entry.count++;
  return entry.count > MAX_MESSAGES_PER_WINDOW;
}

/**
 * Despachador principal de mensajes de WhatsApp.
 * Valida, filtra anti-spam temprano, deduplica, enriquece el contexto y distribuye secuencialmente a los manejadores.
 */
export async function dispatchMessage(sock: WASocket, msg: proto.IWebMessageInfo): Promise<void> {
  try {
    if (!msg.message || !msg.key || msg.key.fromMe) return;

    // 1. Filtrar mensajes antiguos previos al encendido del bot (con margen de 30s para evitar descartar mensajes en vuelo por drift horario)
    let msgTimestamp = 0;
    if (typeof msg.messageTimestamp === "number") {
      msgTimestamp = msg.messageTimestamp;
    } else if (typeof msg.messageTimestamp === "bigint") {
      msgTimestamp = Number(msg.messageTimestamp);
    } else if (msg.messageTimestamp && typeof (msg.messageTimestamp as any).toNumber === "function") {
      msgTimestamp = (msg.messageTimestamp as any).toNumber();
    } else if ((msg.messageTimestamp as any)?.low) {
      msgTimestamp = (msg.messageTimestamp as any).low;
    }

    if (msgTimestamp && msgTimestamp < BOT_BOOT_TIME - 30) {
      return;
    }

  // 2. Deduplicación en memoria de IDs de mensajes con TTL
  const msgId = msg.key.id;
  if (msgId) {
    const now = Date.now();
    const existingTs = processedMessageMap.get(msgId);
    if (existingTs && now - existingTs < MESSAGE_DEDUP_TTL_MS) return;
    processedMessageMap.set(msgId, now);

    if (processedMessageMap.size > 2000) {
      const sweepLimit = now - MESSAGE_DEDUP_TTL_MS;
      for (const [id, ts] of processedMessageMap.entries()) {
        if (ts < sweepLimit) processedMessageMap.delete(id);
      }
    }
  }

  // 3. Cerrojo estricto fail-closed: solo se admiten mensajes del grupo objetivo configurado
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || !TARGET_GROUP_JID || remoteJid !== TARGET_GROUP_JID || !remoteJid.endsWith("@g.us")) {
    return;
  }
  const isGroup = true;

  // 4. Filtro temprano de protocolos y stubs de WhatsApp con captura de reacciones para dilemas
  const rawMsg = msg.message;
  if (rawMsg.reactionMessage) {
    return;
  }

  if (
    rawMsg.protocolMessage ||
    rawMsg.senderKeyDistributionMessage ||
    rawMsg.pollUpdateMessage
  ) {
    return;
  }

  // 5. Extracción y normalización de contenido y contexto
  const normalizedMsg =
    rawMsg?.ephemeralMessage?.message ||
    rawMsg?.viewOnceMessage?.message ||
    rawMsg?.viewOnceMessageV2?.message ||
    rawMsg?.documentWithCaptionMessage?.message ||
    rawMsg;

  const hasMedia = !!(
    normalizedMsg?.imageMessage ||
    normalizedMsg?.videoMessage ||
    normalizedMsg?.audioMessage ||
    normalizedMsg?.stickerMessage ||
    normalizedMsg?.documentMessage
  );

  const body =
    normalizedMsg?.conversation ||
    normalizedMsg?.extendedTextMessage?.text ||
    normalizedMsg?.imageMessage?.caption ||
    normalizedMsg?.videoMessage?.caption ||
    normalizedMsg?.documentMessage?.caption ||
    "";

  // Si el mensaje carece de texto y de contenido multimedia procesable, descartar
  if (!body && !hasMedia) {
    return;
  }

  console.log(`[Dispatcher] 📩 Mensaje entrante de ${remoteJid}: "${body.slice(0, 60)}"`);

  // 6. Extracción canónica del autor y filtro anti-flooding temprano
  const authorInfo = await extractMessageAuthor(msg);
  const senderRaw = authorInfo.canonicalJid || authorInfo.rawSender;
  if (!senderRaw) return;

  // Si el mensaje proviene de un LID no resuelto en un grupo, sincronizar participantes en background
  if (authorInfo.isLid && authorInfo.rawSender === authorInfo.canonicalJid && remoteJid.endsWith("@g.us")) {
    syncGroupParticipants(sock, remoteJid).catch(() => {});
  }

  // Normalizar participant en msg.key al teléfono canónico si es posible para asegurar que Baileys cite correctamente
  if (msg.key && authorInfo.canonicalJid && authorInfo.canonicalJid.endsWith("@s.whatsapp.net")) {
    msg.key.participant = authorInfo.canonicalJid;
  }

  if (isSenderFlooding(senderRaw)) {
    console.warn(`[Anti-Spam] Descartando mensaje por ráfaga excesiva de ${senderRaw}`);
    return;
  }

  // 7. Extracción de identificadores del bot para detección de menciones/respuestas
  const rawBotId = sock.user?.id || "";
  const botLid = sock.user?.lid || "";
  const botDigits = rawBotId.split(":")[0].replace(/\D/g, "");
  const botLidDigits = botLid.split(":")[0].replace(/\D/g, "");

  const contextInfo =
    normalizedMsg?.extendedTextMessage?.contextInfo ||
    normalizedMsg?.imageMessage?.contextInfo ||
    normalizedMsg?.videoMessage?.contextInfo ||
    normalizedMsg?.audioMessage?.contextInfo ||
    normalizedMsg?.stickerMessage?.contextInfo;

  const quotedMsg = contextInfo?.quotedMessage;
  const quotedParticipant = contextInfo?.participant
    ? normalizeToPhoneJid(contextInfo.participant)
    : "";
  const mentionedJidList = contextInfo?.mentionedJid || [];

  // 8. Resolución en base de datos con identidades canónicas
  const senderProfile = await resolveOrRegisterUser(senderRaw, msg.pushName);
  const quotedSenderProfile = quotedParticipant
    ? await resolveOrRegisterUser(quotedParticipant)
    : undefined;

  // 8a. Si el usuario está desmayado por inanición (0%), borrar su mensaje a menos que sea comando de morfi
  if (remoteJid.endsWith("@g.us")) {
    const isStarved = await interceptStarvedUserMessage(
      sock,
      remoteJid,
      senderProfile,
      msg.key,
      body
    );
    if (isStarved) return;
  }


  const quotedSnippet =
    quotedMsg?.conversation ||
    quotedMsg?.extendedTextMessage?.text ||
    quotedMsg?.imageMessage?.caption ||
    quotedMsg?.videoMessage?.caption ||
    "";

  // 9. Procesamiento de feedback implícito y registro de historial crudo (solo mensajes humanos que NO sean comandos)
  if (body && !body.trim().startsWith(PREFIX)) {
    await Promise.allSettled([
      processImplicitFeedback(body),
      recordIncomingMessage(
        senderProfile.jid,
        senderProfile.primaryName,
        body,
        false,
        quotedSenderProfile?.primaryName,
        quotedSnippet,
        msg
      ),
    ]);

    // Tareas secundarias de grupo en paralelo para no frenar la cola FIFO de mensajes
    if (isGroup) {
      const sideTasks: Promise<unknown>[] = [
        handleDestinyEvents(sock, remoteJid, senderProfile.jid),
        handleBusinessPassiveIncome(sock, remoteJid, senderProfile.jid),
        consumeHungerOnMessage(sock, remoteJid, senderProfile),
      ];

      if (detectPromiseIntent(body)) {
        sideTasks.push(
          (async () => {
            try {
              await createSocialPromise({
                chatJid: remoteJid,
                userJid: senderProfile.jid,
                senderName: senderProfile.primaryName,
                promiseText: body.trim(),
                waMessageId: msg.key?.id || undefined,
              });

              if (msg.key) {
                await sock.sendMessage(remoteJid, { react: { text: "✍️", key: msg.key } }).catch(() => {});
              }
            } catch (err) {
              console.error("[Dispatcher] Error registrando promesa en vivo:", err);
            }
          })()
        );
      }

      await Promise.allSettled(sideTasks);
    }
  }

  const hasQuotedMedia = !!(
    quotedMsg?.imageMessage ||
    quotedMsg?.videoMessage ||
    quotedMsg?.audioMessage ||
    quotedMsg?.stickerMessage ||
    quotedMsg?.documentMessage
  );

  // 10. Contexto consolidado para los manejadores de eventos
  const ctx: MessageContext = {
    sock,
    msg,
    remoteJid,
    body,
    cleanBody: body.trim(),
    senderProfile,
    quotedSenderProfile,
    contextInfo,
    quotedMsg,
    quotedParticipant,
    quotedSnippet,
    mentionedJidList,
    botDigits,
    botLidDigits,
    hasMedia,
    hasQuotedMedia,
  };

  // 11. Pipeline de ejecución secuencial:
  // Paso A: Comandos con prefijo a costo $0 (!s, !laburar, !casino, !resumen, etc.)
  if (await handlePrefixCommand(ctx)) return;

  // Si el usuario está muerto por Ruleta Rusa, el bot lo ignora olímpicamente (cero interacción de juegos, stickers o IA)
  if (isUserIgnoredByRoulette(senderProfile.jid)) return;

  // Paso A2: Interceptor de respuestas a minijuegos activos (Pokémon, Banderas, Wordle)
  if (await interceptGameGuess(ctx)) return;

  // Paso B: Triggers y easter eggs de stickers automáticos
  if (await handleTriggerStickers(ctx)) return;

  // Paso C: Multimedia directa/citada o llamada directa con intención de herramientas IA
  const hasBotTextMention = /@?empy(-bot)?\b/i.test(ctx.cleanBody);
  const isDirectChat = !isGroup;
  const isDirectlyAddressed = Boolean(
    isDirectChat ||
    hasBotTextMention ||
    (botDigits && quotedParticipant.includes(botDigits)) ||
    (botLidDigits && quotedParticipant.includes(botLidDigits)) ||
    mentionedJidList.some((j) => (botDigits && j.includes(botDigits)) || (botLidDigits && j.includes(botLidDigits)))
  );

  const hasToolCallingIntent =
    isDirectlyAddressed &&
    (/\b(tiktok|descarga(r)?)\b/i.test(ctx.cleanBody) ||
      /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i.test(ctx.cleanBody));

  if ((hasMedia || hasQuotedMedia || hasToolCallingIntent) && (await handleAiInteraction(ctx))) return;

  // Paso D: Pipeline de Chat en Vivo de 4 Capas (Heurística -> Groq Qwen Triage -> RAG Neon -> Gemma 4 31B)
  if (await runLiveChatPipeline(ctx)) return;

  // Paso E: Reacciones espontáneas locales (roast mancos, tilteos con stickers)
  if (isGroup) {
    await handleSpontaneousReaction(ctx);
  }
  } catch (dispErr) {
    console.error("[Dispatcher Error]: Error no controlado en procesamiento de mensaje:", dispErr);
  }
}
