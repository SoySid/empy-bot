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

const WEATHER_USER_AGENT = "EmpyBot/1.0 (https://github.com/SoySid/empy-bot; soysidarg@gmail.com)";
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const OPEN_METEO_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const EXPLICIT_COUNTRY_REGEX =
  /(,\s*|\s+(en|de)\s+)(españa|espana|mexico|méxico|chile|uruguay|brasil|brazil|peru|perú|colombia|venezuela|eeuu|usa|estados unidos|francia|italia|alemania|inglaterra|reino unido|uk|europa|asia)/i;

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface WeatherSnapshot {
  conditionText: string;
  conditionEmoji: string;
  tempActual: number;
  tempSensacion: number;
  minToday: number | null;
  maxToday: number | null;
  humidity: number;
  windKmh: number;
  precipitationMm: number;
}

const geoCache = new Map<string, GeoLocation>();
const weatherCache = new Map<string, { report: string; expiresAt: number }>();
let openMeteoBlockedUntil = 0;

function setBoundedCache<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

function mapMetSymbol(symbolCode: string): { text: string; emoji: string } {
  const s = symbolCode.toLowerCase();
  if (s.includes("thunder")) return { text: "Tormenta eléctrica", emoji: "⛈️" };
  if (s.includes("snow") || s.includes("sleet")) return { text: "Nevada", emoji: "❄️" };
  if (s.includes("heavyrain")) return { text: "Lluvia fuerte", emoji: "🌧️" };
  if (s.includes("rainshowers")) return { text: "Chubascos", emoji: "🌦️" };
  if (s.includes("lightrain") || s.includes("drizzle")) return { text: "Llovizna leve", emoji: "🌦️" };
  if (s.includes("rain")) return { text: "Lluvia moderada", emoji: "🌧️" };
  if (s.includes("fog")) return { text: "Niebla", emoji: "🌫️" };
  if (s.includes("partlycloudy")) return { text: "Parcialmente nublado", emoji: "⛅" };
  if (s.includes("cloudy")) return { text: "Nublado", emoji: "☁️" };
  if (s.includes("fair")) return { text: "Mayormente despejado", emoji: "🌤️" };
  if (s.includes("clearsky")) return { text: "Cielo despejado", emoji: "☀️" };
  return { text: "Tiempo variable", emoji: "🌡️" };
}

function mapWttrEmoji(code: number): string {
  if ([200, 386, 389, 392, 395].includes(code)) return "⛈️";
  if ([179, 182, 185, 227, 230].includes(code) || (code >= 323 && code <= 377)) return "❄️";
  if ([143, 248, 260].includes(code)) return "🌫️";
  if ([176, 263, 266, 293, 296, 353].includes(code)) return "🌦️";
  if ([299, 302, 305, 308, 356, 359].includes(code) || (code >= 311 && code <= 320)) return "🌧️";
  if ([119, 122].includes(code)) return "☁️";
  if (code === 116) return "⛅";
  if (code === 113) return "☀️";
  return "🌡️";
}

async function queryNominatim(query: string): Promise<GeoLocation | null> {
  const res = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: {
      q: query,
      format: "jsonv2",
      addressdetails: 1,
      limit: 5,
      "accept-language": "es",
    },
    headers: { "User-Agent": WEATHER_USER_AGENT },
    timeout: 6000,
  });

  const item = Array.isArray(res.data) ? res.data[0] : null;
  if (!item || item.lat == null || item.lon == null) return null;

  return {
    name: item.name || String(item.display_name || query).split(",")[0].trim(),
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    country: item.address?.country,
    admin1: item.address?.state,
  };
}

