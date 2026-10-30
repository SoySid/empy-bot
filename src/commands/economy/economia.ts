import { Command, CommandContext } from "../types.js";
import { ECONOMY_CONFIG } from "../../config/economy.config.js";

export const economiaCommand: Command = {
  name: "economia",
  aliases: ["ayudaeconomia", "economiainfo", "guiaeco"],
  description: "Guía rápida de comandos de economía.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    const text =
      `🏛️ *GUÍA DE ECONOMÍA (Empyreal)*\n\n` +
      `💼 *LABURO & OFICIOS:*\n` +
      `• \`!billetera\`: Saldo, energía, oficio y cooldowns.\n` +
      `• \`!profesion <oficio>\`: Elegí entre los 12 oficios disponibles.\n` +
      `• \`!laburar\`: Changa de oficio (1:30 min base, baja a 45s con tools).\n` +
      `• \`!tienda <oficio>\`: Herramientas (T1-T7), reliquia y sede propia.\n` +
      `• \`!uni\`: Cursos técnicos y exámenes universitarios.\n\n` +
      `🛒 *COMERCIO & ENERGÍA:*\n` +
      `• \`!tienda\`: Catálogo (secciones: \`morfi\`, \`negocios\`, \`lujo\`).\n` +
      `• \`!comer <item>\`: Reponer energía (o auto-compra al paso).\n` +
      `• \`!diario\`: Cobro pasivo cada 20hs (+ renta de negocios cada 50 msgs).\n` +
      `• \`!inventario\`: Ver provisiones, herramientas y propiedades.\n\n` +
      `🎲 *TIMBA & CALLE:*\n` +
      `• \`!robar @user\`: Asalto al paso (65% de éxito).\n` +
      `• \`!21 <monto>\` / \`!slot <monto>\` / \`!ruleta <color> <monto>\`: Casino.\n` +
      `• \`!reclamar\`: Agarrar fajos de plata caídos en el chat.\n\n` +
      `💡 _Tirá \`!billetera\` o \`!tienda\` para empezar._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
