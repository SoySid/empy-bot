import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { saveCustomSticker, VALID_CATEGORIES, createSticker } from "../services/sticker.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import { streamToBuffer } from "../services/media.service.js";

export const stickerCommand: Command = {
  name: "sticker",
  aliases: ["guardarsticker", "savesticker", "addsticker"],
  description: "Guarda un sticker citado en la rotación del bot según categoría (bardo, burla, risa, triste, wtf, triggers).",
  execute: async ({ sock, msg, remoteJid, quotedMsg, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    if (!isBotOwner(senderProfile, senderJid)) {
      await sock.sendMessage(
        remoteJid,
        { text: "🚫 Solo el Creador puede agregar o modificar stickers en la rotación del bot." },
        { quoted: msg as any }
      );
      return;
    }

    const categoryArg = args[0]?.trim().toLowerCase();

    if (!categoryArg) {
      const catList = VALID_CATEGORIES.map((c) => `\`${c}\``).join(", ");
      await sock.sendMessage(
        remoteJid,
        {
          text: `ℹ️ *Guardar stickers en el bot*\n\n` +
            `Respondé a un sticker con:\n` +
            `\`!sticker <categoría> [nombre_opcional]\`\n\n` +
            `📂 *Categorías disponibles:* ${catList}\n\n` +
            `💡 *Ejemplos:*\n` +
            `• \`!sticker bardo\`\n` +
            `• \`!sticker risa jaja\`\n` +
            `• \`!sticker triggers saludo2\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    if (!VALID_CATEGORIES.includes(categoryArg)) {
      const catList = VALID_CATEGORIES.map((c) => `\`${c}\``).join(", ");
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ *Categoría inválida:* "${categoryArg}" no existe.\n\n📂 *Categorías permitidas:* ${catList}`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const targetSticker = (quotedMsg as any)?.stickerMessage || msg.message?.stickerMessage;
    const imageMsg = (quotedMsg as any)?.imageMessage || msg.message?.imageMessage;

    if (!targetSticker && !imageMsg) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ Respondé a un sticker (o imagen) con \`!sticker ${categoryArg}\` para guardarlo en la rotación.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });
      }

      let stickerBuffer: Buffer;
      let isAnimated = false;

      if (targetSticker) {
        isAnimated = Boolean(targetSticker.isAnimated);
        const stream = await (downloadContentFromMessage as any)(targetSticker, "sticker");
        stickerBuffer = await streamToBuffer(stream);
      } else {
        const stream = await (downloadContentFromMessage as any)(imageMsg, "image");
        const rawImg = await streamToBuffer(stream);
        stickerBuffer = await createSticker(rawImg);
      }

      const customName = args.length > 1 ? args.slice(1).join("_") : undefined;
      const addedBy = senderProfile?.primaryName || senderProfile?.pushName || "usuario";

      const result = await saveCustomSticker({
        category: categoryArg,
        buffer: stickerBuffer,
        isAnimated,
        customName,
        addedBy,
      });

      if (!result.success || !result.filename) {
        if (msg.key) {
          await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
        }
        await sock.sendMessage(
          remoteJid,
          { text: `❌ ${result.error || "No se pudo guardar el sticker."}` },
          { quoted: msg as any }
        );
        return;
      }

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });
      }

      await sock.sendMessage(
        remoteJid,
        {
          text: `✅ *Sticker agregado a la rotación!*\n\n` +
            `📁 *Categoría:* \`${categoryArg}\`\n` +
            `🏷️ *Archivo:* \`${result.filename}\`\n` +
            `💾 *Persistencia:* Guardado localmente y en Neon PostgreSQL para que nunca se pierda.`,
        },
        { quoted: msg as any }
      );
    } catch (error: any) {
      console.error("[Sticker Save Command] Error:", error);
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
      }
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al procesar y guardar el sticker." },
        { quoted: msg as any }
      );
    }
  },
};