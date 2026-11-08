import { Command, CommandContext } from "./types.js";
import {
  generateElevenLabsTTS,
  ELEVENLABS_TOMAS_VOICE_ID,
  isElevenLabsConfigured,
  MAX_ELEVENLABS_CHARS,
} from "../services/elevenlabs.service.js";
import { modifyBalance } from "../services/economy.service.js";
import { ECONOMY_CONFIG } from "../config/economy.config.js";

function extractTargetText(cleanText: string, quotedMsg: any): string {
  if (cleanText && cleanText.trim().length > 0) {
    return cleanText.trim();
  }
  const quoted =
    quotedMsg?.conversation ||
    quotedMsg?.extendedTextMessage?.text ||
    quotedMsg?.imageMessage?.caption ||
    quotedMsg?.videoMessage?.caption ||
    "";
  return quoted.trim();
}

const userTomasCooldowns = new Map<string, number>();
const TOMAS_COOLDOWN_MS = 15 * 1000;

export const tomasCommand: Command = {
  name: "tomas",
  aliases: ["el-tomas", "vozdetomas"],
  description: "Nota de voz neuronal de Tomás con ElevenLabs v4 (admite tags de emociones y efectos).",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    if (!isElevenLabsConfigured()) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "⚠️ La integración de ElevenLabs no está configurada en este momento (falta ELEVENLABS_API_KEY).",
        },
        { quoted: msg as any }
      );
      return;
    }

    const targetText = extractTargetText(cleanText, quotedMsg);

    if (!targetText) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "🎙️ *Voz de Tomás (ElevenLabs v4)*\n\n" +
            "Uso: `!tomas <mensaje>` o citá un mensaje con `!tomas`.\n\n" +
            "✨ *Podés intercalar tags de emoción y efectos:*\n" +
            "• `[happy]` `[sad]` `[angry]` `[excited]` `[tired]` `[playful]`\n" +
            "• `[chuckles]` `[laughing]` `[sighing]` `[sniffling]` `[coughing]`\n" +
            "• `[whispering]` `[singing]` `[slowly]` `[pause]`\n" +
            "• `[applause]` `[crowd cheering]` `[drum roll]` `[heartbeat]`\n\n" +
            "_Ejemplo:_\n" +
            "`!tomas [happy] Hola gente [chuckles] todo tranquilo por acá?`",
        },
        { quoted: msg as any }
      );
      return;
    }

    if (targetText.length > MAX_ELEVENLABS_CHARS) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ El mensaje es demasiado largo para la voz de Tomás (${targetText.length}/${MAX_ELEVENLABS_CHARS} caracteres). Por favor recortalo para cuidar la cuota.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const now = Date.now();
    const lastTomasTime = userTomasCooldowns.get(senderJid) || 0;
    if (now - lastTomasTime < TOMAS_COOLDOWN_MS) {
      const remainingSec = Math.ceil((TOMAS_COOLDOWN_MS - (now - lastTomasTime)) / 1000);
      await sock.sendMessage(
        remoteJid,
        {
          text: `⏳ Esperá *${remainingSec}s* antes de pedir otro audio con la voz de Tomás.`,
        },
        { quoted: msg as any }
      );
      return;
    }
    userTomasCooldowns.set(senderJid, now);

    let isCharged = false;
    try {
      // Cobro por uso de servicio de voz neuronal
      const balanceCheck = await modifyBalance(senderJid, -ECONOMY_CONFIG.COST_FISH_AUDIO);
      if (!balanceCheck.success) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `💸 *Fondos insuficientes:* Las notas de voz neuronales cuestan *$${ECONOMY_CONFIG.COST_FISH_AUDIO}* fichas (tu saldo: *$${balanceCheck.oldBalance}*).\n\n¡Tirá \`!laburar\` para ganar fichas o usá \`!decir\` que es gratis!`,
          },
          { quoted: msg as any }
        );
        return;
      }
      isCharged = true;

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🎙️", key: msg.key } });
      }

      const voiceId = process.env.ELEVENLABS_VOICE_TOMAS || ELEVENLABS_TOMAS_VOICE_ID;
      const modelId = process.env.ELEVENLABS_MODEL || "eleven_v4";

      const pttBuffer = await generateElevenLabsTTS(targetText, voiceId, modelId);

      await sock.sendMessage(
        remoteJid,
        { audio: pttBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
        { quoted: msg as any }
      );
    } catch (error: any) {
      if (isCharged) {
        await modifyBalance(senderJid, ECONOMY_CONFIG.COST_FISH_AUDIO);
      }
      console.error("[Voice Command !tomas] Error:", error);
      await sock.sendMessage(
        remoteJid,
        {
          text: isCharged
            ? `❌ Error generando voz de Tomás: ${error?.message || error}. Tus fichas fueron reembolsadas.`
            : `❌ Error generando voz de Tomás: ${error?.message || error}.`,
        },
        { quoted: msg as any }
      );
    }
  },
};
