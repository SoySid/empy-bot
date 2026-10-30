import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

function normalizeWord(word: string): string {
  return word
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "")
    .trim();
}

export const WORDLE_DICTIONARY = [
  "ABRIL", "ABRIR", "ACTOR", "AFANO", "AGUAS", "AMIGA", "AMIGO", "ANCLA",
  "ANDAR", "ARBOL", "ARENA", "ARMAS", "ARROZ", "ASADO", "AUTOR", "AUTOS",
  "AVION", "BAGRE", "BAILE", "BAJAR", "BAJOS", "BALAS", "BALDE", "BANCO",
  "BANDA", "BANDO", "BANOS", "BARBA", "BARCO", "BARDO", "BARRO", "BEBER",
  "BEBES", "BIRRA", "BOCAS", "BOCHA", "BOLSA", "BOLSO", "BOMBA", "BOMBI",
  "BONDI", "BOTAS", "BOTES", "BRAVA", "BRAVO", "BRAZO", "BRISA", "BUENA",
  "BUENO", "CABLE", "CABOS", "CAFES", "CAIDA", "CAJAS", "CALLE", "CALMA",
  "CALOR", "CAMAS", "CAMPO", "CANAL", "CANAS", "CANOE", "CANTO", "CAPOS",
  "CARAS", "CAREY", "CARNE", "CARRO", "CARTA", "CASAS", "CEBOS", "CEJAS",
  "CERDO", "CERRO", "CHAMU", "CHANO", "CHAPA", "CHATA", "CHETA", "CHETO",
  "CHICA", "CHICO", "CHINO", "CHIPA", "CHORI", "CHORO", "CHUCH", "CIELO",
  "CINES", "CIRCO", "CLARA", "CLARO", "CLASE", "CLAVO", "CLIMA", "COBRE",
  "COBRO", "COCER", "COCHE", "CODOS", "COLOR", "COMER", "COPAS", "COROS",
  "CORRE", "CORTE", "CORTO", "CRACK", "CREAR", "CREER", "CREMA", "CULPA",
  "DANZA", "DECIR", "DEDOS", "DEPTO", "DEUDA", "DISCO", "DRAMA", "DUCHA",
  "DULCE", "DUNAS", "DUROS", "ENERO", "ENTRA", "ENVIO", "FACHA", "FACHO",
  "FALTA", "FANGO", "FAROL", "FAROS", "FECHA", "FELIZ", "FERIA", "FERNE",
  "FEROZ", "FIACA", "FIECA", "FINDE", "FINOS", "FIRMA", "FLOTA", "FOCOS",
  "FONDO", "FORMA", "FOTOS", "FRASE", "FRENO", "FRESA", "FRIOS", "FRUTA",
  "FUEGO", "FUMAR", "GAMBA", "GANAR", "GARRA", "GASTO", "GATOS", "GENIO",
  "GENTE", "GESTO", "GIRAR", "GLOBO", "GOMAS", "GORRA", "GORRO", "GOTAS",
  "GRITO", "GROSA", "GROSO", "GRUPO", "GUACH", "GUIAR", "GUIAS", "GUION",
  "GUISO", "GUITA", "HIELO", "HIJAS", "HIJOS", "HOJAS", "HONOR", "HORAS",
  "HORNO", "HOTEL", "HUESO", "HUMOS", "IGUAL", "ISLAS", "JABON", "JOVEN",
  "JUEGO", "JULIO", "JUNAR", "JUNIO", "LABIO", "LAGOS", "LAPIZ", "LARGO",
  "LAVAR", "LETRA", "LEYES", "LIBRE", "LIBRO", "LIMON", "LINDA", "LINDO",
  "LINEA", "LISTA", "LLAMA", "LLAVE", "LLENO", "LOCAS", "LOCOS", "LOMOS",
  "LOMPA", "LUCAZ", "LUCES", "LUNAS", "LUNES", "MACAN", "MADRE", "MAGIA",
  "MAMBO", "MANDI", "MANGA", "MANGO", "MANIS", "MANOS", "MANSO", "MANTE",
  "MAPAS", "MAREA", "MARES", "MARTE", "MARZO", "MATES", "MAYOR", "MAYOS",
  "MEDIO", "MEJOR", "MELON", "MENOR", "MENOS", "MENTE", "MESAS", "MESES",
  "MICRO", "MINAS", "MINON", "MIRAR", "MONTE", "MORFI", "MORIR", "MORSA",
  "MOTOR", "MOTOS", "MOUSE", "MUCHO", "MUELA", "MULTA", "MUNDO", "MUROS",
  "MUSLO", "NARIZ", "NAVES", "NEGRO", "NIEVE", "NINAS", "NINOS", "NOCHE",
  "NORTE", "NOTAS", "NUEVA", "NUEVO", "OESTE", "OLLAS", "OREJA", "ORTOS",
  "OTONO", "PADRE", "PAGOS", "PALAS", "PALMA", "PALOS", "PAPEL", "PARAR",
  "PARCA", "PARED", "PARRI", "PASOS", "PASTA", "PASTO", "PATIO", "PAVOS",
  "PECES", "PECHO", "PELOS", "PELPA", "PENAS", "PERAS", "PERRO", "PESCA",
  "PETES", "PIANO", "PIBES", "PICHO", "PICHU", "PINGO", "PINTA", "PIOLA",
  "PIQUE", "PISOS", "PISTA", "PIZZA", "PLANO", "PLATA", "PLATO", "PLAYA",
  "PLAZA", "PLUMA", "POBRE", "POCOS", "PODER", "POETA", "POLVO", "POPAS",
  "PORRO", "POSTA", "PRIMA", "PRIMO", "PROAS", "PROSA", "PUCHO", "PUNTA",
  "PUNTO", "QUESO", "QUILM", "RADIO", "RANCH", "RATON", "RAYOS", "REDES",
  "REGLA", "REINA", "REINO", "RELOJ", "REMOS", "REYES", "RIMAS", "RISAS",
  "RITMO", "RIVAL", "ROCAS", "ROJOS", "RONCA", "ROPAS", "RUBIO", "RUEDA",
  "RUIDO", "RUTAS", "SABER", "SABIO", "SACOS", "SALIR", "SALTO", "SECAR",
  "SECOS", "SELLO", "SELVA", "SENDA", "SENOR", "SERIE", "SERIO", "SHOWS",
  "SIGLO", "SILLA", "SOBRA", "SOBRE", "SOCIO", "SOLAR", "SOSIO", "SUAVE",
  "SUBIR", "SUBTE", "SUELO", "SUENO", "SURCO", "TABLA", "TANGO", "TANTO",
  "TARDE", "TARRO", "TAZAS", "TECHO", "TECLA", "TEJAS", "TEMAS", "TEMPO",
  "TERMO", "TEXTO", "TIGRE", "TIMON", "TINTA", "TINTO", "TIROS", "TOCAR",
  "TOMOS", "TONOS", "TOQUE", "TORRE", "TOTAL", "TRABA", "TRAJE", "TROLA",
  "TROLO", "TRUCO", "TURRA", "TURRO", "UNICO", "VACIO", "VALIO", "VALLE",
  "VAPOR", "VASOS", "VELAS", "VERDE", "VERSO", "VIAJE", "VIDEO", "VIEJA",
  "VIEJO", "VILLA", "VIOLA", "VIVIR", "VOCES", "VOLAR", "VOZON", "YERBA",
  "ZANJA", "ZAPAN", "ZURDA", "ZURDO",
];

