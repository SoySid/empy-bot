import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { commandMap } from "../commands/index.js";
import {
  processUserMessage,
  processVisionMessage,
  processAudioMessage,
  isSpamOrLowValue,
} from "../services/ai.service.js";
import { parseOutboundMentions } from "../services/db/user.service.js";
import { recordIncomingMessage } from "../services/db/message.service.js";
import { registerBotResponse } from "../services/feedback.service.js";
import { getRandomLocalSticker } from "../services/sticker.service.js";
import { streamToBuffer } from "../services/media.service.js";
import { MessageContext } from "./types.js";

const STICKER_CREATION_REGEX =
  /^(s|sticker|stiker|pegatina)$|\b(hace(me)?\s+(un\s+)?(sticker|stiker)|crea(r)?\s+(un\s+)?sticker|a\s+sticker|converti(r)?\s+a\s+sticker)\b/i;

const MEDIA_EXTRACTION_REGEX =
  /^(toimg|img|imagen|foto|togif|gif)$|\b(pas(a|alo)?\s+a\s+(imagen|foto|gif)|converti(r)?\s+a\s+(imagen|foto|gif)|hace(me)?\s+(un\s+)?(gif|video))\b/i;

const STICKER_DESCRIPTION_REGEX =
  /\b(describ(i|ir|ime|eme|emelo|imelo)|descripcion|que\s+(es|dice|significa|carajo\s+dice|ves|ve|hay|tiene|onda)|explica(me)?|lee(me)?|de\s+que\s+es|que\s+sticker\s+es|mira|mirá|opina(r)?|opiná|que\s+opinas?|qué\s+opinás?|reacciona|reaccioná)\b/i;

function checkWantsStickerDescription(text: string): boolean {
  if (!text) return false;
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return STICKER_DESCRIPTION_REGEX.test(normalized);
}

/**
 * Procesa menciones o respuestas directas al bot usando IA multimodal, herramientas o generación de texto.
 * Retorna true si el mensaje estaba dirigido al bot y fue procesado.
 */
