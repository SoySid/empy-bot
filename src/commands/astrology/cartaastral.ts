import { Command, CommandContext } from "../types.js";
import {
  getSignFromDate,
  parseDateString,
  calculateNatalChart,
  getNatalChartReading,
} from "../../services/astrology.service.js";
import { upsertUserFact } from "../../services/db/user.service.js";

export const cartaAstralCommand: Command = {
  name: "cartaastral",
  aliases: ["carta", "astral", "cartanatal"],
  description: "Calcula con precisión astronómica tus posiciones de Sol, Luna, Ascendente y planetas con interpretación de Empy.",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🌌", key: msg.key } }).catch(() => {});
    }

    const userJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const userName = senderProfile?.primaryName || "Usuario";

    let dateStr: string | null = null;
    let hourStr: string | undefined;
    let cityParts: string[] = [];

    // Parsear argumentos ingresados
    for (const arg of args) {
      if (!dateStr && /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/.test(arg)) {
        dateStr = arg;
      } else if (!hourStr && /^(\d{1,2}):(\d{2})$/.test(arg)) {
        hourStr = arg;
      } else {
        cityParts.push(arg);
      }
    }

    let cityInput = cityParts.join(" ").trim() || undefined;

    // Si no se pasaron argumentos completos, recurrir a los hechos guardados en el perfil
    if (!dateStr && senderProfile?.facts) {
      const savedDate = senderProfile.facts.find(
        (f) => f.clave === "fecha_nacimiento" || f.clave === "cumpleanos"
      )?.valor;
      if (savedDate) dateStr = savedDate;

      if (!hourStr) {
        const savedHour = senderProfile.facts.find((f) => f.clave === "hora_nacimiento")?.valor;
        if (savedHour) hourStr = savedHour;
      }

      if (!cityInput) {
        const savedCity = senderProfile.facts.find((f) => f.clave === "ciudad_nacimiento")?.valor;
        if (savedCity) cityInput = savedCity;
      }
    }

    // Si todavía no hay fecha, explicar cómo se usa
    if (!dateStr) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🌌 *CARTA ASTRAL NATAL DE EMPY*\n\n` +
            `Para calcular con posiciones astronómicas reales tu Sol, Luna, Ascendente y planetas, pasame tus datos de nacimiento:\n\n` +
            `👉 *!cartaastral DD/MM/AAAA [HH:MM] [Ciudad]*\n\n` +
            `_Ejemplos:_\n` +
            `• *!cartaastral 15/05/1998 14:30 Córdoba*\n` +
            `• *!cartaastral 23/10/2001 08:15 Buenos Aires*\n` +
            `• *!cartaastral 04/09/1999* _(sin hora calcula Sol, Luna y planetas)_\n\n` +
            `💡 _Una vez ingresados, tus datos quedan registrados para que no tengas que repetirlos._`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const parsed = parseDateString(dateStr);
    if (!parsed) {
      await sock.sendMessage(
        remoteJid,
        { text: "❌ *Formato de fecha inválido.* Usá DD/MM/AAAA (ej: `!cartaastral 15/05/1998`)." },
        { quoted: msg as any }
      );
      return;
    }

    // Persistir datos en UserFact para futuras consultas
    await upsertUserFact(userJid, "PERMANENTE", "fecha_nacimiento", dateStr);
    const solarSign = getSignFromDate(parsed.day, parsed.month);
    await upsertUserFact(userJid, "PERMANENTE", "signo", solarSign);
    if (hourStr) {
      await upsertUserFact(userJid, "PERMANENTE", "hora_nacimiento", hourStr);
    }
    if (cityInput) {
      await upsertUserFact(userJid, "PERMANENTE", "ciudad_nacimiento", cityInput);
    }

    // Cómputo astronómico real
    const chartData = calculateNatalChart(parsed.year, parsed.month, parsed.day, hourStr, cityInput);
    const reading = await getNatalChartReading(chartData, userName);

    await sock.sendMessage(remoteJid, { text: reading }, { quoted: msg as any });
  },
};
