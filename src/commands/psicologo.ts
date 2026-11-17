import { WAMessage } from "@whiskeysockets/baileys";
import { Command, CommandContext } from "./types.js";
import { getLiveBufferMessages } from "../services/db/message.service.js";
import { consultPsychologist } from "../services/psicologo.service.js";

const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 25 * 1000;

function extractQuotedText(quotedMsg: CommandContext["quotedMsg"]): string {
  if (!quotedMsg) return "";
  return (
    quotedMsg.conversation ||
    quotedMsg.extendedTextMessage?.text ||
    quotedMsg.imageMessage?.caption ||
    quotedMsg.videoMessage?.caption ||
    ""
  ).trim();
}

export const psicologoCommand: Command = {
  name: "psicologo",
  aliases: ["psico", "terapia", "divan", "diván", "consejo"],
  description: "Escucha tu situación o un mensaje citado para darte opinión, perspectiva y consejo (!psicologo [texto]).",
  execute: async ({
    sock,
    msg,
    remoteJid,
    cleanText,
    quotedMsg,
    senderProfile,
    quotedSenderProfile,
  }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || remoteJid;
    const quoted = msg.key ? (msg as WAMessage) : undefined;

    const now = Date.now();
    const lastUsed = userCooldowns.get(senderJid) || 0;
    if (now - lastUsed < COOLDOWN_MS) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
      await sock.sendMessage(
        remoteJid,
        { text: `🛋️ El consultorio está ocupado. Esperá *${remainingSec}s* antes de volver al diván.` },
        { quoted }
      );
      return;
    }

    const userComment = cleanText.trim();
    const quotedText = extractQuotedText(quotedMsg);

    if (userComment.length < 3 && quotedText.length < 3) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🛋️ *Pasá al diván cuando quieras.*\n\n` +
            `Usá *!psicologo <lo que te pasa>* o citá un mensaje (solo o con tu comentario) para recibir perspectiva y consejo.`,
        },
        { quoted }
      );
      return;
    }

    userCooldowns.set(senderJid, now);

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🛋️", key: msg.key } }).catch(() => {});
      }

      const recentContext = remoteJid.endsWith("@g.us")
        ? getLiveBufferMessages(5)
        : undefined;

      const result = await consultPsychologist({
        userComment: userComment || undefined,
        quotedText: quotedText || undefined,
        userName: senderProfile?.primaryName || senderProfile?.pushName || undefined,
        quotedAuthorName: quotedSenderProfile?.primaryName || quotedSenderProfile?.pushName || undefined,
        recentContext,
      });

      if (!result.ok) {
        if (result.reason === "invalid_input") {
          userCooldowns.delete(senderJid);
        }
        await sock.sendMessage(
          remoteJid,
          { text: result.reason === "invalid_input" ? `🛋️ ${result.error}` : `❌ ${result.error}` },
          { quoted }
        );
        return;
      }

      await sock.sendMessage(
        remoteJid,
        { text: result.text },
        { quoted }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Psicologo Command] Error:", errorMessage);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El consultorio no respondió en este momento. Volvé a intentar en unos instantes." },
        { quoted }
      );
    }
  },
};
