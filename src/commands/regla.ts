import { z } from "zod";
import { Command, CommandContext } from "./types.js";
import { isBotOwner } from "../services/admin-economy.service.js";
import {
  addMasterLesson,
  clearMasterLessons,
  getCachedLessons,
  removeMasterLessonByIndex,
} from "../services/db/reflection.service.js";

const ReglaInputSchema = z.string().trim().min(6).max(200);

/**
 * Permite al Creador (Sid) consultar, fijar o eliminar reglas persistentes en BotLesson.
 */
export const reglaCommand: Command = {
  name: "regla",
  aliases: ["reglas", "leccion", "lecciones"],
  description: "Gestiona las reglas de conducta aprendidas por el bot (solo Creador).",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, args, cleanText, senderProfile } = ctx;
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    if (!isBotOwner(senderProfile, senderJid)) {
      await sock
        .sendMessage(
          remoteJid,
          { text: "⛔ Solo el Creador puede modificar mis reglas de conducta." },
          { quoted: msg as any }
        )
        .catch(() => {});
      return;
    }

    const rawText = (cleanText || args.join(" ")).trim();

    if (!rawText) {
      const lessons = getCachedLessons();
      const body =
        lessons.length === 0
          ? "📋 *Reglas activas (BotLesson):*\nSin reglas guardadas todavía.\n\nUsá `!regla <texto>` para agregar una o `!regla borrar <n|todas>`."
          : `📋 *Reglas activas (BotLesson):*\n${lessons
              .map((l, idx) => `${idx + 1}. ${l}`)
              .join("\n")}\n\nUsá \`!regla <texto>\` para sumar o \`!regla borrar <n|todas>\`.`;

      await sock.sendMessage(remoteJid, { text: body }, { quoted: msg as any }).catch(() => {});
      return;
    }

    if (/^borrar\s+/i.test(rawText)) {
      const target = rawText.replace(/^borrar\s+/i, "").trim().toLowerCase();
      if (target === "todas" || target === "todo") {
        const count = await clearMasterLessons();
        await sock
          .sendMessage(remoteJid, { text: `🗑️ Se borraron ${count} reglas guardadas.` }, { quoted: msg as any })
          .catch(() => {});
        return;
      }

      const indexNum = Number(target);
      if (!Number.isInteger(indexNum) || indexNum < 1) {
        await sock
          .sendMessage(
            remoteJid,
            { text: "⚠️ Indicá el número de regla a borrar (ej: `!regla borrar 1`) o `!regla borrar todas`." },
            { quoted: msg as any }
          )
          .catch(() => {});
        return;
      }

      const removed = await removeMasterLessonByIndex(indexNum);
      const reply = removed
        ? `🗑️ Regla eliminada: _"${removed}"_`
        : `⚠️ No encontré la regla #${indexNum}.`;
      await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg as any }).catch(() => {});
      return;
    }

    const parsed = ReglaInputSchema.safeParse(rawText);
    if (!parsed.success) {
      await sock
        .sendMessage(
          remoteJid,
          { text: "⚠️ La regla debe tener entre 6 y 200 caracteres." },
          { quoted: msg as any }
        )
        .catch(() => {});
      return;
    }

    const saved = await addMasterLesson(parsed.data, "Instrucción directa de Sid", true);
    const reply = saved
      ? `📌 Regla guardada: _"${parsed.data}"_`
      : "⚠️ No se pudo guardar la regla.";
    await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg as any }).catch(() => {});
  },
};
