import { WASocket } from "@whiskeysockets/baileys";
import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";

export interface CiegoPlayer {
  userJid: string;
  userName: string;
  assignedNumber: number;
  guess?: number;
  guessedAt?: number;
}

export interface ActiveCiegoGame {
  chatJid: string;
  status: "lobby" | "playing" | "ended";
  startedAt: number;
  lobbyTimer: NodeJS.Timeout;
  playTimer?: NodeJS.Timeout;
  players: Map<string, CiegoPlayer>;
}

const activeCiegoGames = new Map<string, ActiveCiegoGame>();

export function isCiegoGameActive(chatJid: string): boolean {
  return activeCiegoGames.has(chatJid);
}

export function getActiveCiegoGame(chatJid: string): ActiveCiegoGame | undefined {
  return activeCiegoGames.get(chatJid);
}

/**
 * Inicia la convocatoria (lobby) de 30 segundos para El Número Ciego.
 */
export async function startCiegoLobby(
  chatJid: string,
  initiatorJid: string,
  initiatorName: string,
  sock: WASocket
): Promise<{ success: boolean; error?: string }> {
  if (activeCiegoGames.has(chatJid)) {
    const existing = activeCiegoGames.get(chatJid)!;
    if (existing.status === "lobby") {
      return {
        success: false,
        error: "⚠️ Ya hay una convocatoria abierta para El Número Ciego. ¡Escribí `!unirme` para sumarte!",
      };
    }
    return {
      success: false,
      error: "⚠️ Ya hay una partida de El Número Ciego en curso en este grupo.",
    };
  }

  const players = new Map<string, CiegoPlayer>();
  players.set(initiatorJid, {
    userJid: initiatorJid,
    userName: initiatorName,
    assignedNumber: 0,
  });

  const lobbyTimer = setTimeout(async () => {
    await launchCiegoRound(chatJid, sock);
  }, 30000); // 30 segundos de lobby

  const game: ActiveCiegoGame = {
    chatJid,
    status: "lobby",
    startedAt: Date.now(),
    lobbyTimer,
    players,
  };

  activeCiegoGames.set(chatJid, game);
  return { success: true };
}

/**
 * Registra a un jugador en el lobby activo.
 */
export function joinCiegoGame(
  chatJid: string,
  userJid: string,
  userName: string
): { success: boolean; error?: string; totalPlayers?: number } {
  const game = activeCiegoGames.get(chatJid);
  if (!game || game.status !== "lobby") {
    return { success: false, error: "⚠️ No hay ninguna convocatoria abierta para unirse en este momento." };
  }

  if (game.players.has(userJid)) {
    return { success: false, error: "ℹ️ Ya estás anotado en la partida." };
  }

  game.players.set(userJid, {
    userJid,
    userName,
    assignedNumber: 0,
  });

  return { success: true, totalPlayers: game.players.size };
}

/**
 * Inicia la partida real tras cumplirse los 30s de lobby.
 */
async function launchCiegoRound(chatJid: string, sock: WASocket): Promise<void> {
  const game = activeCiegoGames.get(chatJid);
  if (!game || game.status !== "lobby") return;

  // Mínimo 2 jugadores
  if (game.players.size < 2) {
    activeCiegoGames.delete(chatJid);
    await sock.sendMessage(chatJid, {
      text: "⏱️ *¡CONVOCATORIA FINALIZADA!* 🛑\n\n⚠️ *Partida cancelada:* Se requieren al menos *2 jugadores* para jugar a El Número Ciego. ¡Prueben de nuevo cuando haya más gente conectada!",
    }).catch(() => {});
    return;
  }

  game.status = "playing";

  // Generar números aleatorios únicos del 1 al 99
  const usedNumbers = new Set<number>();
  const playersList = Array.from(game.players.values());

  for (const player of playersList) {
    let num: number;
    do {
      num = Math.floor(Math.random() * 99) + 1;
    } while (usedNumbers.has(num));
    usedNumbers.add(num);
    player.assignedNumber = num;
  }

  // Enviar a cada jugador los números de los demás por privado
  for (const player of playersList) {
    const others = playersList.filter((p) => p.userJid !== player.userJid);
    const othersListText = others
      .map((p) => `• *${p.userName}:* [ ${p.assignedNumber} ]`)
      .join("\n");

    const dmText =
      `🕶️ *EL NÚMERO CIEGO (Tu información secreta)* 🎲\n\n` +
      `Estos son los números asignados a tus compañeros:\n` +
      `${othersListText}\n\n` +
      `🤫 *Tu número es secreto:* Vos NO sabés cuál es.\n` +
      `🗣️ Hacé preguntas y pistas en el grupo para deducirlo.\n` +
      `🎯 Cuando estés listo, mandá en el grupo: *!arriesgar <número>*\n` +
      `*(Tolerancia: ±3 números para ganar fichas).*`;

    try {
      await sock.sendMessage(player.userJid, { text: dmText });
    } catch (err) {
      console.warn(`[Ciego DM Error] No se pudo enviar mensaje privado a ${player.userJid}:`, err);
    }
  }

  // Anuncio oficial en el grupo
  const mentions = playersList.map((p) => p.userJid);
  const mentionNames = playersList
    .map((p) => `@${p.userJid.split("@")[0].split(":")[0]}`)
    .join(", ");

  const groupText =
    `🎲 *¡EL NÚMERO CIEGO HA COMENZADO!* 🕶️\n\n` +
    `👥 *Participantes:* ${mentionNames}\n\n` +
    `📩 *¡Los números de sus compañeros ya fueron enviados al privado de cada uno!*\n` +
    `🤫 Nadie sabe su propio número.\n\n` +
    `🗣️ *¡2 minutos de debate libre en el grupo!* Pregúntense, compárense y dénse pistas.\n` +
    `🎯 Para arriesgar manden: *!arriesgar <número>*\n` +
    `*(Tolerancia de victoria: ±3 números. Premios de $10.000 a $50.000 fichas).*`;

  await sock.sendMessage(chatJid, { text: groupText, mentions }).catch(() => {});

  // Timer de 2 minutos para el debate y arriesgar
  game.playTimer = setTimeout(async () => {
    await finishCiegoGame(chatJid, sock);
  }, 120000);
}

