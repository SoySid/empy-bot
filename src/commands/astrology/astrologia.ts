import { Command, CommandContext } from "../types.js";
import { horoscopoCommand } from "./horoscopo.js";
import { cartaAstralCommand } from "./cartaastral.js";
import { sinastriaCommand } from "./sinastria.js";
import { tarotCommand } from "./tarot.js";
import { setCumpleCommand } from "./setcumple.js";
import { normalizeSignName } from "../../services/astrology.service.js";

export const astrologiaCommand: Command = {
  name: "astrologia",
  aliases: ["zodiaco", "misticismo", "guiaastral", "astro"],
  description: "Guía completa del módulo astral, horóscopo, tarot y sinastría de Empy.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, args } = ctx;

    const sub = (args[0] || "").toLowerCase().trim();

    // Enrutador inteligente de subcomandos si el usuario pasa argumentos
    if (sub === "horoscopo" || sub === "horoscope" || sub === "diario") {
      return horoscopoCommand.execute({ ...ctx, args: args.slice(1) });
    }
    if (sub === "carta" || sub === "cartaastral" || sub === "astral" || sub === "natal") {
      return cartaAstralCommand.execute({ ...ctx, args: args.slice(1) });
    }
    if (sub === "sinastria" || sub === "compatibilidad" || sub === "match" || sub === "pareja") {
      return sinastriaCommand.execute({ ...ctx, args: args.slice(1) });
    }
    if (sub === "tarot" || sub === "cartas" || sub === "tirada") {
      return tarotCommand.execute({
        ...ctx,
        cleanText: ctx.cleanText.replace(/^[!\./]?(astrologia|zodiaco|misticismo|guiaastral|astro)\s+(tarot|cartas|tirada)\b/i, "!tarot"),
        args: args.slice(1),
      });
    }
    if (sub === "setcumple" || sub === "setsigno" || sub === "perfil" || sub === "cumple") {
      return setCumpleCommand.execute({ ...ctx, args: args.slice(1) });
    }

    // Si pasaron un signo directo (ej: !astrologia aries o !zodiaco tauro)
    if (normalizeSignName(sub)) {
      return horoscopoCommand.execute(ctx);
    }

    // Guía general (estilo !economia)
    const text =
      `🔮 *GUÍA ASTRAL & ESOTÉRICA (Empyreal)*\n\n` +
      `✨ *HORÓSCOPO & PERFIL:*\n` +
      `• \`!horoscopo [signo]\`: Tu predicción del día (amor, plata, ánimo y alerta del día).\n` +
      `• \`!setcumple <DD/MM>\`: Guarda tu cumpleaños y signo para siempre en tu perfil.\n` +
      `• \`!setsigno <signo>\`: Guarda tu signo directo (ej: \`!setsigno escorpio\`).\n\n` +
      `🌌 *CARTA NATAL & ASTRONOMÍA:*\n` +
      `• \`!cartaastral DD/MM/AAAA [HH:MM] [Ciudad]\`: Posiciones astronómicas reales de Sol, Luna, Ascendente, Mercurio, Venus y Marte con interpretación psicológica.\n\n` +
      `💫 *VÍNCULOS & QUÍMICA:*\n` +
      `• \`!sinastria @usuario\`: Compatibilidad cósmica, química cotidiana y zona de bardo.\n` +
      `• \`!compatibilidad @usuario\`: Alias directo para chequear cómo se llevan.\n\n` +
      `🃏 *TAROT & DESTINO:*\n` +
      `• \`!tarot [pregunta]\`: Tirada de 3 cartas del Tarot de Marsella con veredicto directo, tajante y sin rodeos a tu consulta.\n\n` +
      `💡 _Tirá \`!horoscopo\` para ver tu día o \`!tarot ¿Me conviene cambiar de laburo?\` para consultar las cartas._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
