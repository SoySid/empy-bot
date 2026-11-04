import { Command, CommandContext } from "./types.js";
import axios from "axios";

export const dolarCommand: Command = {
  name: "dolar",
  aliases: ["dólar", "usd", "cotizacion", "cotizaciones"],
  description: "Muestra las cotizaciones actuales del dólar en Argentina.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    try {
      const res = await axios.get("https://dolarapi.com/v1/dolares", { timeout: 6000 });
      const data: any[] = res.data;

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Respuesta inválida de DolarApi");
      }

      const relevant = ["Oficial", "Blue", "Tarjeta", "Bolsa", "Contado con liquidación", "Cripto"];
      const filtered = data.filter((d) => relevant.some((r) => r.toLowerCase() === d.nombre.toLowerCase()));

      const lines = (filtered.length > 0 ? filtered : data.slice(0, 5)).map((d) => {
        return `💵 *${d.nombre}:*\n  • Compra: *$${d.compra}* | Venta: *$${d.venta}*`;
      });

      const updated = data[0]?.fechaActualizacion
        ? new Date(data[0].fechaActualizacion).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

      const text = `📈 *COTIZACIÓN DÓLAR (ARGENTINA)*\n\n${lines.join("\n\n")}${
        updated ? `\n\n🕒 _Actualizado: ${updated} hs_` : ""
      }`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
    } catch (err) {
      console.error("[Dolar Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude obtener las cotizaciones del dólar en este momento." },
        { quoted: msg as any }
      );
    }
  },
};

const WMO_WEATHER_MAP: Record<number, { text: string; emoji: string }> = {
  0: { text: "Cielo despejado", emoji: "☀️" },
  1: { text: "Mayormente despejado", emoji: "🌤️" },
  2: { text: "Parcialmente nublado", emoji: "⛅" },
  3: { text: "Nublado", emoji: "☁️" },
  45: { text: "Niebla", emoji: "🌫️" },
  48: { text: "Niebla con escarcha", emoji: "🌫️" },
  51: { text: "Llovizna leve", emoji: "🌦️" },
  53: { text: "Llovizna moderada", emoji: "🌦️" },
  55: { text: "Llovizna densa", emoji: "🌧️" },
  61: { text: "Lluvia leve", emoji: "🌧️" },
  63: { text: "Lluvia moderada", emoji: "🌧️" },
  65: { text: "Lluvia fuerte", emoji: "🌧️" },
  71: { text: "Nevada leve", emoji: "❄️" },
  73: { text: "Nevada moderada", emoji: "❄️" },
  75: { text: "Nevada intensa", emoji: "❄️" },
  80: { text: "Chubascos leves", emoji: "🌦️" },
  81: { text: "Chubascos moderados", emoji: "🌧️" },
  82: { text: "Chubascos violentos", emoji: "⛈️" },
  95: { text: "Tormenta eléctrica", emoji: "⛈️" },
  96: { text: "Tormenta eléctrica con granizo leve", emoji: "⛈️" },
  99: { text: "Tormenta eléctrica con granizo fuerte", emoji: "⛈️" },
};

