import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser } from "./db/user.service.js";
import { ECONOMY_CONFIG } from "../config/economy.config.js";
import { isUserEconomyFrozen } from "./admin-economy.service.js";
import { checkCasinoRateLimit, recordCasinoBet } from "./economy.service.js";

export interface Card {
  suit: string;
  rank: string;
  value: number;
}

export interface BlackjackGame {
  userJid: string;
  userId: string;
  bet: number;
  playerCards: Card[];
  dealerCards: Card[];
  startedAt: number;
  timer: NodeJS.Timeout;
  onTimeout?: (result: any) => Promise<void>;
}

const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
];

function drawCard(): Card {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const r = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit, rank: r.rank, value: r.value };
}

export function calculateScore(cards: Card[]): { score: number; isBlackjack: boolean; isBust: boolean } {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
    } else {
      total += c.value;
    }
  }

  for (let i = 0; i < aces; i++) {
    if (total + 11 + (aces - 1 - i) <= 21) {
      total += 11;
    } else {
      total += 1;
    }
  }

  const isBlackjack = cards.length === 2 && total === 21;
  const isBust = total > 21;

  return { score: total, isBlackjack, isBust };
}

export function formatHand(cards: Card[], hideSecond = false): string {
  if (hideSecond && cards.length >= 2) {
    return `[ ${cards[0].rank}${cards[0].suit} | 🎴 ?? ]`;
  }
  return `[ ${cards.map((c) => `${c.rank}${c.suit}`).join(" | ")} ]`;
}

const activeGames = new Map<string, BlackjackGame>();
const GAME_TIMEOUT_MS = 60 * 1000; // 60 segundos para responder

export function getActiveBlackjackGame(userJidOrId: string): BlackjackGame | undefined {
  if (activeGames.has(userJidOrId)) return activeGames.get(userJidOrId);
  for (const game of activeGames.values()) {
    if (game.userJid === userJidOrId || game.userId === userJidOrId) return game;
  }
  return undefined;
}

/**
 * Inicia una partida de Blackjack / 21 contra la casa.
 */
