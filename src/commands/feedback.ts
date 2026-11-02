import { Command, CommandContext } from "./types.js";
import { createFeedbackItem } from "../services/notion.service.js";

function extractQuotedText(quotedMsg?: any): string | null {
  if (!quotedMsg) return null;
  return (
    quotedMsg.conversation ||
    quotedMsg.extendedTextMessage?.text ||
    quotedMsg.imageMessage?.caption ||
    quotedMsg.videoMessage?.caption ||
    null
  );
}

function resolveAuthorName(ctx: CommandContext): string {
  return (
    ctx.senderProfile?.nickname ||
    ctx.senderProfile?.name ||
    ctx.msg.pushName ||
    (ctx.msg.key.participant ? ctx.msg.key.participant.split("@")[0] : ctx.remoteJid.split("@")[0]) ||
    "Usuario WhatsApp"
  );
}

export const bugCommand: Command = {
  name: "bug",
  aliases: ["error", "reportar", "reporte", "fallo"],
  description: "Reporta un problema o error directamente a la base de datos de Notion.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, cleanText, quotedMsg } = ctx;
    const description = cleanText.trim();

    if (!description || description.length < 3) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "📌 *Uso correcto del comando:*\n`!bug <descripción del problema>`\n\n_Ejemplo:_ `!bug no funciona la descarga de audio de youtube`",
        },
        { quoted: msg as any }
      );
      return;
    }

    const author = resolveAuthorName(ctx);
    const quotedText = extractQuotedText(quotedMsg);
    const detail = quotedText
      ? `${description}\n\n[Mensaje citado]: "${quotedText}"`
      : description;

    const result = await createFeedbackItem({
      title: description.slice(0, 180),
      type: "Bug",
      priority: "Alta",
      origin: "WhatsApp",
      author,
      detail,
    });

    if (result.success) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "🐞 *Incidencia registrada en Notion*\n\nTu reporte ha sido ingresado al panel de control para su diagnóstico y resolución.",
        },
        { quoted: msg as any }
      );
    } else {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ *No se pudo registrar en Notion:* ${result.error}`,
        },
        { quoted: msg as any }
      );
    }
  },
};

export const ideaCommand: Command = {
  name: "idea",
  aliases: ["sugerencia", "sugiero", "propuesta"],
  description: "Propone una sugerencia o nuevo comando directamente en la cola de Notion.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, cleanText, quotedMsg } = ctx;
    const description = cleanText.trim();

    if (!description || description.length < 3) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "📌 *Uso correcto del comando:*\n`!idea <tu sugerencia>`\n\n_Ejemplo:_ `!idea agregar comando para consultar el clima por ciudad`",
        },
        { quoted: msg as any }
      );
      return;
    }

    const author = resolveAuthorName(ctx);
    const quotedText = extractQuotedText(quotedMsg);
    const detail = quotedText
      ? `${description}\n\n[Mensaje citado]: "${quotedText}"`
      : description;

    const result = await createFeedbackItem({
      title: description.slice(0, 180),
      type: "Sugerencia",
      priority: "Media",
      origin: "WhatsApp",
      author,
      detail,
    });

    if (result.success) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "💡 *Sugerencia guardada en Notion*\n\n¡Gracias por tu aporte! Ha sido agregada a la lista de ideas para futuras versiones.",
        },
        { quoted: msg as any }
      );
    } else {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚠️ *No se pudo registrar en Notion:* ${result.error}`,
        },
        { quoted: msg as any }
      );
    }
  },
};