export async function resolveCityLocation(
  city: string
): Promise<{ location: GeoLocation | null; geocodingErrored: boolean }> {
  const cacheKey = city.toLowerCase().trim();
  const cached = geoCache.get(cacheKey);
  if (cached) return { location: cached, geocodingErrored: false };

  const isExplicitCountry = EXPLICIT_COUNTRY_REGEX.test(city);
  let geocodingErrored = false;

  if (Date.now() >= openMeteoBlockedUntil) {
    try {
      const geoRes = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
        params: { name: city, count: 10, language: "es", format: "json" },
        timeout: 5000,
      });
      const results = geoRes.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        let arMatch = isExplicitCountry ? null : results.find((r: any) => r.country_code === "AR");
        if (!arMatch && !isExplicitCountry && results.length >= 10) {
          const arGeoRes = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
            params: { name: city, count: 5, language: "es", format: "json", countryCode: "AR" },
            timeout: 4000,
          });
          arMatch = arGeoRes.data?.results?.[0] || null;
        }
        const picked = arMatch || results[0];
        const loc: GeoLocation = {
          name: picked.name,
          latitude: picked.latitude,
          longitude: picked.longitude,
          country: picked.country,
          admin1: picked.admin1,
        };
        setBoundedCache(geoCache, cacheKey, loc);
        return { location: loc, geocodingErrored: false };
      }
    } catch (err: any) {
      geocodingErrored = true;
      if (err?.response?.status === 429) {
        openMeteoBlockedUntil = Date.now() + OPEN_METEO_COOLDOWN_MS;
      }
    }
  } else {
    geocodingErrored = true;
  }

  try {
    let loc = await queryNominatim(isExplicitCountry ? city : `${city}, Argentina`);
    if (!loc && !isExplicitCountry) {
      loc = await queryNominatim(city);
    }
    if (loc) {
      setBoundedCache(geoCache, cacheKey, loc);
      return { location: loc, geocodingErrored: false };
    }
    return { location: null, geocodingErrored: false };
  } catch {
    return { location: null, geocodingErrored: true };
  }
}

async function fetchFromOpenMeteo(loc: GeoLocation): Promise<WeatherSnapshot | null> {
  if (Date.now() < openMeteoBlockedUntil) return null;
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    const weatherRes = await axios.get(weatherUrl, { timeout: 5000 });
    const current = weatherRes.data?.current;
    const daily = weatherRes.data?.daily;
    if (!current) return null;

    const condition = WMO_WEATHER_MAP[current.weather_code] || {
      text: "Tiempo variable",
      emoji: "🌡️",
    };

    return {
      conditionText: condition.text,
      conditionEmoji: condition.emoji,
      tempActual: Math.round(current.temperature_2m),
      tempSensacion: Math.round(current.apparent_temperature),
      minToday: daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null,
      maxToday: daily?.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null,
      humidity: Math.round(current.relative_humidity_2m),
      windKmh: Math.round(current.wind_speed_10m),
      precipitationMm: Number(current.precipitation || 0),
    };
  } catch (err: any) {
    if (err?.response?.status === 429) {
      openMeteoBlockedUntil = Date.now() + OPEN_METEO_COOLDOWN_MS;
    }
    console.warn("[Clima Open-Meteo] Falló consulta, cambiando a respaldo:", err?.message || err);
    return null;
  }
}

async function fetchFromMetNorway(loc: GeoLocation): Promise<WeatherSnapshot | null> {
  try {
    const res = await axios.get("https://api.met.no/weatherapi/locationforecast/2.0/compact", {
      params: {
        lat: Number(loc.latitude.toFixed(4)),
        lon: Number(loc.longitude.toFixed(4)),
      },
      headers: { "User-Agent": WEATHER_USER_AGENT },
      timeout: 6000,
    });

    const timeseries = res.data?.properties?.timeseries;
    if (!Array.isArray(timeseries) || timeseries.length === 0) return null;

    const first = timeseries[0]?.data;
    const details = first?.instant?.details;
    if (!details || details.air_temperature == null) return null;

    const t = Number(details.air_temperature);
    const rh = Number(details.relative_humidity ?? 50);
    const ws = Number(details.wind_speed ?? 0);
    const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
    const apparent = t + 0.33 * e - 0.7 * ws - 4.0;

    const temps24h = timeseries
      .slice(0, 24)
      .map((entry: any) => entry?.data?.instant?.details?.air_temperature)
      .filter((val: unknown): val is number => typeof val === "number");

    const next1h = first?.next_1_hours;
    const next6h = first?.next_6_hours;
    const symbolCode = next1h?.summary?.symbol_code || next6h?.summary?.symbol_code || "";
    const condition = mapMetSymbol(symbolCode);

    return {
      conditionText: condition.text,
      conditionEmoji: condition.emoji,
      tempActual: Math.round(t),
      tempSensacion: Math.round(apparent),
      minToday: temps24h.length > 0 ? Math.round(Math.min(...temps24h)) : null,
      maxToday: temps24h.length > 0 ? Math.round(Math.max(...temps24h)) : null,
      humidity: Math.round(rh),
      windKmh: Math.round(ws * 3.6),
      precipitationMm: Number(next1h?.details?.precipitation_amount ?? next6h?.details?.precipitation_amount ?? 0),
    };
  } catch (err: any) {
    console.warn("[Clima MET Norway] Falló respaldo:", err?.message || err);
    return null;
  }
}

