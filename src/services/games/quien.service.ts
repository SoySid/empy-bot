import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";
import { FEATURE_DIMENSION, vectorizeText } from "../neural/vectorizer.js";
import { NeuralMLP, TrainingSample } from "../neural/mlp.js";

const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 6;
const MIN_MESSAGES_PER_CANDIDATE = 6;
const MAX_TRAIN_MESSAGES_PER_CANDIDATE = 35;
const GAME_DURATION_MS = 45 * 1000;
const BASE_REWARD_MIN = 12000;
const BASE_REWARD_MAX = 20000;
const NEURAL_BEAT_BONUS = 5000;

const GuessSchema = z.string().trim().min(1).max(60);

interface CleanMessageEntry {
  userJid: string;
  senderName: string;
  body: string;
}

export interface QuienCandidate {
  jid: string;
  name: string;
  acceptedNames: string[];
  messageCount: number;
}

export interface NeuralRankEntry {
  jid: string;
  name: string;
  prob: number;
  percent: number;
}

export interface ActiveQuienGame {
  remoteJid: string;
  secretQuote: string;
  winnerJid: string;
  winnerName: string;
  candidates: Array<{ jid: string; name: string }>;
  acceptedNamesByJid: Map<string, Set<string>>;
  neuralRanking: NeuralRankEntry[];
  neuralTopJid: string;
  neuralTopName: string;
  trainAccuracy: number;
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
      neuralBeatBonus: number;
      newBalance?: number;
    };

const activeQuienGames = new Map<string, ActiveQuienGame>();

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

function isCleanGameMessage(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < 18 || trimmed.length > 280) return false;
  if (trimmed.startsWith("!")) return false;
  if (/^(https?:\/\/\S+|www\.\S+)$/i.test(trimmed)) return false;
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
  rows: Array<{ userJid: string; senderName: string; body: string }>,
  byUser: Map<string, { latestName: string; seenBodies: Set<string>; messages: string[] }>
): void {
  for (const row of rows) {
    if (!row.userJid || row.userJid.includes("bot@s.whatsapp.net")) continue;
    const trimmed = (row.body || "").trim();
    if (!isCleanGameMessage(trimmed)) continue;

    const dedupKey = trimmed.toLowerCase();
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
    bucket.messages.push(trimmed);
  }
}

function countEligibleCandidates(
  byUser: Map<string, { latestName: string; seenBodies: Set<string>; messages: string[] }>
): number {
  let count = 0;
  for (const bucket of byUser.values()) {
    if (bucket.messages.length >= MIN_MESSAGES_PER_CANDIDATE) count++;
  }
  return count;
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
    const byUser = new Map<string, { latestName: string; seenBodies: Set<string>; messages: string[] }>();

    const embeddingRows: CleanMessageEntry[] = await prisma.messageEmbedding.findMany({
      where: { chatJid: remoteJid },
      orderBy: { createdAt: "desc" },
      take: 600,
      select: {
        userJid: true,
        senderName: true,
        body: true,
      },
    });

    collectCleanMessages(embeddingRows, byUser);

    if (countEligibleCandidates(byUser) < MAX_CANDIDATES) {
      const rawRows: CleanMessageEntry[] = await prisma.rawMessage.findMany({
        where: { chatJid: remoteJid, isBot: false },
        orderBy: { createdAt: "desc" },
        take: 400,
        select: {
          userJid: true,
          senderName: true,
          body: true,
        },
      });
      collectCleanMessages(rawRows, byUser);
    }

    const eligible = Array.from(byUser.entries())
      .filter(([, data]) => data.messages.length >= MIN_MESSAGES_PER_CANDIDATE)
      .sort((a, b) => b[1].messages.length - a[1].messages.length)
      .slice(0, MAX_CANDIDATES);

    if (eligible.length < MIN_CANDIDATES) {
      return {
        success: false,
        error:
          "Todavía no hay suficientes mensajes en este grupo para entrenar la red neuronal (se necesitan al menos 2 personas con 6+ mensajes reales).",
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

    // Priorizamos candidatos que tengan alguna frase de 22..220 chars sin revelar su propio nombre
    const withCleanQuote = candidateInfos.filter((c) => {
      const accepted = acceptedNamesByJid.get(c.jid) ?? new Set<string>();
      return c.messages.some(
        (m) => m.length >= 22 && m.length <= 220 && !quoteMentionsAuthor(m, accepted)
      );
    });

    const winnerPool = withCleanQuote.length > 0 ? withCleanQuote : candidateInfos;
    const winner = winnerPool[Math.floor(Math.random() * winnerPool.length)];
    const winnerAccepted = acceptedNamesByJid.get(winner.jid) ?? new Set<string>();

    let quotePool = winner.messages.filter(
      (m) => m.length >= 22 && m.length <= 220 && !quoteMentionsAuthor(m, winnerAccepted)
    );
    if (quotePool.length === 0) {
      quotePool = winner.messages.filter((m) => m.length >= 22 && m.length <= 220);
    }
    if (quotePool.length === 0) {
      quotePool = winner.messages;
    }

    const secretQuote = quotePool[Math.floor(Math.random() * quotePool.length)];

    const samples: TrainingSample[] = [];
    for (const candidate of candidateInfos) {
      const pool =
        candidate.jid === winner.jid
          ? candidate.messages.filter((m) => m !== secretQuote)
          : candidate.messages;

      const selected = pool.slice(0, MAX_TRAIN_MESSAGES_PER_CANDIDATE);
      for (const text of selected) {
        samples.push({
          features: vectorizeText(text),
          label: candidate.jid,
        });
      }
    }

    const mlp = new NeuralMLP(FEATURE_DIMENSION, candidateJids, 20, Date.now() & 0xffff);
    const trainStats = mlp.train(samples, { epochs: 75 });
    const prediction = mlp.predictProba(vectorizeText(secretQuote));

    const nameByJid = new Map(candidateInfos.map((c) => [c.jid, c.name]));
    const neuralRanking: NeuralRankEntry[] = prediction.probabilities.map((entry) => ({
      jid: entry.label,
      name: nameByJid.get(entry.label) || entry.label.split("@")[0],
      prob: entry.prob,
      percent: Math.round(entry.prob * 100),
    }));

    const baseReward =
      Math.floor(Math.random() * (BASE_REWARD_MAX - BASE_REWARD_MIN + 1)) + BASE_REWARD_MIN;

    const game: ActiveQuienGame = {
      remoteJid,
      secretQuote,
      winnerJid: winner.jid,
      winnerName: winner.name,
      candidates: candidateInfos.map((c) => ({ jid: c.jid, name: c.name })),
      acceptedNamesByJid,
      neuralRanking,
      neuralTopJid: neuralRanking[0]?.jid || winner.jid,
      neuralTopName: neuralRanking[0]?.name || winner.name,
      trainAccuracy: trainStats.accuracy,
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
      error: "No se pudo entrenar la red neuronal para la partida. Intentá de nuevo en un momento.",
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

  const neuralBeatBonus = game.neuralTopJid !== game.winnerJid ? NEURAL_BEAT_BONUS : 0;
  const reward = game.baseReward + neuralBeatBonus;
  const balanceRes = await modifyBalance(guesserJid, reward);

  return {
    matched: true,
    isCorrect: true,
    game,
    reward,
    neuralBeatBonus,
    newBalance: balanceRes.newBalance,
  };
}
