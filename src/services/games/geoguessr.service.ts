import axios from "axios";
import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

export interface CountryData {
  code: string;
  name: string;
  aliases: string[];
  continent: string;
  capital: string;
  flagEmoji: string;
}

export const COUNTRIES_DATA: CountryData[] = [
  { code: "ar", name: "Argentina", aliases: ["argentina"], continent: "América del Sur", capital: "Buenos Aires", flagEmoji: "🇦🇷" },
  { code: "br", name: "Brasil", aliases: ["brasil", "brazil"], continent: "América del Sur", capital: "Brasilia", flagEmoji: "🇧🇷" },
  { code: "uy", name: "Uruguay", aliases: ["uruguay"], continent: "América del Sur", capital: "Montevideo", flagEmoji: "🇺🇾" },
  { code: "cl", name: "Chile", aliases: ["chile"], continent: "América del Sur", capital: "Santiago", flagEmoji: "🇨🇱" },
  { code: "py", name: "Paraguay", aliases: ["paraguay"], continent: "América del Sur", capital: "Asunción", flagEmoji: "🇵🇾" },
  { code: "bo", name: "Bolivia", aliases: ["bolivia"], continent: "América del Sur", capital: "Sucre", flagEmoji: "🇧🇴" },
  { code: "pe", name: "Perú", aliases: ["peru"], continent: "América del Sur", capital: "Lima", flagEmoji: "🇵🇪" },
  { code: "co", name: "Colombia", aliases: ["colombia"], continent: "América del Sur", capital: "Bogotá", flagEmoji: "🇨🇴" },
  { code: "ve", name: "Venezuela", aliases: ["venezuela"], continent: "América del Sur", capital: "Caracas", flagEmoji: "🇻🇪" },
  { code: "ec", name: "Ecuador", aliases: ["ecuador"], continent: "América del Sur", capital: "Quito", flagEmoji: "🇪🇨" },
  { code: "mx", name: "México", aliases: ["mexico"], continent: "América del Norte", capital: "Ciudad de México", flagEmoji: "🇲🇽" },
  { code: "us", name: "Estados Unidos", aliases: ["estados unidos", "usa", "eeuu", "ee uu"], continent: "América del Norte", capital: "Washington D.C.", flagEmoji: "🇺🇸" },
  { code: "ca", name: "Canadá", aliases: ["canada"], continent: "América del Norte", capital: "Ottawa", flagEmoji: "🇨🇦" },
  { code: "es", name: "España", aliases: ["espana", "spain"], continent: "Europa", capital: "Madrid", flagEmoji: "🇪🇸" },
  { code: "fr", name: "Francia", aliases: ["francia", "france"], continent: "Europa", capital: "París", flagEmoji: "🇫🇷" },
  { code: "it", name: "Italia", aliases: ["italia", "italy"], continent: "Europa", capital: "Roma", flagEmoji: "🇮🇹" },
  { code: "de", name: "Alemania", aliases: ["alemania", "germany"], continent: "Europa", capital: "Berlín", flagEmoji: "🇩🇪" },
  { code: "gb", name: "Reino Unido", aliases: ["reino unido", "inglaterra", "uk"], continent: "Europa", capital: "Londres", flagEmoji: "🇬🇧" },
  { code: "pt", name: "Portugal", aliases: ["portugal"], continent: "Europa", capital: "Lisboa", flagEmoji: "🇵🇹" },
  { code: "nl", name: "Países Bajos", aliases: ["paises bajos", "holanda"], continent: "Europa", capital: "Ámsterdam", flagEmoji: "🇳🇱" },
  { code: "be", name: "Bélgica", aliases: ["belgica", "belgium"], continent: "Europa", capital: "Bruselas", flagEmoji: "🇧🇪" },
  { code: "ch", name: "Suiza", aliases: ["suiza", "switzerland"], continent: "Europa", capital: "Berna", flagEmoji: "🇨🇭" },
  { code: "at", name: "Austria", aliases: ["austria"], continent: "Europa", capital: "Viena", flagEmoji: "🇦🇹" },
  { code: "se", name: "Suecia", aliases: ["suecia", "sweden"], continent: "Europa", capital: "Estocolmo", flagEmoji: "🇸🇪" },
  { code: "no", name: "Noruega", aliases: ["noruega", "norway"], continent: "Europa", capital: "Oslo", flagEmoji: "🇳🇴" },
  { code: "gr", name: "Grecia", aliases: ["grecia", "greece"], continent: "Europa", capital: "Atenas", flagEmoji: "🇬🇷" },
  { code: "jp", name: "Japón", aliases: ["japon", "japan"], continent: "Asia", capital: "Tokio", flagEmoji: "🇯🇵" },
  { code: "cn", name: "China", aliases: ["china"], continent: "Asia", capital: "Pekín", flagEmoji: "🇨🇳" },
  { code: "kr", name: "Corea del Sur", aliases: ["corea del sur", "corea", "korea"], continent: "Asia", capital: "Seúl", flagEmoji: "🇰🇷" },
  { code: "in", name: "India", aliases: ["india"], continent: "Asia", capital: "Nueva Delhi", flagEmoji: "🇮🇳" },
  { code: "ru", name: "Rusia", aliases: ["rusia", "russia"], continent: "Europa / Asia", capital: "Moscú", flagEmoji: "🇷🇺" },
  { code: "au", name: "Australia", aliases: ["australia"], continent: "Oceanía", capital: "Canberra", flagEmoji: "🇦🇺" },
  { code: "eg", name: "Egipto", aliases: ["egipto", "egypt"], continent: "África", capital: "El Cairo", flagEmoji: "🇪🇬" },
  { code: "za", name: "Sudáfrica", aliases: ["sudafrica", "south africa"], continent: "África", capital: "Pretoria", flagEmoji: "🇿🇦" },
  { code: "jm", name: "Jamaica", aliases: ["jamaica"], continent: "América Central", capital: "Kingston", flagEmoji: "🇯🇲" },
  { code: "cu", name: "Cuba", aliases: ["cuba"], continent: "América Central", capital: "La Habana", flagEmoji: "🇨🇺" },
  { code: "cr", name: "Costa Rica", aliases: ["costa rica"], continent: "América Central", capital: "San José", flagEmoji: "🇨🇷" },
  { code: "pa", name: "Panamá", aliases: ["panama"], continent: "América Central", capital: "Ciudad de Panamá", flagEmoji: "🇵🇦" },
  { code: "ma", name: "Marruecos", aliases: ["marruecos", "morocco"], continent: "África", capital: "Rabat", flagEmoji: "🇲🇦" },
  { code: "tr", name: "Turquía", aliases: ["turquia", "turkey"], continent: "Asia / Europa", capital: "Ankara", flagEmoji: "🇹🇷" },
  { code: "ie", name: "Irlanda", aliases: ["irlanda", "ireland"], continent: "Europa", capital: "Dublín", flagEmoji: "🇮🇪" },
  { code: "pl", name: "Polonia", aliases: ["polonia", "poland"], continent: "Europa", capital: "Varsovia", flagEmoji: "🇵🇱" },
  { code: "ua", name: "Ucrania", aliases: ["ucrania", "ukraine"], continent: "Europa", capital: "Kiev", flagEmoji: "🇺🇦" },
  { code: "sa", name: "Arabia Saudita", aliases: ["arabia saudita", "arabia"], continent: "Asia", capital: "Riad", flagEmoji: "🇸🇦" },
  { code: "nz", name: "Nueva Zelanda", aliases: ["nueva zelanda", "new zealand"], continent: "Oceanía", capital: "Wellington", flagEmoji: "🇳🇿" },
];