async function fetchFromWttr(query: string): Promise<WeatherSnapshot | null> {
  try {
    const res = await axios.get(`https://wttr.in/${encodeURIComponent(query)}`, {
      params: { format: "j1", lang: "es" },
      headers: { "User-Agent": WEATHER_USER_AGENT },
      timeout: 6000,
    });
    const cc = res.data?.current_condition?.[0];
    if (!cc || cc.temp_C == null) return null;

    const day = res.data?.weather?.[0];
    const code = Number(cc.weatherCode || 0);
    const desc = cc.lang_es?.[0]?.value || cc.weatherDesc?.[0]?.value || "Tiempo variable";

    return {
      conditionText: desc,
      conditionEmoji: mapWttrEmoji(code),
      tempActual: Math.round(Number(cc.temp_C)),
      tempSensacion: Math.round(Number(cc.FeelsLikeC ?? cc.temp_C)),
      minToday: day?.mintempC != null ? Math.round(Number(day.mintempC)) : null,
      maxToday: day?.maxtempC != null ? Math.round(Number(day.maxtempC)) : null,
      humidity: Math.round(Number(cc.humidity ?? 0)),
      windKmh: Math.round(Number(cc.windspeedKmph ?? 0)),
      precipitationMm: Number(cc.precipMM || 0),
    };
  } catch (err: any) {
    console.warn("[Clima wttr.in] Falló respaldo:", err?.message || err);
    return null;
  }
}

export async function fetchWeatherSnapshot(loc: GeoLocation | null, rawCity: string): Promise<WeatherSnapshot | null> {
  if (loc) {
    const openMeteo = await fetchFromOpenMeteo(loc);
    if (openMeteo) return openMeteo;

    const metNorway = await fetchFromMetNorway(loc);
    if (metNorway) return metNorway;
  }

  const wttrQuery = loc
    ? `${loc.name}${loc.country ? `, ${loc.country}` : ""}`
    : EXPLICIT_COUNTRY_REGEX.test(rawCity)
      ? rawCity
      : `${rawCity}, Argentina`;

  return await fetchFromWttr(wttrQuery);
}

function formatWeatherReport(locTitle: string, snapshot: WeatherSnapshot): string {
  let report = `🌤️ *CLIMA EN ${locTitle}*\n\n`;
  report += `• *Estado:* ${snapshot.conditionEmoji} ${snapshot.conditionText}\n`;
  report += `• *Temperatura:* ${snapshot.tempActual}°C (ST: ${snapshot.tempSensacion}°C)\n`;
  if (snapshot.minToday != null && snapshot.maxToday != null) {
    report += `• *Mín / Máx hoy:* ${snapshot.minToday}°C / ${snapshot.maxToday}°C\n`;
  }
  report += `• *Humedad:* ${snapshot.humidity}%\n`;
  report += `• *Viento:* ${snapshot.windKmh} km/h\n`;
  if (snapshot.precipitationMm > 0) {
    report += `• *Precipitación:* ${snapshot.precipitationMm} mm\n`;
  }
  return report.trim();
}

export const climaCommand: Command = {
  name: "clima",
  aliases: ["tiempo", "temperatura", "weather"],
  description: "Consulta el clima actual y pronóstico con respaldo multi-proveedor.",
  execute: async ({ sock, msg, remoteJid, cleanText }: CommandContext) => {
    const city = cleanText.trim() || "Buenos Aires";

    try {
      const { location, geocodingErrored } = await resolveCityLocation(city);

      if (!location && !geocodingErrored) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ No encontré datos para la localidad "*${city}*". Probá con el nombre exacto del pueblo o ciudad.` },
          { quoted: msg as any }
        );
        return;
      }

      const weatherCacheKey = location
        ? `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
        : `raw:${city.toLowerCase().trim()}`;

      const cached = weatherCache.get(weatherCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        await sock.sendMessage(remoteJid, { text: cached.report }, { quoted: msg as any });
        return;
      }

      const snapshot = await fetchWeatherSnapshot(location, city);
      if (!snapshot) {
        throw new Error("Sin respuesta de proveedores meteorológicos");
      }

      const locTitle = location
        ? `${location.name.toUpperCase()}${location.admin1 ? `, ${location.admin1}` : ""}${location.country ? ` (${location.country})` : ""}`
        : city.toUpperCase();

      const report = formatWeatherReport(locTitle, snapshot);
      setBoundedCache(weatherCache, weatherCacheKey, {
        report,
        expiresAt: Date.now() + WEATHER_CACHE_TTL_MS,
      });

      await sock.sendMessage(remoteJid, { text: report }, { quoted: msg as any });
    } catch (err) {
      console.error("[Clima Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al consultar el servicio meteorológico." },
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

