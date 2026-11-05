import { Command, CommandContext } from "./types.js";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import {
  saveCustomSticker,
  VALID_CATEGORIES,
  CATEGORY_METADATA,
  getStickerCategoryCounts,
  getRandomLocalSticker,
  createSticker,
} from "../services/sticker.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import { streamToBuffer } from "../services/media.service.js";

export const stickerCommand: Command = {
  name: "sticker",
  aliases: ["guardarsticker", "savesticker", "addsticker"],
  description: "Muestra las categorías de stickers o guarda un sticker citado en la rotación (solo Creador).",
  execute: async ({ sock, msg, remoteJid, quotedMsg, args, senderProfile }: CommandContext) => {
    const targetSticker = (quotedMsg as any)?.stickerMessage || msg.message?.stickerMessage;
    const imageMsg = (quotedMsg as any)?.imageMessage || msg.message?.imageMessage;
    const categoryArg = args[0]?.trim().toLowerCase();

    // 1. Si se usa sin marcar (sin responder a un sticker ni adjuntar imagen):
    if (!targetSticker && !imageMsg) {
      // Si especificó una categoría válida o pidió "random" / "azar"
      // Manda directamente un sticker de esa categoría (o aleatorio) al chat
      const isRandomRequest = categoryArg === "random" || categoryArg === "azar";
      if (categoryArg && ((VALID_CATEGORIES.includes(categoryArg) && categoryArg !== "triggers") || isRandomRequest)) {
        const targetCategory = isRandomRequest ? "random" : categoryArg;
        const stickerData = await getRandomLocalSticker(targetCategory);
        if (stickerData) {
          await sock.sendMessage(
            remoteJid,
            { sticker: stickerData.buffer, isAnimated: stickerData.isAnimated },
            { quoted: msg as any }
          );
          return;
        } else {
          await sock.sendMessage(
            remoteJid,
            { text: `⚠️ La categoría *\`${categoryArg}\`* todavía no tiene stickers cargados en la rotación.` },
            { quoted: msg as any }
          );
          return;
        }
      }

      // Si no especificó categoría o puso !sticker solo: informar el listado con conteos
      const counts = getStickerCategoryCounts();
      const catLines = VALID_CATEGORIES.map((cat) => {
        const meta = CATEGORY_METADATA[cat] || { icon: "📁", desc: "Categoría de stickers" };
        const count = counts[cat] ?? 0;
        return `${meta.icon} *\`${cat}\`* (${count}): ${meta.desc}`;
      }).join("\n");

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `📂 *Categorías de Stickers de Empy-Bot*\n\n` +
            `${catLines}\n\n` +
            `💡 *Uso de stickers:*\n` +
            `• Pedir un sticker: \`!sticker <categoría>\` (ej: \`!sticker festejo\`, \`!sticker afecto\`)\n` +
            `• Sticker aleatorio: \`!sticker random\` o \`!sticker azar\`\n` +
            `• Guardar sticker: respondé a un sticker o foto con \`!sticker <categoría> [nombre]\` _(Solo Creador)_`,
        },
        { quoted: msg as any }
      );
      return;
    }

    // 2. Si marcó un sticker pero no indicó categoría:
    if (!categoryArg) {
      const catList = VALID_CATEGORIES.map((c) => `\`${c}\``).join(", ");
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `⚠️ *Indicá la categoría donde querés guardar el sticker.*\n\n` +
            `_Uso:_ respondé al sticker con \`!sticker <categoría> [nombre]\`\n\n` +
            `📂 *Categorías disponibles:* ${catList}`,
        },
        { quoted: msg as any }
      );
      return;
    }

    // 3. Si la categoría indicada no existe:
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

    // 4. Verificación de permisos de administración para guardar
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    if (!isBotOwner(senderProfile, senderJid)) {
      await sock.sendMessage(
        remoteJid,
        { text: "🚫 Solo el Creador puede agregar o modificar stickers en la rotación del bot." },
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
        try {
          const stream = await (downloadContentFromMessage as any)(targetSticker, "sticker");
          stickerBuffer = await streamToBuffer(stream);
        } catch (downloadErr) {
          console.warn("[Sticker Save] Falló descarga directa del sticker:", downloadErr);
          if (msg.key) {
            await sock.sendMessage(remoteJid, { react: { text: "⚠️", key: msg.key } });
          }
          await sock.sendMessage(
            remoteJid,
            {
              text: "⚠️ WhatsApp no pudo entregar el archivo del sticker citado (probablemente expiraron sus claves temporales en los servidores).\n\n💡 *Solución:* Reenviá el sticker recién al chat y volvé a responderle.",
            },
            { quoted: msg as any }
          );
          return;
        }
      } else {
        try {
          const stream = await (downloadContentFromMessage as any)(imageMsg, "image");
          const rawImg = await streamToBuffer(stream);
          stickerBuffer = await createSticker(rawImg);
        } catch (imgErr) {
          console.warn("[Sticker Save] Falló descarga de imagen:", imgErr);
          if (msg.key) {
            await sock.sendMessage(remoteJid, { react: { text: "⚠️", key: msg.key } });
          }
          await sock.sendMessage(
            remoteJid,
            {
              text: "⚠️ No se pudo procesar la imagen citada. Reenviá la foto recién y volvé a citarla.",
            },
            { quoted: msg as any }
          );
          return;
        }
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