import { Command, CommandContext } from "./types.js";
import { createFeedbackItem, getFeedbackItems, archiveFeedbackItem } from "../services/notion.service.js";
import { isBotOwner } from "../services/admin-economy.service.js";

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
    ctx.senderProfile?.primaryName ||
    ctx.senderProfile?.pushName ||
    ctx.senderProfile?.realName ||
    ctx.msg.pushName ||
    ctx.msg.key?.participant?.split("@")[0] ||
    ctx.remoteJid.split("@")[0] ||
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

export const listaCommand: Command = {
  name: "lista",
  aliases: ["backlog", "tickets", "ideas", "bugs"],
  description: "Muestra la lista de ideas y bugs activos pendientes en el tablero de Notion.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    try {
      const res = await getFeedbackItems();
      if (!res.success) {
        await sock.sendMessage(
          remoteJid,
          { text: `⚠️ *No se pudo consultar Notion:* ${res.error || "Error de conexión."}` },
          { quoted: msg as any }
        );
        return;
      }

      const activeItems = res.items.filter((i) => i.status === "Nuevo" || i.status === "En Progreso");

      if (activeItems.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: "📋 *Tablero de Notion al día!*\n\nNo hay tickets pendientes ni bugs abiertos en este momento. Podés reportar uno con `!bug <texto>` o sugerir con `!idea <texto>`." },
          { quoted: msg as any }
        );
        return;
      }

      const bugs = activeItems.filter((i) => i.type === "Bug");
      const ideas = activeItems.filter((i) => i.type !== "Bug");

      let text = `📋 *TABLERO DE CONTROL — NOTION* 🚀\n\n`;

      if (bugs.length > 0) {
        text += `🐛 *Bugs en Seguimiento (${bugs.length}):*\n`;
        for (const b of bugs) {
          const statusIcon = b.status === "En Progreso" ? "⚙️" : "🆕";
          text += `• ${statusIcon} *${b.title}* _(${b.priority})_\n`;
        }
        text += `\n`;
      }

      if (ideas.length > 0) {
        text += `💡 *Ideas & Sugerencias (${ideas.length}):*\n`;
        for (const id of ideas) {
          const statusIcon = id.status === "En Progreso" ? "⚙️" : "🆕";
          text += `• ${statusIcon} *${id.title}* _(${id.priority})_\n`;
        }
        text += `\n`;
      }

      text += `_Sumá tu reporte con \`!bug <texto>\` o tu propuesta con \`!idea <texto>\`._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
    } catch (err: any) {
      console.error("[Lista Command Error]:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al obtener la lista de Notion." },
        { quoted: msg as any }
      );
    }
  },
};

/**
 * Comando para descartar o archivar ideas/reportes en Notion.
 * Exclusivo para el Creador del bot.
 */
export const borrarIdeaCommand: Command = {
  name: "borraridea",
  aliases: ["delidea", "eliminaridea", "quitaridea", "borrarsugerencia"],
  description: "Archiva y elimina una idea o ticket troll de Notion (solo Creador).",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, cleanText, quotedMsg } = ctx;
    const senderJid = ctx.senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      await sock.sendMessage(
        remoteJid,
        { text: "⛔ Este comando está reservado exclusivamente para el Creador del bot." },
        { quoted: msg as any }
      );
      return;
    }

    let inputTarget = cleanText.trim();
    const quotedText = extractQuotedText(quotedMsg);

    // Si no mandó texto pero citó un mensaje, intentar extraer la ID o fragmento
    if (!inputTarget && quotedText) {
      const matchUuid = quotedText.match(/[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}/i);
      if (matchUuid) {
        inputTarget = matchUuid[0];
      } else {
        inputTarget = quotedText.slice(0, 40);
      }
    }

    if (!inputTarget || inputTarget.length < 2) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "📌 *Uso del comando:* `!borraridea <ID o palabra clave>`\n" +
            "_Ejemplos:_\n" +
            "• `!borraridea cobrarle mas`\n" +
            "• `!borraridea 413f1ec4-5aeb-8140-813a-f2e3980dcef8`\n" +
            "• O citá el mensaje de una idea escribiendo `!borraridea`.",
        },
        { quoted: msg as any }
      );
      return;
    }

    // 1. Si parece un UUID directo de Notion
    const isExactUuid = /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i.test(inputTarget);
    if (isExactUuid) {
      const res = await archiveFeedbackItem(inputTarget);
      if (res.success) {
        await sock.sendMessage(
          remoteJid,
          { text: `🗑️ *Ticket archivado en Notion con éxito!*\nID: \`${inputTarget}\`` },
          { quoted: msg as any }
        );
      } else {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ No se pudo archivar el ticket: ${res.error || "ID no encontrado"}` },
          { quoted: msg as any }
        );
      }
      return;
    }

    // 2. Búsqueda por texto en items activos de Notion
    try {
      const listRes = await getFeedbackItems();
      if (!listRes.success) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ Error al conectar con Notion: ${listRes.error}` },
          { quoted: msg as any }
        );
        return;
      }

      const queryLower = inputTarget.toLowerCase();
      const activeItems = listRes.items.filter((i) => i.status === "Nuevo" || i.status === "En Progreso");
      const matched = activeItems.filter(
        (i) =>
          i.id.toLowerCase().includes(queryLower) ||
          i.title.toLowerCase().includes(queryLower) ||
          (i.detail || "").toLowerCase().includes(queryLower)
      );

      if (matched.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: `🔍 No encontré ningún ticket activo que coincida con "*${inputTarget}*".` },
          { quoted: msg as any }
        );
        return;
      }

      if (matched.length === 1) {
        const targetItem = matched[0];
        const res = await archiveFeedbackItem(targetItem.id);
        if (res.success) {
          await sock.sendMessage(
            remoteJid,
            {
              text:
                `🗑️ *Idea archivada con éxito!*\n\n` +
                `• *Título:* ${targetItem.title}\n` +
                `• *Tipo:* ${targetItem.type}\n` +
                `• *Autor:* ${targetItem.author}\n` +
                `• *ID:* \`${targetItem.id}\``,
            },
            { quoted: msg as any }
          );
        } else {
          await sock.sendMessage(
            remoteJid,
            { text: `❌ Falló el archivado en Notion: ${res.error}` },
            { quoted: msg as any }
          );
        }
        return;
      }

      // Si hay más de una coincidencia, mostrar opciones
      const preview = matched
        .slice(0, 5)
        .map((m) => `• \`${m.id}\` — *${m.title}*`)
        .join("\n");

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `⚠️ Se encontraron *${matched.length}* coincidencias. Especificá la ID exacta con \`!borraridea <ID>\`:\n\n${preview}`,
        },
        { quoted: msg as any }
      );
    } catch (err: any) {
      console.error("[BorrarIdea Error]:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al procesar el borrado en Notion." },
        { quoted: msg as any }
      );
    }
  },
};
