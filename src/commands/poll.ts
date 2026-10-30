import { Command, CommandContext } from "./types.js";

export const pollCommand: Command = {
  name: "encuesta",
  aliases: ["poll", "votacion", "votar"],
  description: "Crea una encuesta nativa interactiva en WhatsApp.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    // Formato esperado:
    // !encuesta ¿Sale LoL hoy? | Si | No | Ni en pedo
    // o usando saltos de línea
    const rawContent = cleanText.trim();

    if (!rawContent) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "⚠️ *Modo de uso:*\n`!encuesta ¿Pregunta? | Opción 1 | Opción 2 | Opción 3`\n\n_También podés separar las opciones con saltos de línea._",
        },
        { quoted: msg as any }
      );
      return;
    }

    let items: string[] = [];
    if (rawContent.includes("|")) {
      items = rawContent.split("|").map((s) => s.trim()).filter(Boolean);
    } else if (rawContent.includes("\n")) {
      items = rawContent.split("\n").map((s) => s.trim()).filter(Boolean);
    }

    if (items.length < 3) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "⚠️ Tenés que poner una pregunta y al menos dos opciones separadas por `|`.\nEjemplo:\n`!encuesta ¿Qué comemos? | Pizza | Empanadas | Asado`",
        },
        { quoted: msg as any }
      );
      return;
    }

    const question = items[0].slice(0, 255);
    // Deduplicar opciones preservando orden y recortar a máximo 100 caracteres por opción
    const seen = new Set<string>();
    const options: string[] = [];
    for (const opt of items.slice(1, 13)) {
      const trimmed = opt.slice(0, 100).trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      options.push(trimmed);
    }

    if (options.length < 2) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "⚠️ Tenés que especificar al menos dos opciones distintas entre sí.",
        },
        { quoted: msg as any }
      );
      return;
    }

    try {
      await sock.sendMessage(remoteJid, {
        poll: {
          name: question,
          values: options,
          selectableCount: 1,
        },
      });

      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "📊", key: msg.key } });
      }
    } catch (err) {
      console.error("[Poll Command] Error creando encuesta:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al crear la encuesta nativa en WhatsApp." },
        { quoted: msg as any }
      );
    }
  },
};
