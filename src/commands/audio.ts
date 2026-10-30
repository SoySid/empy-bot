import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { transcribeAudio, askAI } from "../services/ai.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import {
  saveCustomVoice,
  deleteCustomVoice,
  getAllCustomVoices,
} from "../services/voice.service.js";
import {
  registerDynamicVoiceCommand,
  unregisterDynamicVoiceCommand,
  isStaticCommand,
} from "./index.js";
import { streamToBuffer } from "../services/media.service.js";

export const audioCommand: Command = {
  name: "audio",
  aliases: ["transcribir", "resumir", "t"],
  description: "Transcribe o resume audios, o gestiona voces clonadas de Fish Audio (Creador).",
  execute: async ({ sock, msg, remoteJid, quotedMsg, cleanText, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const isOwner = isBotOwner(senderProfile, senderJid);
    const targetAudio = (quotedMsg as any)?.audioMessage || msg.message?.audioMessage;

    const action = args[0]?.trim().toLowerCase() || "";
    const isExplicitAction = ["borrar", "eliminar", "delete", "remove", "lista", "listar", "list", "agregar", "add"].includes(action);
    const isTranscriptionArg = ["resumir", "resumen", "explica", "explicar", "transcribir"].includes(action);

    // Detección de intención: gestión de voces (!audio <nombre> <id>, !audio borrar <nombre>, etc.)
    const isVoiceManagement = isExplicitAction || (args.length >= 2 && !isTranscriptionArg) || (!targetAudio && args.length === 1 && !isTranscriptionArg);

    if (isVoiceManagement) {
      if (!isOwner) {
        await sock.sendMessage(
          remoteJid,
          { text: "🚫 Solo el Creador puede agregar o modificar voces en el bot." },
          { quoted: msg as any }
        );
        return;
      }

      // ── Acción: Borrar voz ──
      if (["borrar", "eliminar", "delete", "remove"].includes(action)) {
        const targetName = args[1]?.trim().toLowerCase();
        if (!targetName) {
          await sock.sendMessage(
            remoteJid,
            { text: "⚠️ Indicá el nombre de la voz a eliminar:\n`!audio borrar <nombre>`" },
            { quoted: msg as any }
          );
          return;
        }

        const delRes = await deleteCustomVoice(targetName);
        if (!delRes.success) {
          await sock.sendMessage(
            remoteJid,
            { text: `⚠️ ${delRes.error}` },
            { quoted: msg as any }
          );
          return;
        }

        unregisterDynamicVoiceCommand(targetName);
        await sock.sendMessage(
          remoteJid,
          { text: `🗑️ La voz *${targetName}* fue eliminada correctamente del bot.` },
          { quoted: msg as any }
        );
        return;
      }

      // ── Acción: Listar voces personalizadas ──
      if (["lista", "listar", "list"].includes(action)) {
        const customVoices = await getAllCustomVoices();
        if (customVoices.length === 0) {
          await sock.sendMessage(
            remoteJid,
            { text: "🎙️ No hay voces personalizadas guardadas aún.\n\nAgregá una con:\n`!audio <nombre> <codigo_fish>`" },
            { quoted: msg as any }
          );
          return;
        }

        const listText = customVoices
          .map((v) => `• \`!${v.name}\` (ID: \`${v.referenceId.slice(0, 10)}...\`)`)
          .join("\n");

        await sock.sendMessage(
          remoteJid,
          {
            text:
              `🎙️ *VOCES PERSONALIZADAS (${customVoices.length})*\n\n` +
              listText +
              `\n\n💡 Usalas con: \`!<nombre> <mensaje>\` o borralas con \`!audio borrar <nombre>\``,
          },
          { quoted: msg as any }
        );
        return;
      }

      // ── Acción: Agregar o actualizar voz ──
      let voiceName = "";
      let referenceId = "";

      if (action === "agregar" || action === "add") {
        voiceName = args[1]?.trim().toLowerCase() || "";
        referenceId = args.slice(2).join(" ").trim();
      } else {
        voiceName = args[0]?.trim().toLowerCase() || "";
        referenceId = args.slice(1).join(" ").trim();
      }

      if (!voiceName || !referenceId) {
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `ℹ️ *Guardar voz de Fish Audio*\n\n` +
              `Uso: \`!audio <nombre> <codigo_de_fish>\`\n\n` +
              `💡 *Ejemplo:*\n` +
              `\`!audio nahuel 7b6e9a823f5...\`\n\n` +
              `Luego vas a poder usarla con:\n` +
              `\`!nahuel <mensaje>\``,
          },
          { quoted: msg as any }
        );
        return;
      }

      const cleanName = voiceName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]/g, "");

      if (isStaticCommand(cleanName)) {
        await sock.sendMessage(
          remoteJid,
          { text: `⚠️ El nombre "*${cleanName}*" es un comando reservado del bot y no puede usarse como voz.` },
          { quoted: msg as any }
        );
        return;
      }

      const cleanRefId = referenceId.replace(/^[(\[<"']+|[)\]>"']+$/g, "").trim();

      const saveRes = await saveCustomVoice({
        name: cleanName,
        referenceId: cleanRefId,
        addedBy: senderProfile?.pushName || senderProfile?.phone || "Creador",
      });

      if (!saveRes.success) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ ${saveRes.error}` },
          { quoted: msg as any }
        );
        return;
      }

      registerDynamicVoiceCommand(cleanName, cleanRefId);

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `✅ ¡Voz *${cleanName}* guardada con éxito!\n\n` +
            `🎙️ Ya podés usarla escribiendo:\n` +
            `• \`!${cleanName} <mensaje>\`\n` +
            `• O citando un mensaje con \`!${cleanName}\`\n\n` +
            `📋 Consultá todas las voces con: \`!voces\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    // ── Transcripción / Resumen de notas de voz ──
    if (!targetAudio) {
      if (isOwner) {
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `🎙️ *Comando !audio (Creador)*\n\n` +
              `• *Agregar voz:* \`!audio <nombre> <codigo_fish>\`\n` +
              `  _Ej: \`!audio nahuel 7b6e9a8...\`_\n` +
              `• *Borrar voz:* \`!audio borrar <nombre>\`\n` +
              `• *Listar voces creadas:* \`!audio lista\`\n` +
              `• *Catálogo completo:* \`!voces\`\n\n` +
              `🎧 *Transcripción:* Respondé a un audio de WhatsApp con \`!audio\` o \`!audio resumir\`.`,
          },
          { quoted: msg as any }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          { text: "⚠️ Debes responder directamente a un audio de WhatsApp." },
          { quoted: msg as any }
        );
      }
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🎧", key: msg.key } });
      }

      const stream = await (downloadContentFromMessage as any)(targetAudio, "audio");
      const audioBuffer = await streamToBuffer(stream);

      const transcription = await transcribeAudio(audioBuffer);

      if (!transcription) {
        await sock.sendMessage(
          remoteJid,
          { text: "❌ No pude transcribir el audio." },
          { quoted: msg as any }
        );
        return;
      }

      const lower = cleanText.toLowerCase();
      if (lower.includes("resum") || lower.includes("explica")) {
        const summary = await askAI("Resumí los puntos clave de este audio de forma concisa:", transcription);
        await sock.sendMessage(
          remoteJid,
          { text: `📝 *Audio:* _"${transcription}"_\n\n📌 *Resumen:* ${summary}` },
          { quoted: msg as any }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          { text: `📝 *Transcripción:*\n\n"${transcription}"` },
          { quoted: msg as any }
        );
      }
    } catch (error) {
      console.error("Error procesando audio:", error);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Falló el procesamiento del audio." },
        { quoted: msg as any }
      );
    }
  },
};