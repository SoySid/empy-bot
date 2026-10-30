import axios from "axios";
import sharp from "sharp";
import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";
import { MLBB_HEROES, MlbbHeroDefinition } from "../../config/mlbb.config.js";

export interface ActiveMlbbGame {
  remoteJid: string;
  hero: MlbbHeroDefinition;
  cleanName: string;
  reward: number;
  pixelatedBuffer: Buffer;
  colorBuffer: Buffer;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeMlbbGames = new Map<string, ActiveMlbbGame>();
const MLBB_FACT_KEY = "mlbb_heroes_v1";

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isMlbbGameActive(remoteJid: string): boolean {
  return activeMlbbGames.has(remoteJid);
}

export async function startMlbbGame(
  remoteJid: string,
  onTimeout: (game: ActiveMlbbGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveMlbbGame }> {
  if (activeMlbbGames.has(remoteJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida activa de *Mobile Legends* en el grupo. ¡Adivinen antes de pedir otro!",
    };
  }

  const hero = MLBB_HEROES[Math.floor(Math.random() * MLBB_HEROES.length)];
  const cleanName = normalizeString(hero.name);

  try {
    const res = await axios.get(hero.iconUrl, { responseType: "arraybuffer", timeout: 8000 });
    const colorBuffer = Buffer.from(res.data);

    // Pixelado misterioso con sharp
    const pixelatedBuffer = await sharp(colorBuffer)
      .resize(14, 14, { kernel: "nearest" })
      .resize(256, 256, { kernel: "nearest" })
      .png()
      .toBuffer();

    const reward = Math.floor(Math.random() * 10001) + 10000; // $10.000 a $20.000 fichas

    const game: ActiveMlbbGame = {
      remoteJid,
      hero,
      cleanName,
      reward,
      pixelatedBuffer,
      colorBuffer,
      startedAt: Date.now(),
      expiresAt: Date.now() + 60 * 1000,
      timer: setTimeout(() => {
        const cur = activeMlbbGames.get(remoteJid);
        if (cur) {
          activeMlbbGames.delete(remoteJid);
          onTimeout(cur).catch(() => {});
        }
      }, 60 * 1000),
    };

    activeMlbbGames.set(remoteJid, game);

    return { success: true, game };
  } catch (err: any) {
    console.error("[MLBB Service Error]:", err?.message || err);
    return {
      success: false,
      error: "Error al descargar el héroe de Mobile Legends. Por favor intentá de nuevo en unos segundos.",
    };
  }
}

export async function checkMlbbGuess(
  remoteJid: string,
  userJid: string,
  guessText: string
): Promise<{
  matched: boolean;
  game?: ActiveMlbbGame;
  reward?: number;
  newBalance?: number;
  isNewCapture?: boolean;
  totalCaptured?: number;
}> {
  const game = activeMlbbGames.get(remoteJid);
  if (!game) return { matched: false };

  const cleanGuess = normalizeString(guessText);
  if (!cleanGuess || cleanGuess.length < 3) return { matched: false };

  const isMatch =
    cleanGuess === game.cleanName ||
    game.hero.aliases.some((a) => normalizeString(a) === cleanGuess);

  if (isMatch) {
    clearTimeout(game.timer);
    activeMlbbGames.delete(remoteJid);

    const balanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = balanceRes.newBalance;

    let isNewCapture = false;
    let totalCaptured = 0;
    try {
      const fact = await prisma.userFact.findUnique({
        where: { userJid_clave: { userJid, clave: MLBB_FACT_KEY } },
      });
      let heroList: string[] = fact?.valor ? JSON.parse(fact.valor) : [];
      if (!heroList.includes(game.hero.name)) {
        heroList.push(game.hero.name);
        isNewCapture = true;
      }
      totalCaptured = heroList.length;

      await prisma.userFact.upsert({
        where: { userJid_clave: { userJid, clave: MLBB_FACT_KEY } },
        create: {
          userJid,
          clave: MLBB_FACT_KEY,
          valor: JSON.stringify(heroList),
          tipo: "PERMANENTE",
        },
        update: { valor: JSON.stringify(heroList) },
      });
    } catch (err) {
      console.error("[MLBB Collection Error]:", err);
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

export async function getUserMlbbHeroes(userJid: string): Promise<{ total: number; list: string[] }> {
  try {
    const fact = await prisma.userFact.findUnique({
      where: { userJid_clave: { userJid, clave: MLBB_FACT_KEY } },
    });
    if (fact?.valor) {
      const list: string[] = JSON.parse(fact.valor);
      return { total: list.length, list };
    }
  } catch (err) {
    console.error("[getUserMlbbHeroes Error]:", err);
  }
  return { total: 0, list: [] };
}
