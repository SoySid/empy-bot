import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

const MIN_CANDIDATES = 2;
const SUSPECT_DISPLAY_MAX = 8;
const GAME_DURATION_MS = 45 * 1000;
const BASE_REWARD_MIN = 12000;
const BASE_REWARD_MAX = 20000;

const RAW_RECENT_TAKE = 250;
const RAW_RANDOM_TAKE = 150;
const EMB_RANDOM_TAKE = 200;
const MAX_PLAYED_QUOTES = 300;
const QUOTE_MIN_LENGTH = 22;
const QUOTE_MAX_LENGTH = 220;

const GuessSchema = z.string().trim().min(1).max(60);

const QuienHistorySchema = z.object({
  playedQuotes: z.array(z.string()).max(MAX_PLAYED_QUOTES),
  lastWinnerJid: z.string().optional(),
});

type QuienHistory = z.infer<typeof QuienHistorySchema>;

interface CleanMessageEntry {
  userJid: string;
  senderName: string;
  body: string;
}

interface UserMessageBucket {
  latestName: string;
  seenBodies: Set<string>;
  messages: string[];
}

export interface ActiveQuienGame {
  remoteJid: string;
  secretQuote: string;
  winnerJid: string;
  winnerName: string;
  candidates: Array<{ jid: string; name: string }>;
  acceptedNamesByJid: Map<string, Set<string>>;
  baseReward: number;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

export type QuienGuessResult =
  | { matched: false }
  | { matched: true; isCorrect: false; guessedName: string }
  | {
      matched: true;
      isCorrect: true;
      game: ActiveQuienGame;
      reward: number;
      newBalance?: number;
    };

const activeQuienGames = new Map<string, ActiveQuienGame>();
const historyCacheByGroup = new Map<string, QuienHistory>();

function getHistoryKey(remoteJid: string): string {
  return `state:quien_history:${remoteJid}`;
}

function toQuoteHistoryKey(quote: string): string {
  return quote.trim().toLowerCase().slice(0, 120);
}

async function loadQuienHistory(remoteJid: string): Promise<QuienHistory> {
  const cached = historyCacheByGroup.get(remoteJid);
  try {
    const row = await prisma.baileysSession.findUnique({
      where: { key: getHistoryKey(remoteJid) },
    });
    if (row?.value) {
      const parsed = QuienHistorySchema.safeParse(JSON.parse(row.value));
      if (parsed.success) {
        historyCacheByGroup.set(remoteJid, parsed.data);
        return parsed.data;
      }
    }
  } catch (err) {
    console.error("[QuienService] Error leyendo historial desde DB:", err);
    if (cached) return cached;
  }

  if (cached) return cached;
  const empty: QuienHistory = { playedQuotes: [] };
  historyCacheByGroup.set(remoteJid, empty);
  return empty;
}

async function saveQuienHistory(remoteJid: string, history: QuienHistory): Promise<void> {
  const normalized: QuienHistory = {
    playedQuotes: history.playedQuotes.slice(-MAX_PLAYED_QUOTES),
    ...(history.lastWinnerJid ? { lastWinnerJid: history.lastWinnerJid } : {}),
  };
  historyCacheByGroup.set(remoteJid, normalized);

  try {
    const key = getHistoryKey(remoteJid);
    const value = JSON.stringify(normalized);
    await prisma.baileysSession.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  } catch (err) {
    console.error("[QuienService] Error guardando historial en DB:", err);
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/@/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeQuoteBody(rawBody: string): string {
  return rawBody
    .replace(/\s*\[Respondiendo a @[^\]]*\]\s*$/i, "")
    .replace(/\s*\[Respondiendo a @[^\]]*\]\s*/gi, " ")
    .trim();
}

function isCleanGameMessage(body: string): boolean {
  if (body.length < QUOTE_MIN_LENGTH || body.length > QUOTE_MAX_LENGTH) return false;
  if (body.startsWith("!") || body.startsWith(".") || body.startsWith("/")) return false;
  if (/^(https?:\/\/\S+|www\.\S+)$/i.test(body)) return false;
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quoteMentionsAuthor(quote: string, acceptedNames: Set<string>): boolean {
  const normQuote = normalizeName(quote);
  if (!normQuote) return false;

  for (const name of acceptedNames) {
    if (name.length < 3) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    if (pattern.test(normQuote)) return true;
  }
  return false;
}

function collectCleanMessages(
  rows: CleanMessageEntry[],
  byUser: Map<string, UserMessageBucket>
): void {
  for (const row of rows) {
    if (!row.userJid || row.userJid.includes("bot@s.whatsapp.net")) continue;
    const cleaned = sanitizeQuoteBody(row.body || "");
    if (!isCleanGameMessage(cleaned)) continue;

    const dedupKey = cleaned.toLowerCase();
    let bucket = byUser.get(row.userJid);
    if (!bucket) {
      bucket = {
        latestName: row.senderName || row.userJid.split("@")[0],
        seenBodies: new Set<string>(),
        messages: [],
      };
      byUser.set(row.userJid, bucket);
    }

    if (bucket.seenBodies.has(dedupKey)) continue;
    bucket.seenBodies.add(dedupKey);
    bucket.messages.push(cleaned);
  }
}

function buildRandomOffsets(minSkip: number, maxSkip: number, count: number): number[] {
  if (maxSkip <= minSkip) return [minSkip];
  if (count === 1) {
    return [minSkip + Math.floor(Math.random() * (maxSkip - minSkip + 1))];
  }

  const mid = Math.floor((minSkip + maxSkip) / 2);
  const first = minSkip + Math.floor(Math.random() * (mid - minSkip + 1));
  const second =
    mid + 1 <= maxSkip
      ? mid + 1 + Math.floor(Math.random() * (maxSkip - mid))
      : maxSkip;
  return [first, second];
}

export function isQuienGameActive(remoteJid: string): boolean {
  return activeQuienGames.has(remoteJid);
}

export async function startQuienGame(
  remoteJid: string,
  onTimeout: (game: ActiveQuienGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveQuienGame }> {
  if (!remoteJid) {
    return { success: false, error: "Chat inválido para iniciar la partida." };
  }

  if (activeQuienGames.has(remoteJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida activa de *¿Quién lo dijo?* en este grupo. ¡Adivinen antes de iniciar otra!",
    };
  }

  try {
    const rawWhere = { chatJid: remoteJid, isBot: false };
    const embWhere = { chatJid: remoteJid };

    const [rawCount, embCount, history] = await Promise.all([
      prisma.rawMessage.count({ where: rawWhere }),
      prisma.messageEmbedding.count({ where: embWhere }),
      loadQuienHistory(remoteJid),
    ]);

    const rawQueries: Array<Promise<CleanMessageEntry[]>> = [];
    if (rawCount > 0) {
      rawQueries.push(
        prisma.rawMessage.findMany({
          where: rawWhere,
          orderBy: { createdAt: "desc" },
          take: RAW_RECENT_TAKE,
          select: { userJid: true, senderName: true, body: true },
        })
      );

      if (rawCount > RAW_RECENT_TAKE) {
        const minSkip = RAW_RECENT_TAKE;
        const maxSkip = Math.max(minSkip, rawCount - RAW_RANDOM_TAKE);
        const skips = buildRandomOffsets(minSkip, maxSkip, 2);
        for (const skip of skips) {
          rawQueries.push(
            prisma.rawMessage.findMany({
              where: rawWhere,
              orderBy: { createdAt: "desc" },
              skip,
              take: RAW_RANDOM_TAKE,
              select: { userJid: true, senderName: true, body: true },
            })
          );
        }
      }
    }

    let embQuery: Promise<CleanMessageEntry[]> = Promise.resolve([]);
    if (embCount > 0) {
      const maxEmbSkip = Math.max(0, embCount - EMB_RANDOM_TAKE);
      const embSkip = Math.floor(Math.random() * (maxEmbSkip + 1));
      embQuery = prisma.messageEmbedding.findMany({
        where: embWhere,
        orderBy: { createdAt: "desc" },
        skip: embSkip,
        take: EMB_RANDOM_TAKE,
        select: { userJid: true, senderName: true, body: true },
      });
    }

    const [rawWindows, embRows] = await Promise.all([Promise.all(rawQueries), embQuery]);

    const byUser = new Map<string, UserMessageBucket>();
    for (const windowRows of rawWindows) {
      collectCleanMessages(windowRows, byUser);
    }
    collectCleanMessages(embRows, byUser);

    const eligible = Array.from(byUser.entries()).filter(([, data]) => data.messages.length >= 1);
    if (eligible.length < MIN_CANDIDATES) {
      return {
        success: false,
        error:
          "Todavía no hay suficientes frases limpias en este grupo para jugar (se necesitan al menos 2 participantes con frases reales).",
      };
    }

    const candidateJids = eligible.map(([jid]) => jid);
    const profiles = await prisma.userProfile.findMany({
      where: { jid: { in: candidateJids } },
      select: {
        jid: true,
        primaryName: true,
        aliases: {
          select: {
            alias: true,
            normalized: true,
          },
        },
      },
    });

    const profileMap = new Map(profiles.map((p) => [p.jid, p]));
    const acceptedNamesByJid = new Map<string, Set<string>>();
    const candidateInfos: Array<{ jid: string; name: string; messages: string[] }> = [];

    for (const [jid, data] of eligible) {
      const profile = profileMap.get(jid);
      const displayName = (profile?.primaryName || data.latestName || jid.split("@")[0]).trim();
      const accepted = new Set<string>();

      const normDisplay = normalizeName(displayName);
      if (normDisplay) accepted.add(normDisplay);

      const normFallback = normalizeName(data.latestName);
      if (normFallback) accepted.add(normFallback);

      if (profile?.aliases) {
        for (const a of profile.aliases) {
          const n1 = normalizeName(a.normalized || "");
          const n2 = normalizeName(a.alias || "");
          if (n1) accepted.add(n1);
          if (n2) accepted.add(n2);
        }
      }

      acceptedNamesByJid.set(jid, accepted);
      candidateInfos.push({
        jid,
        name: displayName,
        messages: data.messages,
      });
    }

    interface QuotePoolItem {
      candidate: { jid: string; name: string; messages: string[] };
      quote: string;
    }

    const safeEntries: QuotePoolItem[] = [];
    const allEntries: QuotePoolItem[] = [];
    for (const candidate of candidateInfos) {
      const accepted = acceptedNamesByJid.get(candidate.jid) ?? new Set<string>();
      for (const quote of candidate.messages) {
        allEntries.push({ candidate, quote });
        if (!quoteMentionsAuthor(quote, accepted)) {
          safeEntries.push({ candidate, quote });
        }
      }
    }

    const baseQuotePool = safeEntries.length > 0 ? safeEntries : allEntries;
    let playedQuotes = [...history.playedQuotes];
    const playedSet = new Set(playedQuotes);

    let freshEntries = baseQuotePool.filter(
      (entry) => !playedSet.has(toQuoteHistoryKey(entry.quote))
    );

    if (freshEntries.length === 0) {
      playedQuotes = [];
      freshEntries = baseQuotePool;
    }

    const rotatedEntries = history.lastWinnerJid
      ? freshEntries.filter((entry) => entry.candidate.jid !== history.lastWinnerJid)
      : freshEntries;
    const selectionPool = rotatedEntries.length > 0 ? rotatedEntries : freshEntries;
    const chosen = selectionPool[Math.floor(Math.random() * selectionPool.length)];

    const chosenKey = toQuoteHistoryKey(chosen.quote);
    const updatedPlayed = playedQuotes.includes(chosenKey)
      ? playedQuotes
      : [...playedQuotes, chosenKey].slice(-MAX_PLAYED_QUOTES);

    await saveQuienHistory(remoteJid, {
      playedQuotes: updatedPlayed,
      lastWinnerJid: chosen.candidate.jid,
    });

    const otherCandidates = candidateInfos.filter((c) => c.jid !== chosen.candidate.jid);
    const sampledOthers = shuffleArray(otherCandidates).slice(0, SUSPECT_DISPLAY_MAX - 1);
    const displayedSuspects = shuffleArray([chosen.candidate, ...sampledOthers]);

    const baseReward =
      Math.floor(Math.random() * (BASE_REWARD_MAX - BASE_REWARD_MIN + 1)) + BASE_REWARD_MIN;

    const game: ActiveQuienGame = {
      remoteJid,
      secretQuote: chosen.quote,
      winnerJid: chosen.candidate.jid,
      winnerName: chosen.candidate.name,
      candidates: displayedSuspects.map((c) => ({ jid: c.jid, name: c.name })),
      acceptedNamesByJid,
      baseReward,
      startedAt: Date.now(),
      expiresAt: Date.now() + GAME_DURATION_MS,
      timer: setTimeout(() => {
        const current = activeQuienGames.get(remoteJid);
        if (current) {
          activeQuienGames.delete(remoteJid);
          onTimeout(current).catch(() => {});
        }
      }, GAME_DURATION_MS),
    };

    activeQuienGames.set(remoteJid, game);
    return { success: true, game };
  } catch (err) {
    console.error("[QuienService] Error iniciando partida:", err);
    return {
      success: false,
      error: "No se pudo iniciar la partida de *¿Quién lo dijo?* en este momento. Intentá de nuevo.",
    };
  }
}

export async function checkQuienGuess(
  remoteJid: string,
  guesserJid: string,
  rawGuess: string
): Promise<QuienGuessResult> {
  const game = activeQuienGames.get(remoteJid);
  if (!game) return { matched: false };

  const parsed = GuessSchema.safeParse(rawGuess);
  if (!parsed.success) return { matched: false };

  const normGuess = normalizeName(parsed.data);
  if (!normGuess) return { matched: false };

  let matchedCandidate: { jid: string; name: string } | null = null;
  for (const candidate of game.candidates) {
    const accepted = game.acceptedNamesByJid.get(candidate.jid);
    if (accepted && accepted.has(normGuess)) {
      matchedCandidate = candidate;
      break;
    }
  }

  if (!matchedCandidate) {
    return { matched: false };
  }

  if (matchedCandidate.jid !== game.winnerJid) {
    return {
      matched: true,
      isCorrect: false,
      guessedName: matchedCandidate.name,
    };
  }

  clearTimeout(game.timer);
  activeQuienGames.delete(remoteJid);

  const reward = game.baseReward;
  const balanceRes = await modifyBalance(guesserJid, reward);

  return {
    matched: true,
    isCorrect: true,
    game,
    reward,
    newBalance: balanceRes.newBalance,
  };
}
