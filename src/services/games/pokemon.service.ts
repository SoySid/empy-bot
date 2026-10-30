import axios from "axios";
import sharp from "sharp";
import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";
import { modifyBalance } from "../economy.service.js";

export interface ActivePokemonGame {
  remoteJid: string;
  pokemonId: number;
  name: string;
  cleanName: string;
  types: string[];
  generation: string;
  reward: number;
  silhouetteBuffer: Buffer;
  colorBuffer: Buffer;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activePokemonGames = new Map<string, ActivePokemonGame>();
const POKEDEX_FACT_KEY = "pokedex_v1";

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getGenerationLabel(id: number): string {
  if (id <= 151) return "Gen 1 (Kanto)";
  if (id <= 251) return "Gen 2 (Johto)";
  if (id <= 386) return "Gen 3 (Hoenn)";
  return "Gen 4 (Sinnoh)";
}

export function isPokemonGameActive(remoteJid: string): boolean {
  return activePokemonGames.has(remoteJid);
}

export async function startPokemonGame(
  remoteJid: string,
  onTimeout: (game: ActivePokemonGame) => Promise<void>,
  allGens: boolean = false
): Promise<{ success: boolean; error?: string; game?: ActivePokemonGame }> {
  if (activePokemonGames.has(remoteJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida activa de *¿Quién es este Pokémon?* en el grupo. ¡Adivinen antes de pedir otro!",
    };
  }

  try {
    // Generación 1 por defecto (IDs 1 a 151 de Kanto) o hasta Gen 4 si se solicita
    const maxId = allGens ? 493 : 151;
    const randomId = Math.floor(Math.random() * maxId) + 1;
    const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${randomId}`, { timeout: 8000 });
    const data = res.data;

    const rawName: string = data.name;
    const cleanName = normalizeString(rawName);
    const types: string[] = data.types.map((t: any) => t.type.name);
    const imageUrl =
      data.sprites?.other?.["official-artwork"]?.front_default ||
      data.sprites?.front_default;

    if (!imageUrl) {
      return { success: false, error: "No se pudo obtener la imagen del Pokémon." };
    }

    // Descargar imagen a color
    const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
    const colorBuffer = Buffer.from(imgRes.data);

    // Generar silueta con sharp
    const meta = await sharp(colorBuffer).metadata();
    const width = meta.width || 475;
    const height = meta.height || 475;
    const blackSvg = Buffer.from(
      `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0a0a0a"/></svg>`
    );

    const silhouetteBuffer = await sharp(colorBuffer)
      .composite([{ input: blackSvg, blend: "in" }])
      .png()
      .toBuffer();

    // Recompensa entre $10.000 y $20.000 fichas
    const reward = Math.floor(Math.random() * 10001) + 10000;
    const generation = getGenerationLabel(randomId);

    const game: ActivePokemonGame = {
      remoteJid,
      pokemonId: randomId,
      name: rawName.toUpperCase(),
      cleanName,
      types,
      generation,
      reward,
      silhouetteBuffer,
      colorBuffer,
      startedAt: Date.now(),
      expiresAt: Date.now() + 60 * 1000,
      timer: setTimeout(() => {
        const current = activePokemonGames.get(remoteJid);
        if (current) {
          activePokemonGames.delete(remoteJid);
          onTimeout(current).catch(() => {});
        }
      }, 60 * 1000),
    };

    activePokemonGames.set(remoteJid, game);

    return {
      success: true,
      game,
    };
  } catch (err: any) {
    console.error("[Pokemon Service Error]:", err?.message || err);
    return {
      success: false,
      error: "Error al conectar con la Pokédex. Por favor intentá de nuevo en unos segundos.",
    };
  }
}

export async function checkPokemonGuess(
  remoteJid: string,
  userJid: string,
  guessText: string
): Promise<{
  matched: boolean;
  game?: ActivePokemonGame;
  reward?: number;
  newBalance?: number;
  isNewCapture?: boolean;
  totalCaptured?: number;
}> {
  const game = activePokemonGames.get(remoteJid);
  if (!game) return { matched: false };

  const cleanGuess = normalizeString(guessText);
  if (!cleanGuess || cleanGuess.length < 3) return { matched: false };

  // Comprobar coincidencia exacta o normalizada
  if (cleanGuess === game.cleanName) {
    clearTimeout(game.timer);
    activePokemonGames.delete(remoteJid);

    // Acreditar fichas
    const balanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = balanceRes.newBalance;

    // Registrar en la Pokédex del usuario
    let isNewCapture = false;
    let totalCaptured = 0;
    try {
      const fact = await prisma.userFact.findUnique({
        where: { userJid_clave: { userJid, clave: POKEDEX_FACT_KEY } },
      });
      let pokedexList: string[] = fact?.valor ? JSON.parse(fact.valor) : [];
      if (!pokedexList.includes(game.name)) {
        pokedexList.push(game.name);
        isNewCapture = true;
      }
      totalCaptured = pokedexList.length;

      await prisma.userFact.upsert({
        where: { userJid_clave: { userJid, clave: POKEDEX_FACT_KEY } },
        create: {
          userJid,
          clave: POKEDEX_FACT_KEY,
          valor: JSON.stringify(pokedexList),
          tipo: "PERMANENTE",
        },
        update: { valor: JSON.stringify(pokedexList) },
      });
    } catch (err) {
      console.error("[Pokedex Save Error]:", err);
    }

    return {
      matched: true,
      game,
      reward: game.reward,
      newBalance,
      isNewCapture,
      totalCaptured,
    };
  }

  return { matched: false };
}

export async function getUserPokedex(userJid: string): Promise<{ total: number; list: string[] }> {
  try {
    const fact = await prisma.userFact.findUnique({
      where: { userJid_clave: { userJid, clave: POKEDEX_FACT_KEY } },
    });
    if (fact?.valor) {
      const list: string[] = JSON.parse(fact.valor);
      return { total: list.length, list };
    }
  } catch (err) {
    console.error("[getUserPokedex Error]:", err);
  }
  return { total: 0, list: [] };
}
