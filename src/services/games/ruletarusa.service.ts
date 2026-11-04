/**
 * Servicio de Ruleta Rusa Segura para Empy-Bot.
 * Cero riesgo de baneo de WhatsApp: la sanción es ignoración temporal por parte del bot.
 */

interface RouletteGame {
  totalChambers: number;
  bulletIndex: number;
  currentChamber: number;
  lastPlayedAt: number;
}

const activeRoulettes = new Map<string, RouletteGame>();
const deadUsers = new Map<string, number>(); // userJid -> timestamp de expiración del coma

const TOTAL_CHAMBERS = 6;
const IGNORE_DURATION_MS = 5 * 60 * 1000; // 5 minutos de ignoración

function getOrCreateRoulette(groupJid: string): RouletteGame {
  const existing = activeRoulettes.get(groupJid);
  const now = Date.now();

  // Si pasaron más de 10 minutos de inactividad, recargar y girar el tambor
  if (existing && now - existing.lastPlayedAt < 10 * 60 * 1000 && existing.currentChamber < existing.totalChambers) {
    return existing;
  }

  const newGame: RouletteGame = {
    totalChambers: TOTAL_CHAMBERS,
    bulletIndex: Math.floor(Math.random() * TOTAL_CHAMBERS),
    currentChamber: 0,
    lastPlayedAt: now,
  };

  activeRoulettes.set(groupJid, newGame);
  return newGame;
}

export function isUserIgnoredByRoulette(userJid: string): boolean {
  if (!userJid) return false;
  const expiresAt = deadUsers.get(userJid);
  if (!expiresAt) return false;

  const now = Date.now();
  if (now > expiresAt) {
    deadUsers.delete(userJid);
    return false;
  }
  return true;
}

export function getRemainingDeathSeconds(userJid: string): number {
  const expiresAt = deadUsers.get(userJid);
  if (!expiresAt) return 0;
  const now = Date.now();
  if (now > expiresAt) {
    deadUsers.delete(userJid);
    return 0;
  }
  return Math.ceil((expiresAt - now) / 1000);
}

export function killUserWithRoulette(userJid: string, durationMs: number = IGNORE_DURATION_MS): void {
  deadUsers.set(userJid, Date.now() + durationMs);
}

export function reviveUser(userJid: string): void {
  deadUsers.delete(userJid);
}

export interface RouletteResult {
  survived: boolean;
  chamberNumber: number;
  remainingChambers: number;
  bulletFound: boolean;
}

export function pullRouletteTrigger(groupJid: string, userJid: string): RouletteResult {
  const game = getOrCreateRoulette(groupJid);
  game.lastPlayedAt = Date.now();

  const currentChamber = game.currentChamber;
  const isBullet = currentChamber === game.bulletIndex;

  if (isBullet) {
    // Muere: aplicar castigo de ignoración
    killUserWithRoulette(userJid);
    // Reiniciar tambor para la próxima partida
    activeRoulettes.delete(groupJid);

    return {
      survived: false,
      chamberNumber: currentChamber + 1,
      remainingChambers: 0,
      bulletFound: true,
    };
  }

  // Sobrevive: avanzar a la siguiente recámara
  game.currentChamber++;
  const remaining = game.totalChambers - game.currentChamber;

  // Si se completaron las 5 recámaras vacías, la última era la bala; se reinicia el tambor
  if (remaining <= 1) {
    activeRoulettes.delete(groupJid);
  }

  return {
    survived: true,
    chamberNumber: currentChamber + 1,
    remainingChambers: remaining,
    bulletFound: false,
  };
}
