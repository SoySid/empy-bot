import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";

export interface MineCell {
  row: string; // "A", "B", "C", "D"
  col: number; // 1, 2, 3, 4
  isMine: boolean;
  revealed: boolean;
  steppedBy?: string;
}

export interface MinefieldGame {
  groupJid: string;
  hostJid: string;
  hostName: string;
  initialBet: number;
  currentPot: number;
  multiplier: number;
  grid: MineCell[][];
  safeTilesTotal: number;
  safeTilesRevealed: number;
  lastSteppedBy?: string;
  lastSteppedCoord?: string;
  isOver: boolean;
  createdAt: number;
}

const activeGames = new Map<string, MinefieldGame>();
const ROWS = ["A", "B", "C", "D"];
const COLS = [1, 2, 3, 4];
const TOTAL_TILES = 16;
const TOTAL_MINES = 3;

/**
 * Inicializa una nueva partida de Campo Minado en el grupo.
 */
export async function startMinefieldGame(
  groupJid: string,
  userJid: string,
  userName: string,
  bet: number
): Promise<{ success: boolean; error?: string; game?: MinefieldGame; newBalance?: number }> {
  const existing = activeGames.get(groupJid);
  if (existing && !existing.isOver && Date.now() - existing.createdAt < 5 * 60 * 1000) {
    return {
      success: false,
      error: "Ya hay una partida de Campo Minado activa en este grupo. Podés pisar con `!pisar <coord>` o cobrar el pozo con `!cobrar`.",
    };
  }

  // Validar apuesta
  if (isNaN(bet) || bet < 200) {
    return { success: false, error: "La apuesta mínima para abrir el Campo Minado es de *$200* fichas." };
  }
  if (bet > 50000) {
    return { success: false, error: "La apuesta máxima permitida es de *$50.000* fichas." };
  }

  // Cobro atómico en Prisma
  let newBalance = 0;
  try {
    await withWriteLock(async () => {
      const profile = await resolveOrRegisterUser(userJid);
      if (profile.balance < bet) {
        throw new Error(`Saldo insuficiente. Tenés *$${profile.balance.toLocaleString("es-AR")}* fichas.`);
      }
      const updated = await prisma.userProfile.update({
        where: { jid: userJid },
        data: { balance: { decrement: bet } },
        select: { balance: true },
      });
      newBalance = updated.balance;
    });
  } catch (err: any) {
    return { success: false, error: err.message || "Error al descontar apuesta." };
  }

  // Generar cuadrícula 4x4
  const grid: MineCell[][] = [];
  const flatIndices = Array.from({ length: TOTAL_TILES }, (_, i) => i);
  // Barajar y elegir índices de minas
  for (let i = flatIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flatIndices[i], flatIndices[j]] = [flatIndices[j], flatIndices[i]];
  }
  const mineIndices = new Set(flatIndices.slice(0, TOTAL_MINES));

  let index = 0;
  for (let r = 0; r < ROWS.length; r++) {
    const rowList: MineCell[] = [];
    for (let c = 0; c < COLS.length; c++) {
      rowList.push({
        row: ROWS[r],
        col: COLS[c],
        isMine: mineIndices.has(index),
        revealed: false,
      });
      index++;
    }
    grid.push(rowList);
  }

  const game: MinefieldGame = {
    groupJid,
    hostJid: userJid,
    hostName: userName,
    initialBet: bet,
    currentPot: Math.round(bet * 1.2),
    multiplier: 1.2,
    grid,
    safeTilesTotal: TOTAL_TILES - TOTAL_MINES,
    safeTilesRevealed: 0,
    isOver: false,
    createdAt: Date.now(),
  };

  activeGames.set(groupJid, game);
  return { success: true, game, newBalance };
}

/**
 * Pisa un casillero del campo de minas.
 */