export const climaCommand: Command = {
  name: "clima",
  aliases: ["tiempo", "temperatura", "weather"],
  description: "Consulta el clima actual y pronóstico mediante Open-Meteo.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    const city = cleanText.trim() || "Buenos Aires";

    try {
      // 1. Geocodificación del nombre de la ciudad
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city
      )}&language=es&count=1`;
      const geoRes = await axios.get(geoUrl, { timeout: 6000 });
      const geoData = geoRes.data;

      if (!geoData.results || geoData.results.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ No encontré datos para la ciudad "*${city}*". Probá con un nombre más específico.` },
          { quoted: msg as any }
        );
        return;
      }

      const location = geoData.results[0];
      const { name, latitude, longitude, country, admin1 } = location;

      // 2. Consulta de clima actual y extremos del día
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const weatherRes = await axios.get(weatherUrl, { timeout: 6000 });
      const current = weatherRes.data?.current;
      const daily = weatherRes.data?.daily;

      if (!current) {
        throw new Error("Respuesta inválida de Open-Meteo");
      }

      const condition = WMO_WEATHER_MAP[current.weather_code] || {
        text: "Tiempo variable",
        emoji: "🌡️",
      };

      const locTitle = `${name.toUpperCase()}${admin1 ? `, ${admin1}` : ""}${country ? ` (${country})` : ""}`;
      const tempActual = Math.round(current.temperature_2m);
      const tempSensacion = Math.round(current.apparent_temperature);
      const minToday = daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null;
      const maxToday = daily?.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null;

      let report = `🌤️ *CLIMA EN ${locTitle}*\n\n`;
      report += `• *Estado:* ${condition.emoji} ${condition.text}\n`;
      report += `• *Temperatura:* ${tempActual}°C (ST: ${tempSensacion}°C)\n`;
      if (minToday != null && maxToday != null) {
        report += `• *Mín / Máx hoy:* ${minToday}°C / ${maxToday}°C\n`;
      }
      report += `• *Humedad:* ${current.relative_humidity_2m}%\n`;
      report += `• *Viento:* ${Math.round(current.wind_speed_10m)} km/h\n`;
      if (current.precipitation > 0) {
        report += `• *Precipitación:* ${current.precipitation} mm\n`;
      }

      await sock.sendMessage(remoteJid, { text: report.trim() }, { quoted: msg as any });
    } catch (err) {
      console.error("[Clima Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al consultar el servicio meteorológico de Open-Meteo." },
        { quoted: msg as any }
      );
    }
  },
};

export const tiempoCommand = climaCommand;

export const hoyCommand: Command = {
  name: "hoy",
  aliases: ["efemerides", "undiacomohoy", "efemeride"],
  description: "Muestra acontecimientos históricos y efemérides ocurridas un día como hoy.",
  execute: async ({ sock, msg, remoteJid }: CommandContext) => {
    try {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      const url = `https://es.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "EmpyBot/1.0 (https://github.com/empy-bot; bot@empy.local)",
        },
        timeout: 6000,
      });

      const events: Array<{ year: number; text: string }> = res.data?.events || [];
      if (!events || events.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: `📜 No encontré efemérides registradas para el día ${day}/${month}.` },
          { quoted: msg as any }
        );
        return;
      }

      // Tomar una muestra representativa de 4 o 5 eventos variados a lo largo de la historia
      const step = Math.max(1, Math.floor(events.length / 5));
      const picked: Array<{ year: number; text: string }> = [];
      for (let i = 0; i < events.length && picked.length < 5; i += step) {
        picked.push(events[i]);
      }

      const lines = picked.map((ev) => `• *Año ${ev.year}:* ${ev.text}`);

      const header = `📜 *UN DÍA COMO HOY (${day}/${month})*\n_Efemérides destacadas de la historia:_\n\n`;
      const text = header + lines.join("\n\n");

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
    } catch (err) {
      console.error("[Hoy Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ No pude obtener las efemérides del día en este momento." },
        { quoted: msg as any }
      );
    }
  },
};

export const cumpleCommand: Command = {
  name: "cumple",
  aliases: ["cumpleanos", "cumpleaños", "aniversario", "bday"],
  description: "Muestra la fecha oficial de cumpleaños y aniversario de Empy-Bot.",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const text =
      `🎂 *CUMPLEAÑOS OFICIAL DE EMPY-BOT* 🎉\n\n` +
      `• *Fecha de Nacimiento:* 22 de Agosto\n` +
      `• *Signo Zodiacal:* Leo en cúspide con Virgo ♌♍\n` +
      `• *Creador:* Alfredo (Sid)\n\n` +
      `_¡Anoten la fecha para los festejos y las empanadas!_ 🥟🍾`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

