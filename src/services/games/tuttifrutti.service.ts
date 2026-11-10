import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";

export interface ActiveTuttiFruttiGame {
  chatJid: string;
  letter: string;
  categories: [string, string, string];
  reward: number;
  startedAt: number;
  timer: NodeJS.Timeout;
}

const activeGames = new Map<string, ActiveTuttiFruttiGame>();

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "L", "M", "P", "R", "S", "T", "V"];

const CATEGORY_POOLS: [string, string, string][] = [
  ["País o Ciudad", "Comida o Fruta", "Animal"],
  ["Nombre", "Cosa u Objeto", "Color o Prenda"],
  ["País o Provincia", "Profesión o Laburo", "Comida"],
  ["Famoso o Personaje", "Animal", "Marca o Producto"],
  ["Película o Serie", "Bebida o Trago", "Lugar"],
  ["Comida", "Animal", "Nombre"],
  ["País o Ciudad", "Instrumento o Cosa", "Animal"],
];

function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isTuttiFruttiGameActive(chatJid: string): boolean {
  return activeGames.has(chatJid);
}

export function getActiveTuttiFrutti(chatJid: string): ActiveTuttiFruttiGame | undefined {
  return activeGames.get(chatJid);
}

export async function startTuttiFruttiGame(
  chatJid: string,
  onTimeout: (game: ActiveTuttiFruttiGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveTuttiFruttiGame }> {
  if (activeGames.has(chatJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida de Tutti Frutti en curso en este grupo. ¡Respondan con las 3 palabras para ganar!",
    };
  }

  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const categories = CATEGORY_POOLS[Math.floor(Math.random() * CATEGORY_POOLS.length)];
  const reward = 30000; // $30.000 fichas

  const timer = setTimeout(async () => {
    const g = activeGames.get(chatJid);
    if (g) {
      activeGames.delete(chatJid);
      await onTimeout(g);
    }
  }, 60000); // 60 segundos

  const game: ActiveTuttiFruttiGame = {
    chatJid,
    letter,
    categories,
    reward,
    startedAt: Date.now(),
    timer,
  };

  activeGames.set(chatJid, game);
  return { success: true, game };
}

export async function checkTuttiFruttiSubmission(
  chatJid: string,
  userJid: string,
  text: string
): Promise<{
  matched: boolean;
  game?: ActiveTuttiFruttiGame;
  words?: string[];
  reward?: number;
  newBalance?: number;
}> {
  const game = activeGames.get(chatJid);
  if (!game) return { matched: false };

  // Separar por comas, guiones, barras o saltos de línea
  const rawParts = text
    .split(/[,;\n\-\/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Si no separaron por símbolos, probar separando por espacios si son exactamente 3 palabras
  let words = rawParts;
  if (words.length !== 3) {
    const spaceWords = text.trim().split(/\s+/);
    if (spaceWords.length === 3) {
      words = spaceWords;
    } else {
      return { matched: false };
    }
  }

  const targetLetterNorm = normalizeWord(game.letter);

  // Verificar que cada palabra empiece con la letra asignada y tenga al menos 3 caracteres
  for (const w of words) {
    const norm = normalizeWord(w);
    if (norm.length < 3 || !norm.startsWith(targetLetterNorm)) {
      return { matched: false };
    }
  }

  // ¡Ganador válido! Cancelar timer y limpiar estado
  clearTimeout(game.timer);
  activeGames.delete(chatJid);

  const user = await resolveOrRegisterUser(userJid);
  let updatedBalance = user.balance + game.reward;

  try {
    await withWriteLock(async () => {
      const updated = await prisma.userProfile.update({
        where: { id: user.id },
        data: { balance: { increment: game.reward } },
      });
      updatedBalance = updated.balance;
    });
  } catch (err) {
    console.error("[TuttiFrutti Reward Error]:", err);
  }

  return {
    matched: true,
    game,
    words,
    reward: game.reward,
    newBalance: updatedBalance,
  };
}
