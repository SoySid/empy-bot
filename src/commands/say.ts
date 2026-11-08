import { Command, CommandContext } from "./types.js";
import {
  generateMicrosoftTTS,
  generateFishAudioTTS,
  getFishVoiceMap,
} from "../services/tts.service.js";
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

// ─── Comando !voces ───────────────────────────────────────────────────────────
export const vocesCommand: Command = {
  name: "voces",
  aliases: ["voices", "listarvoces"],
  description: "Muestra el catálogo completo de voces disponibles.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    const voiceMap = getFishVoiceMap();
    const allVoices = Object.keys(voiceMap).filter((v) => Boolean(voiceMap[v]));

    const famousList = [
      "messi", "milei", "cristina", "momo", "clint", "xocas", "town", "farid",
      "tini", "fernan", "scaloni", "dross", "gaspi", "mda", "rubius", "vegetta",
      "trump", "closs", "valentino",
    ];
    const charactersList = [
      "miku", "nana", "angela", "mlbb", "melissa", "paquito", "xborg", "layla", "esmeralda",
      "martis", "claude", "edith", "light", "alonso", "hirara",
      "brainrot", "alice", "loquendo",
    ];

    const famous = allVoices
      .filter((v) => famousList.includes(v))
      .map((v) => `• \`!${v} <mensaje>\``)
      .join("\n");

    const characters = allVoices
      .filter((v) => charactersList.includes(v))
      .map((v) => `• \`!${v} <mensaje>\``)
      .join("\n");

    const members = allVoices
      .filter((v) => !famousList.includes(v) && !charactersList.includes(v))
      .map((v) => `• \`!${v} <mensaje>\``)
      .join("\n");

    const message =
      "🎙️ *CATÁLOGO DE VOCES DE EMPY-BOT*\n\n" +
      "🇦🇷 *Voz Argentina Gratuita:*\n" +
      "• `!decir <mensaje>`\n\n" +
      "💎 *Voz Ultra Expresiva (ElevenLabs v4):*\n" +
      "• `!tomas <mensaje>` _(Admite tags como [happy], [chuckles], [sad], [whispering], [applause])_\n\n" +
      "🌟 *Famosos y Streamers:*\n" +
      (famous || "_(ninguno configurado)_") +
      "\n\n🎮 *Personajes & Mobile Legends:*\n" +
      (characters || "_(ninguno configurado)_") +
      "\n\n👥 *Voces Personalizadas:*\n" +
      (members || "_(ninguno configurado)_") +
      "\n\n🎭 *Emociones y Modulación de Voz:*\n" +
      "Podés cambiar cómo suena cualquier voz agregando tags al texto:\n" +
      "• `[cantando]` → Entonación melódica y musical ♪\n" +
      "• `[grito]` → Voz a los gritos desesperados\n" +
      "• `[enojado]` → Tono furioso y agresivo\n" +
      "• `[susurro]` → Susurro suave y misterioso\n" +
      "• `[triste]` o `[llorando]` → Voz quebrada con llanto\n" +
      "• `[risa]` → Risa eufórica mientras habla\n" +
      "• `[rapido]` / `[lento]` → Acelera o ralentiza la voz\n" +
      "_Ej: `!clint [cantando] Hola cómo estás`_\n" +
      "_Ej: `!messi [enojado] Qué mirás bobo`_\n\n" +
      "💡 *Tip:* También podés responder/citar cualquier mensaje con `!messi`, `!milei`, etc., y el bot lo leerá en audio.";

    const sent = await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    console.log(`[Voces] ✅ Catálogo enviado a ${remoteJid} (ID: ${sent?.key?.id})`);
  },
};

// ─── Comando !decir <mensaje> ─────────────────────────────────────────────────
// Usa Microsoft Edge-TTS (voz argentina gratuita)
const userSayCooldowns = new Map<string, number>();
const SAY_COOLDOWN_MS = 5000;
const MAX_SAY_LENGTH = 300;