export async function handleAiInteraction(ctx: MessageContext): Promise<boolean> {
  const {
    sock,
    msg,
    remoteJid,
    body,
    senderProfile,
    quotedSenderProfile,
    contextInfo,
    quotedMsg,
    quotedSnippet,
    mentionedJidList,
    botDigits,
    botLidDigits,
    quotedParticipant,
  } = ctx;

  const isMatchingBotJid = (target: string) => {
    if (!target) return false;
    const targetDigits = target.split("@")[0].replace(/\D/g, "");
    if (botDigits && targetDigits === botDigits) return true;
    if (botLidDigits && targetDigits === botLidDigits) return true;
    return false;
  };

  const isMentioned = mentionedJidList.some(isMatchingBotJid);
  const isReplyingToBot = isMatchingBotJid(quotedParticipant);
  const hasBotTextMention = /@?empy(-bot)?\b/i.test(body);

  if (!isMentioned && !isReplyingToBot && !hasBotTextMention) {
    return false;
  }

  const cleanPrompt = body
    .replace(/@\d+/g, "")
    .replace(/@?empy(-bot)?\b/gi, "")
    .trim();

  const rawMsg = msg.message;
  const normalizedMsg =
    rawMsg?.ephemeralMessage?.message ||
    rawMsg?.viewOnceMessage?.message ||
    rawMsg?.viewOnceMessageV2?.message ||
    rawMsg?.documentWithCaptionMessage?.message ||
    rawMsg;

  const hasQuotedImage = Boolean(quotedMsg?.imageMessage);
  const hasDirectImage = Boolean(normalizedMsg?.imageMessage);
  const hasQuotedVideo = Boolean(quotedMsg?.videoMessage);
  const hasDirectVideo = Boolean(normalizedMsg?.videoMessage);
  const hasQuotedSticker = Boolean(quotedMsg?.stickerMessage);
  const isDirectSticker = Boolean(normalizedMsg?.stickerMessage);
  const hasQuotedAudio = Boolean(quotedMsg?.audioMessage);
  const hasDirectAudio = Boolean(normalizedMsg?.audioMessage);

  const wantsStickerCreation = STICKER_CREATION_REGEX.test(cleanPrompt);
  const wantsMediaExtraction = MEDIA_EXTRACTION_REGEX.test(cleanPrompt);
  const wantsStickerDescription = checkWantsStickerDescription(cleanPrompt);

  // Si envían un sticker directamente (ej: contestando al bot), ignorar sin responder ni describir
  if (isDirectSticker && !wantsMediaExtraction) {
    return true;
  }

  // Si el usuario responde o cita un sticker que mandó el propio bot, ignorar completamente.
  // La gente suele responder riéndose ("jaja", "xd", "lpm") a los stickers del bot y no debe disparar ni visión ni respuestas.
  if (hasQuotedSticker && isReplyingToBot) {
    return true;
  }

  // 1. Delegación a creación o extracción de stickers si fue solicitada explícitamente
  if (
    ((hasQuotedImage || hasDirectImage || hasQuotedVideo || hasDirectVideo) && wantsStickerCreation) ||
    (hasQuotedSticker && (wantsMediaExtraction || wantsStickerCreation))
  ) {
    const universalCmd = commandMap.get("sticker");
    if (universalCmd) {
      await universalCmd.execute({
        sock,
        msg,
        remoteJid,
        body,
        args: [],
        cleanText: cleanPrompt,
        contextInfo,
        quotedMsg,
      });
      return true;
    }
  }

  // 2. Visión multimodal (Fotos y Stickers de terceros)
  // Se procesa con visión si se pide describir o si se cita un sticker de otro usuario haciéndole una pregunta al bot
  const canProcessStickerVision = hasQuotedSticker && !isReplyingToBot && (wantsStickerDescription || cleanPrompt.length >= 2);
  const canProcessImageVision = (hasQuotedImage || hasDirectImage) && !isDirectSticker;

  if (
    (canProcessImageVision || canProcessStickerVision) &&
    !wantsStickerCreation &&
    !wantsMediaExtraction
  ) {
    try {
      const targetMedia = canProcessStickerVision
        ? quotedMsg?.stickerMessage
        : quotedMsg?.imageMessage || normalizedMsg?.imageMessage;
      const isSticker = Boolean(canProcessStickerVision);
      const mediaType = isSticker ? "sticker" : "image";

      const stream = await (downloadContentFromMessage as any)(targetMedia, mediaType);
      const mediaBuffer = await streamToBuffer(stream);

      const visionResponse = await processVisionMessage(
        mediaBuffer,
        isSticker,
        cleanPrompt,
        senderProfile
      );

      const { formattedText, mentions } = parseOutboundMentions(visionResponse);

      const sentMsg = await sock.sendMessage(
        remoteJid,
        { text: formattedText, mentions },
        { quoted: msg as any }
      );

      if (sentMsg?.key?.id) registerBotResponse(sentMsg.key.id);

      await recordIncomingMessage(
        sock.user?.id || "bot",
        "empy-bot",
        formattedText,
        true,
        senderProfile.primaryName,
        cleanPrompt
      );
      return true;
    } catch (vErr) {
      console.error("[Vision Handler] Error:", vErr);
    }
  }

  // 3. Filtro de risas y mensajes de bajo valor / spam
  // Si el usuario se ríe del bot (ej: "jaja", "jajaja lpm", "xd", "kjj literal") o manda solo emojis, ignorar
  if (!wantsStickerCreation && !wantsMediaExtraction && !canProcessStickerVision) {
    if (isSpamOrLowValue(cleanPrompt)) {
      return true;
    }
  }

  // 4. Notas de voz y audios
  // REGLA: Procesar con Gemini Multimodal cuando se etiqueta/menciona al bot explícitamente o en chat privado.
  if (hasQuotedAudio || hasDirectAudio) {
    if (isMentioned) {
      try {
        const targetAudio = quotedMsg?.audioMessage || normalizedMsg?.audioMessage;
        if (targetAudio) {
          // Si el usuario pidió explícitamente solo transcribir ("transcribí", "transcribir", "qué dice"), delegar a !audio
          const wantsOnlyTranscription = /\b(transcrib[ií]|transcripci[oó]n|pasa a texto|pasalo a texto)\b/i.test(cleanPrompt);
          if (wantsOnlyTranscription) {
            const audioCmd = commandMap.get("audio");
            if (audioCmd) {
              await audioCmd.execute({
                sock,
                msg,
                remoteJid,
                body,
                args: [],
                cleanText: cleanPrompt,
                contextInfo,
                quotedMsg,
              });
              return true;
            }
          }

          const stream = await (downloadContentFromMessage as any)(targetAudio, "audio");
          const audioBuffer = await streamToBuffer(stream);

          // Escucha multimodal directa con Gemini Flash (comprende tono, palabras y bardo)
          const audioResponse = await processAudioMessage(audioBuffer, cleanPrompt, senderProfile);
          const { formattedText, mentions } = parseOutboundMentions(audioResponse);

          const sentMsg = await sock.sendMessage(
            remoteJid,
            { text: formattedText, mentions },
            { quoted: msg as any }
          );

          if (sentMsg?.key?.id) registerBotResponse(sentMsg.key.id);

          await recordIncomingMessage(
            sock.user?.id || "bot",
            "empy-bot",
            formattedText,
            true,
            senderProfile.primaryName,
            cleanPrompt || "[Nota de voz]"
          );
          return true;
        }
      } catch (audioErr) {
        console.error("[Audio Handler] Error procesando nota de voz multimodal:", audioErr);
      }
    }
    // Si respondieron al audio pero NO etiquetaron al bot en grupo, no hacer nada
    return true;
  }

  // Si no hay texto útil para consultar a la IA, no responder
  if (!cleanPrompt || cleanPrompt.length < 2) {
    return true;
  }

  // 5. Procesamiento contextual con IA (Texto y Tool Calling)
  let quotedContext = quotedSnippet;
  if (hasQuotedSticker) quotedContext += " [Citó un Sticker]";
  if (hasQuotedImage) quotedContext += " [Citó una Foto]";

  const aiResult = await processUserMessage(
    cleanPrompt,
    quotedContext.trim() || undefined,
    senderProfile,
    quotedSenderProfile
  );

  if (aiResult.type === "tool_call" && aiResult.toolName) {
    const toolArgs = aiResult.toolArgs || {};

    switch (aiResult.toolName) {
      case "create_sticker":
      case "sticker_to_image": {
        const universalCmd = commandMap.get("sticker");
        if (universalCmd) {
          await universalCmd.execute({
            sock,
            msg,
            remoteJid,
            body,
            args: [],
            cleanText: cleanPrompt,
            contextInfo,
            quotedMsg,
            senderProfile,
          });
        }
        break;
      }

      case "download_tiktok": {
        const url = typeof toolArgs.url === "string" ? toolArgs.url.trim() : "";
        if (/^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i.test(url)) {
          const dlCmd = commandMap.get("tiktok");
          if (dlCmd) {
            await dlCmd.execute({
              sock,
              msg,
              remoteJid,
              body,
              args: [url],
              cleanText: url,
              contextInfo,
              quotedMsg,
              senderProfile,
            });
          }
        } else {
          await sock.sendMessage(
            remoteJid,
            { text: "⚠️ El enlace no parece ser un link válido de TikTok." },
            { quoted: msg as any }
          );
        }
        break;
      }

      default: {
        console.warn(`[AI Handler] Unknown tool call received: ${aiResult.toolName}`);
        break;
      }
    }
  } else if (aiResult.text) {
    const { formattedText, mentions } = parseOutboundMentions(aiResult.text);

    const sentMsg = await sock.sendMessage(
      remoteJid,
      { text: formattedText, mentions },
      { quoted: msg as any }
    );

    if (sentMsg?.key?.id) {
      registerBotResponse(sentMsg.key.id);
    }

    // Probabilidad del 65% de enviar sticker tras remates de humor o bardo
    if (
      (aiResult.mood === "bardo" || aiResult.mood === "risa" || aiResult.mood === "burla") &&
      Math.random() < 0.65
    ) {
      await new Promise((r) => setTimeout(r, 600));
      const stickerData = await getRandomLocalSticker(aiResult.mood);
      if (stickerData) {
        await sock.sendMessage(remoteJid, {
          sticker: stickerData.buffer,
          isAnimated: stickerData.isAnimated,
        });
      }
    }

    await recordIncomingMessage(
      sock.user?.id || "bot",
      "empy-bot",
      formattedText,
      true,
      senderProfile.primaryName,
      cleanPrompt
    );
  }

  return true;
}