export async function stepOnTile(
  groupJid: string,
  userJid: string,
  userName: string,
  rawCoord: string
): Promise<{
  success: boolean;
  error?: string;
  hitMine?: boolean;
  gameWon?: boolean;
  potWon?: number;
  newBalance?: number;
  game?: MinefieldGame;
  coordFormatted?: string;
}> {
  const game = activeGames.get(groupJid);
  if (!game || game.isOver) {
    return {
      success: false,
      error: "No hay ninguna partida de Campo Minado activa en este grupo. Creá una nueva con `!campo [apuesta]`.",
    };
  }

  const cleanCoord = rawCoord.trim().toUpperCase();
  const match = cleanCoord.match(/^([A-D])([1-4])$/);
  if (!match) {
    return {
      success: false,
      error: "Coordenada inválida. Usá letras de la A a la D y números del 1 al 4 (ejemplo: `!pisar B2` o `!pisar D4`).",
    };
  }

  const [, rowLetter, colStr] = match;
  const rowIndex = ROWS.indexOf(rowLetter);
  const colIndex = parseInt(colStr, 10) - 1;

  const cell = game.grid[rowIndex][colIndex];
  if (cell.revealed) {
    return {
      success: false,
      error: `El casillero *${rowLetter}${colStr}* ya fue pisado previamente. Elegí otro casillero verde 🟩.`,
    };
  }

  cell.revealed = true;
  cell.steppedBy = userName;
  game.lastSteppedBy = userName;
  game.lastSteppedCoord = `${rowLetter}${colStr}`;

  // 1. PISÓ UNA MINA: BOOM
  if (cell.isMine) {
    game.isOver = true;
    // Revelar toda la grilla para ver dónde estaban las demás
    for (const row of game.grid) {
      for (const c of row) {
        c.revealed = true;
      }
    }
    return {
      success: true,
      hitMine: true,
      game,
      coordFormatted: `${rowLetter}${colStr}`,
    };
  }

  // 2. CASILLERO SEGURO
  game.safeTilesRevealed++;
  // Multiplicador progresivo
  const multiSteps = [1.2, 1.45, 1.75, 2.1, 2.55, 3.1, 3.8, 4.65, 5.7, 7.0, 8.6, 10.5, 13.0];
  const stepIdx = Math.min(game.safeTilesRevealed - 1, multiSteps.length - 1);
  game.multiplier = multiSteps[stepIdx];
  game.currentPot = Math.round(game.initialBet * game.multiplier);

  // 3. VICTORIA COMPLETA (despejó todos los seguros)
  if (game.safeTilesRevealed >= game.safeTilesTotal) {
    game.isOver = true;
    for (const row of game.grid) {
      for (const c of row) {
        c.revealed = true;
      }
    }
    // Bono de victoria total x2 sobre el pozo acumulado
    const finalPot = game.currentPot * 2;
    let newBalance = 0;
    await withWriteLock(async () => {
      const updated = await prisma.userProfile.update({
        where: { jid: userJid },
        data: { balance: { increment: finalPot } },
        select: { balance: true },
      });
      newBalance = updated.balance;
    });

    return {
      success: true,
      hitMine: false,
      gameWon: true,
      potWon: finalPot,
      newBalance,
      game,
      coordFormatted: `${rowLetter}${colStr}`,
    };
  }

  return {
    success: true,
    hitMine: false,
    gameWon: false,
    game,
    coordFormatted: `${rowLetter}${colStr}`,
  };
}

/**
 * Cobra el pozo acumulado y retira la partida con éxito.
 */
export async function cashOutMinefield(
  groupJid: string,
  userJid: string,
  userName: string
): Promise<{ success: boolean; error?: string; potWon?: number; newBalance?: number; game?: MinefieldGame }> {
  const game = activeGames.get(groupJid);
  if (!game || game.isOver) {
    return { success: false, error: "No hay ninguna partida activa para cobrar." };
  }

  if (game.safeTilesRevealed === 0) {
    return { success: false, error: "Tenés que pisar al menos 1 casillero seguro antes de poder cobrar el pozo." };
  }

  game.isOver = true;
  for (const row of game.grid) {
    for (const c of row) {
      c.revealed = true;
    }
  }

  const potWon = game.currentPot;
  let newBalance = 0;
  await withWriteLock(async () => {
    await resolveOrRegisterUser(userJid);
    const updated = await prisma.userProfile.update({
      where: { jid: userJid },
      data: { balance: { increment: potWon } },
      select: { balance: true },
    });
    newBalance = updated.balance;
  });

  return {
    success: true,
    potWon,
    newBalance,
    game,
  };
}

/**
 * Genera la representación visual en texto WhatsApp del tablero.
 */
export function renderMinefieldBoard(game: MinefieldGame): string {
  let board = "     1    2    3    4\n";

  for (let r = 0; r < game.grid.length; r++) {
    const rowLetter = ROWS[r];
    const cells = game.grid[r].map((c) => {
      if (!c.revealed) return "🟩";
      if (c.isMine) return "💣";
      return "💎";
    });
    board += `*${rowLetter}*  ${cells.join("  ")}\n`;
  }

  return board;
}