export async function startBlackjack(
  userJid: string,
  bet: number,
  onTimeout?: (result: any) => Promise<void>
): Promise<{
  success: boolean;
  error?: string;
  gameFinished?: boolean;
  statusText?: string;
  playerCards?: Card[];
  dealerCards?: Card[];
  playerScore?: number;
  dealerScore?: number;
  netProfit?: number;
  newBalance?: number;
}> {
  const user = await resolveOrRegisterUser(userJid);

  const freezeCheck = isUserEconomyFrozen(userJid).frozen || (user.lid && isUserEconomyFrozen(user.lid).frozen) || isUserEconomyFrozen(user.phone).frozen;
  if (freezeCheck) {
    return {
      success: false,
      error: `🧊 *¡ECONOMÍA CONGELADA!* No podés jugar al Blackjack porque tu cuenta está suspendida por el Creador.`,
    };
  }

  const { MIN_BET, MAX_BET } = ECONOMY_CONFIG.ROULETTE; // Entre 20 y 1000
  if (isNaN(bet) || bet < MIN_BET || bet > MAX_BET) {
    return {
      success: false,
      error: `La apuesta debe ser entre *$${MIN_BET}* y *$${MAX_BET}* fichas.`,
    };
  }

  const existingGame = getActiveBlackjackGame(user.id) || getActiveBlackjackGame(userJid);
  if (existingGame) {
    return {
      success: false,
      error: `Ya tenés una partida en curso. Usá \`!pedir\` para sacar carta o \`!plantarse\` para terminar la jugada.`,
    };
  }

  const limitCheck = checkCasinoRateLimit(user.id);
  if (!limitCheck.allowed) {
    return {
      success: false,
      error: `🎰 Pará un poco, timbero. Máximo ${ECONOMY_CONFIG.CASINO_MAX_BETS_PER_MINUTE} apuestas por minuto en el casino. Esperá *${limitCheck.remainingSec}s*.`,
    };
  }

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    if (current.balance < bet) {
      return {
        success: false,
        error: `Saldo insuficiente. Tenés *$${current.balance}* fichas y quisiste apostar *$${bet}*.`,
      };
    }

    // Registrar apuesta para el rate limit del casino
    recordCasinoBet(user.id);

    // Descontar la apuesta de la billetera
    await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: { decrement: bet } },
    });

    const playerCards = [drawCard(), drawCard()];
    const dealerCards = [drawCard(), drawCard()];

    const playerCalc = calculateScore(playerCards);
    const dealerCalc = calculateScore(dealerCards);

    // Caso de Blackjack natural de entrada (21 en 2 cartas)
    if (playerCalc.isBlackjack) {
      if (dealerCalc.isBlackjack) {
        // Empate con blackjack
        const updated = await prisma.userProfile.update({
          where: { id: user.id },
          data: { balance: { increment: bet } },
        });
        return {
          success: true,
          gameFinished: true,
          statusText: "🤝 *¡EMPATE DE BLACKJACK!* Ambos tienen 21 natural. Se te devuelve la apuesta.",
          playerCards,
          dealerCards,
          playerScore: 21,
          dealerScore: 21,
          netProfit: 0,
          newBalance: updated.balance,
        };
      } else {
        // Ganó el jugador con Blackjack natural (Paga 2.5x -> 1.5x de ganancia neta)
        const payout = Math.round(bet * 2.5);
        const profit = payout - bet;
        const updated = await prisma.userProfile.update({
          where: { id: user.id },
          data: { balance: { increment: payout } },
        });
        return {
          success: true,
          gameFinished: true,
          statusText: `🃏 *¡BLACKJACK NATURAL!* Clavaste 21 de entrada. ¡Pagás 2.5x! (+*$${profit}* fichas)`,
          playerCards,
          dealerCards,
          playerScore: 21,
          dealerScore: dealerCalc.score,
          netProfit: profit,
          newBalance: updated.balance,
        };
      }
    }

    // Programar timeout si el jugador no responde en 60s (se planta automáticamente)
    const timer = setTimeout(async () => {
      try {
        const currentGame = getActiveBlackjackGame(user.id);
        if (currentGame) {
          const res = await standBlackjack(currentGame.userJid);
          if (currentGame.onTimeout && res.success) {
            await currentGame.onTimeout(res).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[Blackjack Timeout Error]:", err);
      }
    }, GAME_TIMEOUT_MS);

    activeGames.set(user.id, {
      userJid,
      userId: user.id,
      bet,
      playerCards,
      dealerCards,
      startedAt: Date.now(),
      timer,
      onTimeout,
    });

    return {
      success: true,
      gameFinished: false,
      playerCards,
      dealerCards,
      playerScore: playerCalc.score,
      dealerScore: dealerCards[0].value,
      newBalance: current.balance - bet,
    };
  });
}

/**
 * Pide una carta adicional (!pedir o !hit).
 */
