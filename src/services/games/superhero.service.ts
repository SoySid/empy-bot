import axios from "axios";
import sharp from "sharp";
import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

export interface SuperheroData {
  id: number;
  name: string;
  slug: string;
  biography: {
    fullName: string;
    publisher: string;
    alignment: string;
    firstAppearance?: string;
  };
  appearance: {
    gender: string;
    race?: string;
  };
  images: {
    sm: string;
    md: string;
    lg: string;
  };
}

export interface ActiveSuperheroGame {
  remoteJid: string;
  characterId: number;
  name: string;
  cleanName: string;
  publisher: string;
  alignment: string;
  fullName: string;
  reward: number;
  pixelatedBuffer: Buffer;
  colorBuffer: Buffer;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeSuperheroGames = new Map<string, ActiveSuperheroGame>();
const SUPERHERO_FACT_KEY = "superheroes_v1";

// Cache de superhéroes en memoria para evitar descargar el JSON completo cada vez
let cachedSuperheroes: SuperheroData[] | null = null;

const POPULAR_HERO_BASES = [
  "spider-man", "spiderman", "batman", "superman", "iron man", "wolverine", "thor", "hulk",
  "captain america", "deadpool", "thanos", "joker", "harley quinn", "venom",
  "flash", "wonder woman", "magneto", "green lantern", "black panther", "doctor strange",
  "daredevil", "hawkeye", "black widow", "scarlet witch", "loki", "groot",
  "rocket raccoon", "star-lord", "gamora", "drax", "aquaman", "robin", "nightwing",
  "green arrow", "catwoman", "penguin", "riddler", "two-face", "bane", "scarecrow",
  "poison ivy", "deathstroke", "lex luthor", "doomsday", "brainiac", "darkseid",
  "shazam", "cyborg", "supergirl", "martian manhunter", "john constantine", "punisher",
  "ghost rider", "silver surfer", "galactus", "doctor doom", "carnage", "mysterio",
  "green goblin", "doctor octopus", "sandman", "electro", "kraven", "vulture",
  "falcon", "winter soldier", "vision", "ant-man", "wasp", "captain marvel",
  "nick fury", "cyclops", "jean grey", "storm", "beast", "rogue", "gambit",
  "professor x", "colossus", "nightcrawler", "mystique", "sabretooth", "juggernaut",
  "cable", "sinestro", "red hood", "batgirl", "superboy", "blade", "moon knight",
  "morbius", "luke cage", "iron fist", "jessica jones", "bullseye", "kingpin",
  "elektra", "ultron", "kang", "war machine", "nebula", "mantis", "yondu",
  "valkyrie", "hela", "odin", "killmonger", "namor", "she-hulk", "shang-chi",
  "ms marvel", "hellboy", "spawn", "raven", "starfire", "beast boy", "constantine",
  "black adam", "doctor fate", "zatanna", "red tornado", "bizarro", "general zod",
  "batwoman", "huntress", "black canary", "hawkgirl", "hawkman", "atom", "firestorm",
  "swamp thing", "apocalypse", "archangel", "bishop", "iceman", "quicksilver",
  "abomination", "modok", "taskmaster", "crossbones", "zemo", "red skull",
  "gorr", "knull", "ronan", "korg", "adam warlock", "beta ray bill"
];

const SPANISH_ALIASES: Record<string, string[]> = {
  "spiderman": ["hombre arana", "el hombre arana", "peter parker", "miles morales", "spider man", "hombre araña", "el hombre araña"],
  "ironman": ["hombre de hierro", "el hombre de hierro", "tony stark", "iron man"],
  "batman": ["el caballero de la noche", "bruce wayne", "bat man"],
  "superman": ["el hombre de acero", "clark kent", "kal-el", "kal el", "super man"],
  "wonderwoman": ["mujer maravilla", "la mujer maravilla", "diana prince", "wonder woman"],
  "wolverine": ["lobezno", "guepardo", "logan", "james howlett"],
  "captainamerica": ["capitan america", "el capitan america", "steve rogers", "captain america"],
  "flash": ["barry allen", "wally west", "el corredor escarlata"],
  "greenlantern": ["linterna verde", "hal jordan", "john stewart", "green lantern"],
  "blackwidow": ["viuda negra", "la viuda negra", "natasha romanoff", "black widow"],
  "hawkeye": ["ojo de halcon", "clint barton", "hawkeye"],
  "scarletwitch": ["bruja escarlata", "la bruja escarlata", "wanda maximoff", "scarlet witch"],
  "doctorstrange": ["dr strange", "stephen strange", "doctor strange", "dr extraño", "doctor extrano"],
  "antman": ["hombre hormiga", "el hombre hormiga", "scott lang", "hank pym", "ant man"],
  "deadpool": ["wade wilson", "masacre"],
  "daredevil": ["matt murdock", "el hombre sin miedo"],
  "punisher": ["el castigador", "castigador", "frank castle"],
  "joker": ["el guason", "guason", "el bromas"],
  "harleyquinn": ["harley", "harleen quinzel"],
  "poisonivy": ["hiedra venenosa", "poison ivy", "pamela isley"],
  "catwoman": ["gatubela", "selina kyle", "cat woman"],
  "greenarrow": ["flecha verde", "oliver queen", "green arrow"],
  "cyborg": ["victor stone"],
  "aquaman": ["arthur curry", "aqua man"],
  "robin": ["dick grayson", "tim drake", "damian wayne"],
  "nightwing": ["ala nocturna", "dick grayson"],
  "martianmanhunter": ["detective marciano", "j'onn j'onzz", "jonn jonzz"],
  "supergirl": ["kara zor-el", "kara danvers"],
  "starlord": ["peter quill", "star lord"],
  "doctoroctopus": ["dr octopus", "doc ock", "otto octavius", "doctor pulpo"],
  "greengoblin": ["duende verde", "el duende verde", "norman osborn"],
  "wintersoldier": ["soldado del invierno", "el soldado del invierno", "bucky barnes"],
  "captainmarvel": ["capitana marvel", "carol danvers", "shazam"],
  "magneto": ["erik lehnsherr", "max eisenhardt"],
  "professorx": ["profesor x", "charles xavier"],
  "doctorfate": ["dr fate", "doctor destino", "kent nelson"],
  "blackpanther": ["pantera negra", "t'challa", "tchalla"],
  "twoface": ["dos caras", "harvey dent"],
  "riddler": ["el acertijo", "acertijo", "edward nygma"],
  "penguin": ["el pinguino", "pinguino", "oswald cobblepot"],
  "scarecrow": ["el espantapajaros", "espantapajaros", "jonathan crane"],
  "redskull": ["craneo rojo", "johann shmidt"],
  "batgirl": ["barbara gordon", "batichica"],
  "batwoman": ["kate kane"],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function cleanHeroBase(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i, "")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

async function loadSuperheroes(): Promise<SuperheroData[]> {
  if (cachedSuperheroes && cachedSuperheroes.length > 0) {
    return cachedSuperheroes;
  }

  try {
    const res = await axios.get("https://akabab.github.io/superhero-api/api/all.json", {
      timeout: 10000,
    });
    const all: SuperheroData[] = res.data;

    const cleanPopular = POPULAR_HERO_BASES.map(normalizeString);

    // Filtrar personajes reconocibles de Marvel, DC y Dark Horse
    cachedSuperheroes = all.filter((h) => {
      if (!h.images?.md || !h.name) return false;
      const pub = h.biography?.publisher || "";
      if (!["Marvel Comics", "DC Comics", "Dark Horse Comics"].includes(pub)) return false;

      const baseClean = normalizeString(cleanHeroBase(h.name));
      return cleanPopular.some((p) => baseClean === p || baseClean.includes(p) || p.includes(baseClean));
    });

    if (cachedSuperheroes.length === 0) {
      cachedSuperheroes = all.filter((h) => h.images?.md && h.name);
    }

    return cachedSuperheroes;
  } catch (err) {
    console.error("[Superhero API Error]:", err);
    return [];
  }
}

export function isSuperheroGameActive(remoteJid: string): boolean {
  return activeSuperheroGames.has(remoteJid);
}

export async function startSuperheroGame(
  remoteJid: string,
  onTimeout: (game: ActiveSuperheroGame) => Promise<void>
): Promise<{ success: boolean; error?: string; game?: ActiveSuperheroGame }> {
  if (activeSuperheroGames.has(remoteJid)) {
    return {
      success: false,
      error: "⚠️ Ya hay una partida activa de *Superhéroes* en el grupo. ¡Adivinen antes de pedir otro!",
    };
  }

  const list = await loadSuperheroes();
  if (list.length === 0) {
    return { success: false, error: "No se pudo cargar la base de superhéroes. Reintentá en unos segundos." };
  }

  const character = list[Math.floor(Math.random() * list.length)];
  const rawName = character.name;
  const cleanName = normalizeString(cleanHeroBase(rawName));

  try {
    // Descargar imagen oficial
    const imgRes = await axios.get(character.images.md || character.images.lg, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    const colorBuffer = Buffer.from(imgRes.data);

    // Pixelado misterioso con sharp: reducir a 18x18 y reescalar a 320x320 con nearest neighbor
    const pixelatedBuffer = await sharp(colorBuffer)
      .resize(18, 18, { kernel: "nearest" })
      .resize(320, 320, { kernel: "nearest" })
      .png()
      .toBuffer();

    const reward = Math.floor(Math.random() * 10001) + 10000; // $10.000 a $20.000 fichas

    const game: ActiveSuperheroGame = {
      remoteJid,
      characterId: character.id,
      name: rawName,
      cleanName,
      publisher: character.biography.publisher || "Cómics",
      alignment: character.biography.alignment === "bad" ? "Villano / Antihéroe 🦹" : "Superhéroe 🦸",
      fullName: character.biography.fullName || "Identidad Clasificada",
      reward,
      pixelatedBuffer,
      colorBuffer,
      startedAt: Date.now(),
      expiresAt: Date.now() + 60 * 1000,
      timer: setTimeout(() => {
        const cur = activeSuperheroGames.get(remoteJid);
        if (cur) {
          activeSuperheroGames.delete(remoteJid);
          onTimeout(cur).catch(() => {});
        }
      }, 60 * 1000),
    };

    activeSuperheroGames.set(remoteJid, game);

    return { success: true, game };
  } catch (err: any) {
    console.error("[Superhero Image Error]:", err?.message || err);
    return { success: false, error: "Error al procesar la imagen del héroe. Intentá de nuevo." };
  }
}

export async function checkSuperheroGuess(
  remoteJid: string,
  userJid: string,
  guessText: string
): Promise<{
  matched: boolean;
  game?: ActiveSuperheroGame;
  reward?: number;
  newBalance?: number;
  isNewCapture?: boolean;
  totalCaptured?: number;
}> {
  const game = activeSuperheroGames.get(remoteJid);
  if (!game) return { matched: false };

  const cleanGuess = normalizeString(guessText);
  if (!cleanGuess || cleanGuess.length < 3) return { matched: false };

  const baseName = cleanHeroBase(game.name);
  const baseClean = normalizeString(baseName);
  const rawClean = normalizeString(game.name);
  const fullNameClean = normalizeString(game.fullName || "");

  const validTargets = new Set<string>();
  if (baseClean) validTargets.add(baseClean);
  if (rawClean) validTargets.add(rawClean);
  if (fullNameClean && fullNameClean.length >= 4) validTargets.add(fullNameClean);

  const aliases = [
    ...(SPANISH_ALIASES[baseClean] || []),
    ...(SPANISH_ALIASES[rawClean] || []),
  ];
  for (const alias of aliases) {
    const na = normalizeString(alias);
    if (na) validTargets.add(na);
  }

  let isMatch = false;
  for (const target of validTargets) {
    if (cleanGuess === target) {
      isMatch = true;
      break;
    }
    if (
      cleanGuess.length >= 5 &&
      target.length >= 5 &&
      Math.abs(cleanGuess.length - target.length) <= 1 &&
      levenshteinDistance(cleanGuess, target) <= 1
    ) {
      isMatch = true;
      break;
    }
  }

  if (isMatch) {
    clearTimeout(game.timer);
    activeSuperheroGames.delete(remoteJid);

    const balanceRes = await modifyBalance(userJid, game.reward);
    const newBalance = balanceRes.newBalance;

    let isNewCapture = false;
    let totalCaptured = 0;
    try {
      const fact = await prisma.userFact.findUnique({
        where: { userJid_clave: { userJid, clave: SUPERHERO_FACT_KEY } },
      });
      let heroList: string[] = fact?.valor ? JSON.parse(fact.valor) : [];
      if (!heroList.includes(game.name)) {
        heroList.push(game.name);
        isNewCapture = true;
      }
      totalCaptured = heroList.length;

      await prisma.userFact.upsert({
        where: { userJid_clave: { userJid, clave: SUPERHERO_FACT_KEY } },
        create: {
          userJid,
          clave: SUPERHERO_FACT_KEY,
          valor: JSON.stringify(heroList),
          tipo: "PERMANENTE",
        },
        update: { valor: JSON.stringify(heroList) },
      });
    } catch (err) {
      console.error("[Superhero Collection Error]:", err);
    }

    return {
      matched: true,
      game,
      reward: game.reward,
      newBalance,
      isNewCapture,
      totalCaptured,
    };
  }

  return { matched: false };
}

export async function getUserSuperheroes(userJid: string): Promise<{ total: number; list: string[] }> {
  try {
    const fact = await prisma.userFact.findUnique({
      where: { userJid_clave: { userJid, clave: SUPERHERO_FACT_KEY } },
    });
    if (fact?.valor) {
      const list: string[] = JSON.parse(fact.valor);
      return { total: list.length, list };
    }
  } catch (err) {
    console.error("[getUserSuperheroes Error]:", err);
  }
  return { total: 0, list: [] };
}