export const sayCommand: Command = {
  name: "decir",
  aliases: ["hablar", "tts", "voz"],
  description: "Convierte texto a nota de voz con voz argentina (gratis, máx 300 caracteres).",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, senderProfile }: CommandContext) => {
    try {
      const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
      const now = Date.now();
      const lastSay = userSayCooldowns.get(senderJid) || 0;
      if (now - lastSay < SAY_COOLDOWN_MS) {
        const remaining = Math.ceil((SAY_COOLDOWN_MS - (now - lastSay)) / 1000);
        await sock.sendMessage(
          remoteJid,
          { text: `⏳ Esperá *${remaining}s* antes de volver a usar \`!decir\`.` },
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
              "🎙️ *COMANDO DE VOZ*\n\n" +
              "• Usá: `!decir <mensaje>` o citá un mensaje con `!decir`\n" +
              "• Escribí `!voces` para ver el catálogo de todas las voces clonadas.",
          },
          { quoted: msg as any }
        );
        return;
      }

      if (targetText.length > MAX_SAY_LENGTH) {
        await sock.sendMessage(
          remoteJid,
          { text: `⚠️ El mensaje es demasiado largo (${targetText.length} caracteres). El límite máximo es de ${MAX_SAY_LENGTH} caracteres.` },
          { quoted: msg as any }
        );
        return;
      }

      userSayCooldowns.set(senderJid, now);

      const pttBuffer = await generateMicrosoftTTS(targetText, "es-AR-TomasNeural");
      await sock.sendMessage(
        remoteJid,
        { audio: pttBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
        { quoted: msg as any }
      );
    } catch (error: any) {
      console.error("[Say Command] Error:", error);
      await sock.sendMessage(
        remoteJid,
        { text: `❌ Error generando la nota de voz: ${error?.message || error}` },
        { quoted: msg as any }
      );
    }
  },
};

const MAX_VOICE_COMMAND_CHARS = 300;
const voiceCommandCooldowns = new Map<string, number>();
const VOICE_COMMAND_COOLDOWN_MS = 15 * 1000;

// ─── Comandos dinámicos por voz Fish Audio ────────────────────────────────────
// Genera un Command por cada FISH_VOICE_* en el .env
// Ej: FISH_VOICE_CORREO → !correo <mensaje>
export function createVoiceCommand(voiceName: string, referenceId: string): Command {
  return {
    name: voiceName.toLowerCase(),
    aliases: [],
    description: `Nota de voz clonada de "${voiceName}" (Fish Audio).`,
    execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, senderProfile }: CommandContext) => {
      const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

      let isCharged = false;
      try {
        const targetText = extractTargetText(cleanText, quotedMsg);

        if (!targetText) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `🎙️ Usá: \`!${voiceName.toLowerCase()} <mensaje>\` o respondé a un mensaje con \`!${voiceName.toLowerCase()}\``,
            },
            { quoted: msg as any }
          );
          return;
        }

        if (targetText.length > MAX_VOICE_COMMAND_CHARS) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `⚠️ El mensaje es demasiado largo para una nota de voz (${targetText.length}/${MAX_VOICE_COMMAND_CHARS} caracteres). Por favor recortalo un poco.`,
            },
            { quoted: msg as any }
          );
          return;
        }

        const now = Date.now();
        const lastVoiceTime = voiceCommandCooldowns.get(senderJid) || 0;
        if (now - lastVoiceTime < VOICE_COMMAND_COOLDOWN_MS) {
          const remainingSec = Math.ceil((VOICE_COMMAND_COOLDOWN_MS - (now - lastVoiceTime)) / 1000);
          await sock.sendMessage(
            remoteJid,
            {
              text: `⏳ Esperá *${remainingSec}s* antes de pedir otro audio clonado.`,
            },
            { quoted: msg as any }
          );
          return;
        }
        voiceCommandCooldowns.set(senderJid, now);

        if (!referenceId) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `⚠️ La voz *${voiceName}* no tiene un ID configurado.`,
            },
            { quoted: msg as any }
          );
          return;
        }

        // Cobro por uso de servicio de voz clonada
        const balanceCheck = await modifyBalance(senderJid, -ECONOMY_CONFIG.COST_FISH_AUDIO);
        if (!balanceCheck.success) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `💸 *Fondos insuficientes:* Las notas de voz clonadas cuestan *$${ECONOMY_CONFIG.COST_FISH_AUDIO}* fichas (tu saldo: *$${balanceCheck.oldBalance}*).\n\n¡Tirá \`!laburar\` para ganar fichas o usá \`!decir\` que es gratis!`,
            },
            { quoted: msg as any }
          );
          return;
        }
        isCharged = true;

        const pttBuffer = await generateFishAudioTTS(targetText, referenceId);
        await sock.sendMessage(
          remoteJid,
          { audio: pttBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
          { quoted: msg as any }
        );
      } catch (error: any) {
        if (isCharged) {
          await modifyBalance(senderJid, ECONOMY_CONFIG.COST_FISH_AUDIO);
        }
        console.error(`[Voice Command !${voiceName}] Error:`, error);
        await sock.sendMessage(
          remoteJid,
          {
            text: isCharged
              ? `❌ Error generando voz de ${voiceName}: ${error?.message || error}. Tus fichas fueron reembolsadas.`
              : `❌ Error generando voz de ${voiceName}: ${error?.message || error}.`,
          },
          { quoted: msg as any }
        );
      }
    },
  };
}

export function buildVoiceCommands(): Command[] {
  const voiceMap = getFishVoiceMap();
  return Object.entries(voiceMap).map(([voiceName, referenceId]) =>
    createVoiceCommand(voiceName, referenceId)
  );
}