export interface ActiveCountryGame {
  remoteJid: string;
  country: CountryData;
  flagBuffer?: Buffer;
  flagUrl: string;
  reward: number;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeCountryGames = new Map<string, ActiveCountryGame>();

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isCountryGameActive(remoteJid: string): boolean {
  return activeCountryGames.has(remoteJid);
}

export async function startCountryGame(
  remoteJid: string,
  onTimeout: (game: ActiveCountryGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveCountryGame }> {
  if (activeCountryGames.has(remoteJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida activa de *Adiviná la Bandera* en el grupo. ¡Adivinen antes de pedir otra!",
    };
  }

  try {
    const country = COUNTRIES_DATA[Math.floor(Math.random() * COUNTRIES_DATA.length)];
    const flagUrl = `https://flagcdn.com/w320/${country.code}.png`;

    let flagBuffer: Buffer | undefined;
    try {
      const res = await axios.get(flagUrl, { responseType: "arraybuffer", timeout: 7000 });
      flagBuffer = Buffer.from(res.data);
    } catch (e) {
      console.warn("[GeoGuessr] Error descargando imagen de bandera:", e);
    }

    const reward = Math.floor(Math.random() * 10001) + 10000; // $10.000 a $20.000 fichas

    const game: ActiveCountryGame = {
      remoteJid,
      country,
      flagBuffer,
      flagUrl,
      reward,
      startedAt: Date.now(),
      expiresAt: Date.now() + 45 * 1000,
      timer: setTimeout(() => {
        const current = activeCountryGames.get(remoteJid);
        if (current) {
          activeCountryGames.delete(remoteJid);
          onTimeout(current).catch(() => {});
        }
      }, 45 * 1000),
    };

    activeCountryGames.set(remoteJid, game);

    return { success: true, game };
  } catch (err: any) {
    return { success: false, error: "No se pudo iniciar el juego de banderas. Reintentá en un momento." };
  }
}

export async function checkCountryGuess(
  remoteJid: string,
  userJid: string,
  guessText: string
): Promise<{
  matched: boolean;
  game?: ActiveCountryGame;
  reward?: number;
  newBalance?: number;
}> {
  const game = activeCountryGames.get(remoteJid);
  if (!game) return { matched: false };

  const cleanGuess = normalizeText(guessText);
  if (!cleanGuess || cleanGuess.length < 3) return { matched: false };

  const isMatch =
    cleanGuess === normalizeText(game.country.name) ||
    game.country.aliases.some((a) => normalizeText(a) === cleanGuess);

  if (isMatch) {
    clearTimeout(game.timer);
    activeCountryGames.delete(remoteJid);

    const balanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = balanceRes.newBalance;

    return {
      matched: true,
      game,
      reward: game.reward,
      newBalance,
    };
  }

  return { matched: false };
}
