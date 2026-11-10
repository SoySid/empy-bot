import fs from "fs";
import path from "path";
import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";

export const TUTTI_FRUTTI_CATEGORIES = [
  "Nombre",
  "País o Ciudad",
  "Animal",
  "Comida o Fruta",
  "Cosa u Objeto",
  "Color o Prenda",
  "Profesión u Oficio",
] as const;

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "L", "M", "P", "R", "S", "T", "V"];

export interface PlayerSubmission {
  userJid: string;
  userName: string;
  words: string[]; // Exactamente 7 palabras
  submittedAt: number;
}

export interface PlayerScoreBreakdown {
  userJid: string;
  userName: string;
  words: string[];
  categoryPoints: number[]; // 7 puntajes
  totalPoints: number;
  submittedAt: number;
}

export interface TuttiFruttiRoundResult {
  valid: boolean;
  game: {
    letter: string;
    categories: readonly string[];
    reward: number;
  };
  reason?: "insufficient_players" | "no_submissions";
  winner?: PlayerScoreBreakdown;
  standings?: PlayerScoreBreakdown[];
  reward?: number;
  newBalance?: number;
}

export interface ActiveTuttiFruttiGame {
  chatJid: string;
  letter: string;
  categories: readonly string[];
  reward: number;
  startedAt: number;
  timer: NodeJS.Timeout;
  stopTriggered: boolean;
  stopTriggeredBy?: { jid: string; name: string };
  submissions: Map<string, PlayerSubmission>;
  onEnd: (result: TuttiFruttiRoundResult) => Promise<void>;
}

const activeGames = new Map<string, ActiveTuttiFruttiGame>();

// Persistencia del Ranking de Tutti Frutti
const DATA_DIR = path.resolve(process.cwd(), "data");
const RANKING_FILE = path.join(DATA_DIR, "tuttifrutti-ranking.json");

export interface TuttiFruttiRankingEntry {
  jid: string;
  name: string;
  wins: number;
  totalPoints: number;
  gamesPlayed: number;
}

function loadRanking(): Record<string, TuttiFruttiRankingEntry> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(RANKING_FILE)) {
      const content = fs.readFileSync(RANKING_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("[TuttiFrutti Ranking] Error al cargar ranking:", err);
  }
  return {};
}

function saveRanking(ranking: Record<string, TuttiFruttiRankingEntry>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(RANKING_FILE, JSON.stringify(ranking, null, 2), "utf-8");
  } catch (err) {
    console.error("[TuttiFrutti Ranking] Error al guardar ranking:", err);
  }
}

export function getTuttiFruttiRanking(limit: number = 10): TuttiFruttiRankingEntry[] {
  const ranking = loadRanking();
  return Object.values(ranking)
    .sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints)
    .slice(0, limit);
}

function recordGameStats(winnerJid: string, winnerName: string, standings: PlayerScoreBreakdown[]): void {
  const ranking = loadRanking();
  for (const player of standings) {
    const isWinner = player.userJid === winnerJid;
    const existing = ranking[player.userJid] || {
      jid: player.userJid,
      name: player.userName,
      wins: 0,
      totalPoints: 0,
      gamesPlayed: 0,
    };
    existing.name = player.userName || existing.name;
    existing.gamesPlayed += 1;
    existing.totalPoints += player.totalPoints;
    if (isWinner) {
      existing.wins += 1;
    }
    ranking[player.userJid] = existing;
  }
  saveRanking(ranking);
}

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

/**
 * Inicia una partida de Tutti Frutti con 7 categorías.
 */
export async function startTuttiFruttiGame(
  chatJid: string,
  onEnd: (result: TuttiFruttiRoundResult) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveTuttiFruttiGame }> {
  if (activeGames.has(chatJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida de Tutti Frutti en curso en este grupo. ¡Envíen sus 7 palabras para puntuar!",
    };
  }

  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const categories = TUTTI_FRUTTI_CATEGORIES;
  const reward = 35000; // $35.000 fichas de premio

  // Timer principal: 60 segundos si nadie canta ¡BASTA!
  const timer = setTimeout(async () => {
    await endTuttiFruttiRound(chatJid);
  }, 60000);

  const game: ActiveTuttiFruttiGame = {
    chatJid,
    letter,
    categories,
    reward,
    startedAt: Date.now(),
    timer,
    stopTriggered: false,
    submissions: new Map(),
    onEnd,
  };

  activeGames.set(chatJid, game);
  return { success: true, game };
}

/**
 * Finaliza la ronda de Tutti Frutti y ejecuta el escrutinio de puntos.
 */