/**
 * Procesa el arriesgar de un jugador.
 */
export async function submitCiegoGuess(
  chatJid: string,
  userJid: string,
  guessNumber: number,
  sock: WASocket
): Promise<{ success: boolean; error?: string; allGuessed?: boolean }> {
  const game = activeCiegoGames.get(chatJid);
  if (!game || game.status !== "playing") {
    return { success: false, error: "⚠️ No hay ninguna partida activa de El Número Ciego para arriesgar." };
  }

  const player = game.players.get(userJid);
  if (!player) {
    return { success: false, error: "⚠️ No estás participando en esta partida." };
  }

  if (player.guess !== undefined) {
    return { success: false, error: "ℹ️ Ya arriesgaste tu número en esta partida." };
  }

  player.guess = guessNumber;
  player.guessedAt = Date.now();

  // Si todos los jugadores ya arriesgaron, finalizar de inmediato
  const allGuessed = Array.from(game.players.values()).every((p) => p.guess !== undefined);
  if (allGuessed) {
    if (game.playTimer) clearTimeout(game.playTimer);
    await finishCiegoGame(chatJid, sock);
    return { success: true, allGuessed: true };
  }

  return { success: true, allGuessed: false };
}

/**
 * Concluye la partida, calcula distancias (tolerancia ±3), acredita premios y publica resultados.
 */
async function finishCiegoGame(chatJid: string, sock: WASocket): Promise<void> {
  const game = activeCiegoGames.get(chatJid);
  if (!game) return;

  if (game.playTimer) clearTimeout(game.playTimer);
  activeCiegoGames.delete(chatJid);

  const playersList = Array.from(game.players.values());
  const mentions = playersList.map((p) => p.userJid);

  interface ResultRow {
    player: CiegoPlayer;
    actual: number;
    guess: number | null;
    diff: number;
    won: boolean;
    tierText: string;
    reward: number;
  }

  const results: ResultRow[] = [];

  for (const p of playersList) {
    if (p.guess === undefined) {
      results.push({
        player: p,
        actual: p.assignedNumber,
        guess: null,
        diff: 999,
        won: false,
        tierText: "❌ No arriesgó",
        reward: 0,
      });
      continue;
    }

    const diff = Math.abs(p.guess - p.assignedNumber);
    let reward = 0;
    let tierText = "❌ Fuera de rango (> 3)";

    if (diff === 0) {
      reward = 50000;
      tierText = "🎯 ¡EXACTO! (Francotirador)";
    } else if (diff === 1) {
      reward = 30000;
      tierText = "🔥 Diferencia 1 (Casi clavado)";
    } else if (diff === 2) {
      reward = 20000;
      tierText = "⚡ Diferencia 2 (Muy cerca)";
    } else if (diff === 3) {
      reward = 10000;
      tierText = "✅ Diferencia 3 (Dentro del margen)";
    }

    if (reward > 0) {
      try {
        const u = await resolveOrRegisterUser(p.userJid);
        await withWriteLock(async () => {
          await prisma.userProfile.update({
            where: { id: u.id },
            data: { balance: { increment: reward } },
          });
        });
      } catch (err) {
        console.error(`[Ciego Reward Error] Error al acreditar a ${p.userJid}:`, err);
      }
    }

    results.push({
      player: p,
      actual: p.assignedNumber,
      guess: p.guess,
      diff,
      won: reward > 0,
      tierText,
      reward,
    });
  }

  // Ordenar por diferencia ascendente (los más precisos arriba)
  results.sort((a, b) => a.diff - b.diff);

  const rowsText = results
    .map((r) => {
      const phone = r.player.userJid.split("@")[0].split(":")[0];
      const guessStr = r.guess !== null ? `${r.guess}` : "Ninguno";
      const rewardStr = r.reward > 0 ? ` 💰 +*$${r.reward.toLocaleString("es-AR")}* fichas` : "";
      return `• *@${phone}:* Tu número era *[ ${r.actual} ]* | Arriesgaste: *${guessStr}*\n  👉 ${r.tierText}${rewardStr}`;
    })
    .join("\n\n");

  const totalWinners = results.filter((r) => r.won).length;

  const summaryHeader = totalWinners > 0
    ? `🎉 *¡RESULTADOS DE EL NÚMERO CIEGO!* 🏆\n\n`
    : `⏱️ *¡FIN DE LA PARTIDA!* 🛑\n\n`;

  const finalMessage =
    `${summaryHeader}` +
    `${rowsText}\n\n` +
    `💡 _¡Premios acreditados en sus billeteras! Para jugar otra ronda manden \`!ciego\`._`;

  await sock.sendMessage(chatJid, { text: finalMessage, mentions }).catch(() => {});
}