export async function hitBlackjack(userJid: string): Promise<{
  success: boolean;
  error?: string;
  gameFinished?: boolean;
  statusText?: string;
  playerCards?: Card[];
  dealerCards?: Card[];
  playerScore?: number;
  dealerScore?: number;
  netProfit?: number;
  newBalance?: number;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const game = getActiveBlackjackGame(user.id) || getActiveBlackjackGame(userJid);
  if (!game) {
    return {
      success: false,
      error: "No tenés ninguna partida activa de 21. Empezá una con `!21 <monto>`.",
    };
  }

  // Renovar timer
  clearTimeout(game.timer);

  const newCard = drawCard();
  game.playerCards.push(newCard);

  const playerCalc = calculateScore(game.playerCards);

  // Se pasó de 21 -> BUST (pierde)
  if (playerCalc.isBust) {
    activeGames.delete(game.userId);
    activeGames.delete(game.userJid);
    const current = await prisma.userProfile.findUnique({ where: { id: game.userId } });
    return {
      success: true,
      gameFinished: true,
      statusText: `💥 *¡TE PASASTE!* Sumaste *${playerCalc.score}* puntos y quedaste afuera. Perdiste *$${game.bet}* fichas.`,
      playerCards: game.playerCards,
      dealerCards: game.dealerCards,
      playerScore: playerCalc.score,
      dealerScore: calculateScore(game.dealerCards).score,
      netProfit: -game.bet,
      newBalance: current?.balance ?? 0,
    };
  }

  // Clavó 21 clavado -> Se planta automáticamente
  if (playerCalc.score === 21) {
    return await standBlackjack(userJid);
  }

  // Sigue en juego (< 21)
  game.timer = setTimeout(async () => {
    try {
      const currentGame = getActiveBlackjackGame(game.userId);
      if (currentGame) {
        const timeoutCb = currentGame.onTimeout;
        const res = await standBlackjack(currentGame.userJid);
        if (timeoutCb && res.success) {
          await timeoutCb(res).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Blackjack Timeout Error]:", err);
    }
  }, GAME_TIMEOUT_MS);

  return {
    success: true,
    gameFinished: false,
    playerCards: game.playerCards,
    dealerCards: game.dealerCards,
    playerScore: playerCalc.score,
    dealerScore: game.dealerCards[0].value,
  };
}

/**
 * Se planta y deja jugar a la casa (!plantarse o !stand).
 */
export async function standBlackjack(userJid: string): Promise<{
  success: boolean;
  error?: string;
  gameFinished?: boolean;
  statusText?: string;
  playerCards?: Card[];
  dealerCards?: Card[];
  playerScore?: number;
  dealerScore?: number;
  netProfit?: number;
  newBalance?: number;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const game = getActiveBlackjackGame(user.id) || getActiveBlackjackGame(userJid);
  if (!game) {
    return {
      success: false,
      error: "No tenés ninguna partida activa de 21. Empezá una con `!21 <monto>`.",
    };
  }

  clearTimeout(game.timer);
  activeGames.delete(game.userId);
  activeGames.delete(game.userJid);

  const playerCalc = calculateScore(game.playerCards);

  // La casa pide cartas hasta sumar al menos 17 puntos
  let dealerCalc = calculateScore(game.dealerCards);
  while (dealerCalc.score < 17) {
    game.dealerCards.push(drawCard());
    dealerCalc = calculateScore(game.dealerCards);
  }

  return await withWriteLock(async () => {
    let outcome: "win" | "lose" | "push" = "lose";
    let statusText = "";
    let payout = 0;

    if (dealerCalc.isBust) {
      outcome = "win";
      payout = game.bet * 2;
      statusText = `🎉 *¡LA CASA SE PASÓ!* El croupier sumó *${dealerCalc.score}* y se fue al pasto. ¡Ganaste *$${game.bet}* fichas limpias!`;
    } else if (playerCalc.score > dealerCalc.score) {
      outcome = "win";
      payout = game.bet * 2;
      statusText = `🎉 *¡GANASTE!* Tu puntaje (*${playerCalc.score}*) superó a la casa (*${dealerCalc.score}*). Cobrás *$${game.bet}* fichas limpias.`;
    } else if (playerCalc.score === dealerCalc.score) {
      outcome = "push";
      payout = game.bet;
      statusText = `🤝 *¡EMPATE (PUSH)!* Ambos sumaron *${playerCalc.score}* puntos. Se te reembolsan tus *$${game.bet}* fichas.`;
    } else {
      outcome = "lose";
      payout = 0;
      statusText = `💀 *PERDISTE.* La casa sumó *${dealerCalc.score}* contra tus *${playerCalc.score}*. La casa siempre tiene ventaja.`;
    }

    let updatedBalance = 0;
    if (payout > 0) {
      const updated = await prisma.userProfile.update({
        where: { id: game.userId },
        data: { balance: { increment: payout } },
      });
      updatedBalance = updated.balance;
    } else {
      const current = await prisma.userProfile.findUnique({ where: { id: game.userId } });
      updatedBalance = current?.balance ?? 0;
    }

    const netProfit = payout - game.bet;

    return {
      success: true,
      gameFinished: true,
      statusText,
      playerCards: game.playerCards,
      dealerCards: game.dealerCards,
      playerScore: playerCalc.score,
      dealerScore: dealerCalc.score,
      netProfit,
      newBalance: updatedBalance,
    };
  });
}
