import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

export interface HangmanItem {
  phrase: string;
  category: string;
  hint?: string;
}

export const HANGMAN_CATALOG: HangmanItem[] = [
  // 🎬 Cine y Series
  { phrase: "EL PADRINO", category: "🎬 Cine & Series" },
  { phrase: "BREAKING BAD", category: "🎬 Cine & Series" },
  { phrase: "RELATOS SALVAJES", category: "🎬 Cine & Series" },
  { phrase: "TITANIC", category: "🎬 Cine & Series" },
  { phrase: "GLADIADOR", category: "🎬 Cine & Series" },
  { phrase: "LOS SIMPSON", category: "🎬 Cine & Series" },
  { phrase: "PULP FICTION", category: "🎬 Cine & Series" },
  { phrase: "INTERESTELAR", category: "🎬 Cine & Series" },
  { phrase: "JURASSIC PARK", category: "🎬 Cine & Series" },
  { phrase: "STRANGER THINGS", category: "🎬 Cine & Series" },
  { phrase: "EL SENOR DE LOS ANILLOS", category: "🎬 Cine & Series" },
  { phrase: "HARRY POTTER", category: "🎬 Cine & Series" },
  { phrase: "STAR WARS", category: "🎬 Cine & Series" },
  { phrase: "AVENGERS", category: "🎬 Cine & Series" },
  { phrase: "EL REY LEON", category: "🎬 Cine & Series" },

  // 🎵 Música y Bandas
  { phrase: "SODA STEREO", category: "🎵 Música & Bandas" },
  { phrase: "CHARLY GARCIA", category: "🎵 Música & Bandas" },
  { phrase: "LOS REDONDOS", category: "🎵 Música & Bandas" },
  { phrase: "LUIS ALBERTO SPINETTA", category: "🎵 Música & Bandas" },
  { phrase: "DUKI", category: "🎵 Música & Bandas" },
  { phrase: "QUEEN", category: "🎵 Música & Bandas" },
  { phrase: "THE BEATLES", category: "🎵 Música & Bandas" },
  { phrase: "GUSTAVO CERATI", category: "🎵 Música & Bandas" },
  { phrase: "FITO PAEZ", category: "🎵 Música & Bandas" },
  { phrase: "BABASONICOS", category: "🎵 Música & Bandas" },
  { phrase: "RED HOT CHILI PEPPERS", category: "🎵 Música & Bandas" },
  { phrase: "NIRVANA", category: "🎵 Música & Bandas" },
  { phrase: "COLDPLAY", category: "🎵 Música & Bandas" },
  { phrase: "CALLEJEROS", category: "🎵 Música & Bandas" },
  { phrase: "MERCEDES SOSA", category: "🎵 Música & Bandas" },

  // 🇦🇷 Cultura & Comida
  { phrase: "EMPANADAS DE CARNE", category: "🇦🇷 Cultura & Comida" },
  { phrase: "ASADO DE TIRA", category: "🇦🇷 Cultura & Comida" },
  { phrase: "MILANESA CON FRITAS", category: "🇦🇷 Cultura & Comida" },
  { phrase: "FERNET CON COCA", category: "🇦🇷 Cultura & Comida" },
  { phrase: "CHORIPAN", category: "🇦🇷 Cultura & Comida" },
  { phrase: "MATE AMARGO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "DULCE DE LECHE", category: "🇦🇷 Cultura & Comida" },
  { phrase: "ALFAJOR TRIPLE", category: "🇦🇷 Cultura & Comida" },
  { phrase: "BONDI NOCTURNO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "CHIPA CALENTITO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "LOCRO CRIOLLO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "VAQUITA DE SAN ANTONIO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "CARPINCHO", category: "🇦🇷 Cultura & Comida" },
  { phrase: "PIZZA DE MUZZARELLA", category: "🇦🇷 Cultura & Comida" },

  // 🌍 Geografía y Ciudades
  { phrase: "BUENOS AIRES", category: "🌍 Geografía & Ciudades" },
  { phrase: "CORDOBA CAPITAL", category: "🌍 Geografía & Ciudades" },
  { phrase: "BARILOCHE", category: "🌍 Geografía & Ciudades" },
  { phrase: "CATARATAS DEL IGUAZU", category: "🌍 Geografía & Ciudades" },
  { phrase: "USHUAIA", category: "🌍 Geografía & Ciudades" },
  { phrase: "NUEVA YORK", category: "🌍 Geografía & Ciudades" },
  { phrase: "TOKIO", category: "🌍 Geografía & Ciudades" },
  { phrase: "AMSTERDAM", category: "🌍 Geografía & Ciudades" },
  { phrase: "MADRID", category: "🌍 Geografía & Ciudades" },
  { phrase: "RIO DE JANEIRO", category: "🌍 Geografía & Ciudades" },
  { phrase: "PARIS", category: "🌍 Geografía & Ciudades" },
  { phrase: "MONTEVIDEO", category: "🌍 Geografía & Ciudades" },
  { phrase: "LONDRES", category: "🌍 Geografía & Ciudades" },

  // ⚽ Deportes e Ídolos
  { phrase: "LIONEL MESSI", category: "⚽ Deportes & Ídolos" },
  { phrase: "DIEGO MARADONA", category: "⚽ Deportes & Ídolos" },
  { phrase: "ESTADIO MONUMENTAL", category: "⚽ Deportes & Ídolos" },
  { phrase: "LA BOMBONERA", category: "⚽ Deportes & Ídolos" },
  { phrase: "MANU GINOBILI", category: "⚽ Deportes & Ídolos" },
  { phrase: "RODRIGO DE PAUL", category: "⚽ Deportes & Ídolos" },
  { phrase: "DIBU MARTINEZ", category: "⚽ Deportes & Ídolos" },
  { phrase: "JUAN ROMAN RIQUELME", category: "⚽ Deportes & Ídolos" },
  { phrase: "ANGEL DI MARIA", category: "⚽ Deportes & Ídolos" },
  { phrase: "COPA DEL MUNDO", category: "⚽ Deportes & Ídolos" },

  // 🎮 Videojuegos
  { phrase: "MINECRAFT", category: "🎮 Videojuegos" },
  { phrase: "COUNTER STRIKE", category: "🎮 Videojuegos" },
  { phrase: "LEAGUE OF LEGENDS", category: "🎮 Videojuegos" },
  { phrase: "GRAND THEFT AUTO", category: "🎮 Videojuegos" },
  { phrase: "SUPER MARIO BROS", category: "🎮 Videojuegos" },
  { phrase: "THE WITCHER", category: "🎮 Videojuegos" },
  { phrase: "DARK SOULS", category: "🎮 Videojuegos" },
  { phrase: "RESIDENT EVIL", category: "🎮 Videojuegos" },
  { phrase: "CRASH BANDICOOT", category: "🎮 Videojuegos" },
  { phrase: "GOD OF WAR", category: "🎮 Videojuegos" },
];

export function normalizeHangmanText(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ActiveHangmanGame {
  remoteJid: string;
  item: HangmanItem;
  normalizedSecret: string;
  revealedLetters: Set<string>;
  discardedLetters: Set<string>;
  livesLeft: number;
  maxLives: number;
  reward: number;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeHangmanGames = new Map<string, ActiveHangmanGame>();

export function isHangmanGameActive(remoteJid: string): boolean {
  return activeHangmanGames.has(remoteJid);
}

export function getActiveHangman(remoteJid: string): ActiveHangmanGame | undefined {
  return activeHangmanGames.get(remoteJid);
}

const GALLOWS_STAGES: string[] = [
  // 0 fallos (6 vidas)
  "┌───┐\n│   \n│   \n│   \n┴──────",
  // 1 fallo (5 vidas - cabeza)
  "┌───┐\n│   O\n│   \n│   \n┴──────",
  // 2 fallos (4 vidas - torso)
  "┌───┐\n│   O\n│   │\n│   \n┴──────",
  // 3 fallos (3 vidas - brazo izquierdo)
  "┌───┐\n│   O\n│  /│\n│   \n┴──────",
  // 4 fallos (2 vidas - ambos brazos)
  "┌───┐\n│   O\n│  /│\\\n│   \n┴──────",
  // 5 fallos (1 vida - pierna izquierda)
  "┌───┐\n│   O\n│  /│\\\n│  / \n┴──────",
  // 6 fallos (0 vidas - muerto)
  "┌───┐\n│   💀\n│  /│\\\n│  / \\\n┴──────",
];

export function getHangmanVisual(livesLeft: number, maxLives: number = 6): string {
  const mistakes = Math.min(Math.max(0, maxLives - livesLeft), maxLives);
  return GALLOWS_STAGES[mistakes];
}

export function renderMaskedPhrase(secret: string, revealedLetters: Set<string>): string {
  const words = secret.split(" ");
  return words
    .map((word) => {
      return word
        .split("")
        .map((char) => (revealedLetters.has(char) ? char : "_"))
        .join(" ");
    })
    .join("   ");
}

export function isPhraseFullyRevealed(secret: string, revealedLetters: Set<string>): boolean {
  for (let i = 0; i < secret.length; i++) {
    const char = secret[i];
    if (char !== " " && !revealedLetters.has(char)) {
      return false;
    }
  }
  return true;
}

export function renderHangmanBoard(game: ActiveHangmanGame): string {
  const visual = getHangmanVisual(game.livesLeft, game.maxLives);
  const hearts = "❤️".repeat(game.livesLeft) + "🤍".repeat(game.maxLives - game.livesLeft);
  const masked = renderMaskedPhrase(game.normalizedSecret, game.revealedLetters);

  let discardedText = "Ninguna";
  if (game.discardedLetters.size > 0) {
    const sorted = Array.from(game.discardedLetters).sort();
    discardedText = sorted.map((l) => `~${l}~`).join(" ");
  }

  return (
    `📌 *Categoría:* ${game.item.category}\n\n` +
    `\`\`\`\n${visual}\n\`\`\`\n\n` +
    `🔤 *Frase:* \`${masked}\`\n\n` +
    `❤️ *Vidas restantes:* ${hearts} (${game.livesLeft}/${game.maxLives})\n` +
    `❌ *Letras descartadas:* ${discardedText}`
  );
}

export async function startHangmanGame(
  remoteJid: string,
  onTimeout: (game: ActiveHangmanGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveHangmanGame }> {
  if (activeHangmanGames.has(remoteJid)) {
    const cur = activeHangmanGames.get(remoteJid)!;
    return {
      success: false,
      error: `⚠️ Ya hay una partida activa de Ahorcado en este grupo (${cur.livesLeft}/${cur.maxLives} vidas restantes).\n¡Escribí una letra o arriesgá la frase!`,
    };
  }

  const item = HANGMAN_CATALOG[Math.floor(Math.random() * HANGMAN_CATALOG.length)];
  const normalizedSecret = normalizeHangmanText(item.phrase);
  const reward = Math.floor(Math.random() * 70001) + 50000; // $50.000 a $120.000 fichas

  const game: ActiveHangmanGame = {
    remoteJid,
    item,
    normalizedSecret,
    revealedLetters: new Set<string>(),
    discardedLetters: new Set<string>(),
    livesLeft: 6,
    maxLives: 6,
    reward,
    startedAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    timer: setTimeout(() => {
      const current = activeHangmanGames.get(remoteJid);
      if (current) {
        activeHangmanGames.delete(remoteJid);
        onTimeout(current).catch(() => {});
      }
    }, 5 * 60 * 1000),
  };

  activeHangmanGames.set(remoteJid, game);

  return { success: true, game };
}

export interface HangmanGuessResult {
  valid: boolean;
  error?: string;
  gameWon?: boolean;
  gameOver?: boolean;
  isLetterHit?: boolean;
  letterReward?: number;
  secretWord?: string;
  reward?: number;
  newBalance?: number;
  boardDisplay?: string;
  livesLeft?: number;
  maxLives?: number;
  guessedLetter?: string;
}

export async function submitHangmanLetter(
  remoteJid: string,
  userJid: string,
  rawLetter: string
): Promise<HangmanGuessResult> {
  const game = activeHangmanGames.get(remoteJid);
  if (!game) {
    return { valid: false, error: "No hay ninguna partida activa de Ahorcado. Iniciá una con `!ahorcado`." };
  }

  const clean = normalizeHangmanText(rawLetter);
  if (clean.length !== 1 || !/^[A-Z0-9]$/.test(clean)) {
    return { valid: false, error: "Debes enviar una sola letra (ej: `!ahorcado E` o simplemente `E`)." };
  }

  if (game.revealedLetters.has(clean) || game.discardedLetters.has(clean)) {
    return { valid: false, error: `La letra *${clean}* ya fue intentada previamente.` };
  }

  // Letra correcta
  if (game.normalizedSecret.includes(clean)) {
    game.revealedLetters.add(clean);

    const letterReward = 2000; // Micro-bonus por descubrir letra
    let newBalance = 0;

    const letterBalanceRes = await modifyBalance(userJid, letterReward);
    newBalance = letterBalanceRes.newBalance;

    // ¿Se completó la palabra/frase entera?
    if (isPhraseFullyRevealed(game.normalizedSecret, game.revealedLetters)) {
      clearTimeout(game.timer);
      activeHangmanGames.delete(remoteJid);

      const gameBalanceRes = await modifyBalance(userJid, game.reward);
      newBalance = gameBalanceRes.newBalance;

      return {
        valid: true,
        gameWon: true,
        isLetterHit: true,
        letterReward,
        secretWord: game.item.phrase,
        reward: game.reward,
        newBalance,
        boardDisplay: renderHangmanBoard({ ...game, livesLeft: game.livesLeft }),
        livesLeft: game.livesLeft,
        maxLives: game.maxLives,
        guessedLetter: clean,
      };
    }

    return {
      valid: true,
      gameWon: false,
      isLetterHit: true,
      letterReward,
      newBalance,
      boardDisplay: renderHangmanBoard(game),
      livesLeft: game.livesLeft,
      maxLives: game.maxLives,
      guessedLetter: clean,
    };
  }

  // Letra incorrecta
  game.discardedLetters.add(clean);
  game.livesLeft -= 1;

  if (game.livesLeft <= 0) {
    clearTimeout(game.timer);
    activeHangmanGames.delete(remoteJid);

    return {
      valid: true,
      gameWon: false,
      gameOver: true,
      isLetterHit: false,
      secretWord: game.item.phrase,
      boardDisplay: renderHangmanBoard({ ...game, livesLeft: 0 }),
      livesLeft: 0,
      maxLives: game.maxLives,
      guessedLetter: clean,
    };
  }

  return {
    valid: true,
    gameWon: false,
    gameOver: false,
    isLetterHit: false,
    boardDisplay: renderHangmanBoard(game),
    livesLeft: game.livesLeft,
    maxLives: game.maxLives,
    guessedLetter: clean,
  };
}

export async function submitHangmanSolve(
  remoteJid: string,
  userJid: string,
  rawAttempt: string
): Promise<HangmanGuessResult> {
  const game = activeHangmanGames.get(remoteJid);
  if (!game) {
    return { valid: false, error: "No hay ninguna partida activa de Ahorcado. Iniciá una con `!ahorcado`." };
  }

  const clean = normalizeHangmanText(rawAttempt);
  if (clean.length < 2) {
    return { valid: false, error: "Para arriesgar la solución completa, escribe al menos 2 caracteres." };
  }

  // Acierto total
  if (clean === game.normalizedSecret) {
    clearTimeout(game.timer);
    activeHangmanGames.delete(remoteJid);

    // Revelar todas las letras para el tablero final
    for (let i = 0; i < game.normalizedSecret.length; i++) {
      if (game.normalizedSecret[i] !== " ") {
        game.revealedLetters.add(game.normalizedSecret[i]);
      }
    }

    const solveBalanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = solveBalanceRes.newBalance;

    return {
      valid: true,
      gameWon: true,
      secretWord: game.item.phrase,
      reward: game.reward,
      newBalance,
      boardDisplay: renderHangmanBoard(game),
      livesLeft: game.livesLeft,
      maxLives: game.maxLives,
    };
  }

  // Fallo en arriesgar: penalización de 2 vidas
  game.livesLeft = Math.max(0, game.livesLeft - 2);

  if (game.livesLeft <= 0) {
    clearTimeout(game.timer);
    activeHangmanGames.delete(remoteJid);

    return {
      valid: true,
      gameWon: false,
      gameOver: true,
      secretWord: game.item.phrase,
      boardDisplay: renderHangmanBoard({ ...game, livesLeft: 0 }),
      livesLeft: 0,
      maxLives: game.maxLives,
    };
  }

  return {
    valid: true,
    gameWon: false,
    gameOver: false,
    error: `❌ ¡Solución incorrecta! Se restaron 2 vidas como penalización.`,
    boardDisplay: renderHangmanBoard(game),
    livesLeft: game.livesLeft,
    maxLives: game.maxLives,
  };
}