// Filtrar y normalizar estrictamente solo palabras de 5 letras
export const VALID_5_WORDS = WORDLE_DICTIONARY
  .map(normalizeWord)
  .filter((w) => w.length === 5);

export interface WordleAttempt {
  word: string;
  resultEmojis: string;
  playerName: string;
}

export interface ActiveWordleGame {
  remoteJid: string;
  secretWord: string;
  attempts: WordleAttempt[];
  maxAttempts: number;
  reward: number;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeWordleGames = new Map<string, ActiveWordleGame>();

export function isWordleGameActive(remoteJid: string): boolean {
  return activeWordleGames.has(remoteJid);
}

export function getActiveWordle(remoteJid: string): ActiveWordleGame | undefined {
  return activeWordleGames.get(remoteJid);
}

export function evaluateGuess(guess: string, secret: string): string {
  const result: string[] = ["⬛", "⬛", "⬛", "⬛", "⬛"];
  const secretLetters = secret.split("");
  const guessLetters = guess.split("");

  // Pase 1: Verdes (exactos)
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = "🟩";
      secretLetters[i] = ""; // Consumida
      guessLetters[i] = "";
    }
  }

  // Pase 2: Amarillos (posición incorrecta)
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] && secretLetters.includes(guessLetters[i])) {
      result[i] = "🟨";
      const idx = secretLetters.indexOf(guessLetters[i]);
      secretLetters[idx] = ""; // Consumida
    }
  }

  return result.join("");
}

export function renderWordleBoard(attempts: WordleAttempt[], maxAttempts: number = 6): string {
  const lines: string[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    if (i < attempts.length) {
      const a = attempts[i];
      lines.push(`${i + 1}. ${a.resultEmojis} \`${a.word}\` _(${a.playerName})_`);
    } else {
      lines.push(`${i + 1}. ▫️▫️▫️▫️▫️`);
    }
  }
  return lines.join("\n");
}