async function endTuttiFruttiRound(chatJid: string): Promise<void> {
  const game = activeGames.get(chatJid);
  if (!game) return;

  clearTimeout(game.timer);
  activeGames.delete(chatJid);

  const totalPlayers = game.submissions.size;

  // 1. Si no participó nadie o solo 1 persona, la partida se anula (mínimo 2 jugadores)
  if (totalPlayers < 2) {
    const reason = totalPlayers === 0 ? "no_submissions" : "insufficient_players";
    await game.onEnd({
      valid: false,
      reason,
      game: {
        letter: game.letter,
        categories: game.categories,
        reward: game.reward,
      },
    });
    return;
  }

  // 2. Escrutinio oficial de puntos (7 categorías)
  const submissionsList = Array.from(game.submissions.values());
  const standings: PlayerScoreBreakdown[] = [];

  for (const sub of submissionsList) {
    const categoryPoints: number[] = [0, 0, 0, 0, 0, 0, 0];
    const seenWordsInPlayer = new Set<string>();

    for (let catIdx = 0; catIdx < 7; catIdx++) {
      const rawWord = sub.words[catIdx];
      const normWord = normalizeWord(rawWord);

      // Verificación de validez individual
      const targetLetterNorm = normalizeWord(game.letter);
      if (normWord.length < 3 || !normWord.startsWith(targetLetterNorm)) {
        categoryPoints[catIdx] = 0;
        continue;
      }

      // Regla Anti-Repetición interna (ej: "bruno, bruno, bruno")
      if (seenWordsInPlayer.has(normWord)) {
        categoryPoints[catIdx] = 0; // Palabra repetida dentro de la propia lista suma 0
        continue;
      }
      seenWordsInPlayer.add(normWord);

      // Comparación con las palabras de los demás jugadores en la misma categoría
      let occurrences = 0;
      for (const otherSub of submissionsList) {
        if (otherSub.words[catIdx] && normalizeWord(otherSub.words[catIdx]) === normWord) {
          occurrences++;
        }
      }

      // Si nadie más la puso: 10 pts. Si fue repetida: 5 pts.
      if (occurrences === 1) {
        categoryPoints[catIdx] = 10;
      } else {
        categoryPoints[catIdx] = 5;
      }
    }

    const totalPoints = categoryPoints.reduce((acc, p) => acc + p, 0);
    standings.push({
      userJid: sub.userJid,
      userName: sub.userName,
      words: sub.words,
      categoryPoints,
      totalPoints,
      submittedAt: sub.submittedAt,
    });
  }

  // 3. Ordenamiento: Más puntos gana; en empate, gana quien envió primero
  standings.sort((a, b) => b.totalPoints - a.totalPoints || a.submittedAt - b.submittedAt);

  const winner = standings[0];
  let updatedBalance = 0;

  try {
    const user = await resolveOrRegisterUser(winner.userJid);
    await withWriteLock(async () => {
      const updated = await prisma.userProfile.update({
        where: { id: user.id },
        data: { balance: { increment: game.reward } },
      });
      updatedBalance = updated.balance;
    });
  } catch (err) {
    console.error("[TuttiFrutti Payout Error]:", err);
  }

  // Registrar estadísticas históricas
  recordGameStats(winner.userJid, winner.userName, standings);

  await game.onEnd({
    valid: true,
    game: {
      letter: game.letter,
      categories: game.categories,
      reward: game.reward,
    },
    winner,
    standings,
    reward: game.reward,
    newBalance: updatedBalance,
  });
}

/**
 * Valida y registra el envío de un jugador durante una partida activa.
 */
export async function checkTuttiFruttiSubmission(
  chatJid: string,
  userJid: string,
  userName: string,
  text: string
): Promise<{
  matched: boolean;
  isFirstStop?: boolean;
  game?: ActiveTuttiFruttiGame;
  words?: string[];
  alreadySubmitted?: boolean;
}> {
  const game = activeGames.get(chatJid);
  if (!game) return { matched: false };

  // Parsear 7 palabras separadas por comas, puntos y comas, barras, guiones o saltos de línea
  const rawParts = text
    .split(/[,;\n\-\/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let words = rawParts;
  if (words.length !== 7) {
    const spaceWords = text.trim().split(/\s+/);
    if (spaceWords.length === 7) {
      words = spaceWords;
    } else {
      return { matched: false };
    }
  }

  const targetLetterNorm = normalizeWord(game.letter);

  // Cada palabra debe iniciar con la letra y tener al menos 3 caracteres
  for (const w of words) {
    const norm = normalizeWord(w);
    if (norm.length < 3 || !norm.startsWith(targetLetterNorm)) {
      return { matched: false };
    }
  }

  const isFirstSubmissionForUser = !game.submissions.has(userJid);

  // Registrar entrega del jugador
  game.submissions.set(userJid, {
    userJid,
    userName,
    words,
    submittedAt: Date.now(),
  });

  // Si es la primera persona que completa las 7 palabras válidas, canta ¡BASTA!
  if (!game.stopTriggered) {
    game.stopTriggered = true;
    game.stopTriggeredBy = { jid: userJid, name: userName };

    // Cancelar timer principal e iniciar prórroga de 60 segundos (1 minuto) para el resto
    clearTimeout(game.timer);
    game.timer = setTimeout(async () => {
      await endTuttiFruttiRound(chatJid);
    }, 60000);

    return {
      matched: true,
      isFirstStop: true,
      game,
      words,
    };
  }

  return {
    matched: true,
    isFirstStop: false,
    game,
    words,
    alreadySubmitted: !isFirstSubmissionForUser,
  };
}