export function getLettersStatus(attempts: WordleAttempt[], secretWord: string): string {
  if (attempts.length === 0) return "";

  const allGuessed = new Set<string>();
  const correctLetters = new Set<string>();

  for (const att of attempts) {
    for (let i = 0; i < att.word.length; i++) {
      const letter = att.word[i];
      allGuessed.add(letter);
      if (letter === secretWord[i]) {
        correctLetters.add(letter);
      }
    }
  }

  const presentLetters = new Set<string>();
  const discardedLetters: string[] = [];

  for (const letter of allGuessed) {
    if (secretWord.includes(letter)) {
      if (!correctLetters.has(letter)) {
        presentLetters.add(letter);
      }
    } else {
      discardedLetters.push(letter);
    }
  }

  discardedLetters.sort();
  const correctSorted = Array.from(correctLetters).sort();
  const presentSorted = Array.from(presentLetters).sort();

  const sections: string[] = ["🔤 *ESTADO DE LETRAS:*"];

  if (correctSorted.length > 0) {
    sections.push(`🟩 *Correctas (bien ubicadas):* ${correctSorted.join(", ")}`);
  }
  if (presentSorted.length > 0) {
    sections.push(`🟨 *En la palabra (mal ubicadas):* ${presentSorted.join(", ")}`);
  }
  if (discardedLetters.length > 0) {
    const struck = discardedLetters.map((l) => `~${l}~`).join(" ");
    sections.push(`❌ *Incorrectas (no están):* ${struck}`);
  }

  return sections.join("\n");
}

export async function startWordleGame(
  remoteJid: string,
  onTimeout: (game: ActiveWordleGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveWordleGame }> {
  if (activeWordleGames.has(remoteJid)) {
    const cur = activeWordleGames.get(remoteJid)!;
    return {
      success: false,
      error: `⚠️ Ya hay una partida activa de Wordle en este grupo (${cur.attempts.length}/${cur.maxAttempts} intentos).\n¡Escriban una palabra de 5 letras para adivinar!`,
    };
  }

  const secretWord = VALID_5_WORDS[Math.floor(Math.random() * VALID_5_WORDS.length)];
  const reward = Math.floor(Math.random() * 100001) + 100000; // $100.000 a $200.000 fichas

  const game: ActiveWordleGame = {
    remoteJid,
    secretWord,
    attempts: [],
    maxAttempts: 6,
    reward,
    startedAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos
    timer: setTimeout(() => {
      const current = activeWordleGames.get(remoteJid);
      if (current) {
        activeWordleGames.delete(remoteJid);
        onTimeout(current).catch(() => {});
      }
    }, 5 * 60 * 1000),
  };

  activeWordleGames.set(remoteJid, game);

  return { success: true, game };
}

export interface WordleGuessResult {
  valid: boolean;
  error?: string;
  gameWon?: boolean;
  gameOver?: boolean;
  secretWord?: string;
  reward?: number;
  newBalance?: number;
  gridDisplay?: string;
  lettersStatus?: string;
  attemptNumber?: number;
  maxAttempts?: number;
}

export async function submitWordleGuess(
  remoteJid: string,
  userJid: string,
  userName: string,
  rawGuess: string
): Promise<WordleGuessResult> {
  const game = activeWordleGames.get(remoteJid);
  if (!game) {
    return { valid: false, error: "No hay ninguna partida activa de Wordle en este grupo. Iniciá una con `!wordle`." };
  }

  const guess = normalizeWord(rawGuess);
  if (guess.length !== 5) {
    return { valid: false, error: "La palabra debe tener exactamente 5 letras." };
  }

  // Evaluar emojis
  const resultEmojis = evaluateGuess(guess, game.secretWord);
  game.attempts.push({
    word: guess,
    resultEmojis,
    playerName: userName,
  });

  const fullGridDisplay = game.attempts
    .map((a, i) => `${i + 1}. ${a.resultEmojis} \`${a.word}\` _(${a.playerName})_`)
    .join("\n");

  // Victoria
  if (guess === game.secretWord) {
    clearTimeout(game.timer);
    activeWordleGames.delete(remoteJid);

    const balanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = balanceRes.newBalance;

    return {
      valid: true,
      gameWon: true,
      secretWord: game.secretWord,
      reward: game.reward,
      newBalance,
      gridDisplay: fullGridDisplay,
      attemptNumber: game.attempts.length,
      maxAttempts: game.maxAttempts,
    };
  }

  // Derrota por intentos agotados
  if (game.attempts.length >= game.maxAttempts) {
    clearTimeout(game.timer);
    activeWordleGames.delete(remoteJid);

    return {
      valid: true,
      gameWon: false,
      gameOver: true,
      secretWord: game.secretWord,
      gridDisplay: fullGridDisplay,
      attemptNumber: game.attempts.length,
      maxAttempts: game.maxAttempts,
    };
  }

  // Continúa la partida
  const boardDisplay = renderWordleBoard(game.attempts, game.maxAttempts);
  const lettersStatus = getLettersStatus(game.attempts, game.secretWord);

  return {
    valid: true,
    gameWon: false,
    gameOver: false,
    gridDisplay: boardDisplay,
    lettersStatus,
    attemptNumber: game.attempts.length,
    maxAttempts: game.maxAttempts,
  };
}
