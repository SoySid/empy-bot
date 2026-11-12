import { WASocket } from "@whiskeysockets/baileys";
import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";

export interface ImpostorPlayer {
  index: number;
  userJid: string;
  userName: string;
}

export interface ActiveImpostorGame {
  chatJid: string;
  status: "lobby" | "playing";
  startedAt: number;
  lobbyTimer: NodeJS.Timeout;
  players: Map<string, ImpostorPlayer>;
  impostorJid: string;
  category: string;
  secretWord: string;
  votes: Map<string, string>; // voterJid -> targetJid
}

interface WordBankEntry {
  category: string;
  words: string[];
}

const WORD_BANK: WordBankEntry[] = [
  {
    category: "Comidas y Bebidas",
    words: [
      "Asado", "Empanada", "Milanesa", "Pizza", "Sushi", "Tacos",
      "Hamburguesa", "Choripán", "Dulce de leche", "Mate", "Fernet", "Helado",
    ],
  },
  {
    category: "Países",
    words: [
      "Argentina", "Brasil", "Japón", "Italia", "México", "España",
      "Francia", "Egipto", "Estados Unidos", "Australia", "Alemania", "Corea del Sur",
    ],
  },
  {
    category: "Animales",
    words: [
      "Carpincho", "Pingüino", "Tiburón", "Águila", "Elefante", "Camaleón",
      "Pulpo", "Canguro", "Lobo", "Delfín", "Murciélago", "Panda",
    ],
  },
  {
    category: "Películas y Series",
    words: [
      "Titanic", "Matrix", "Toy Story", "Breaking Bad", "Stranger Things",
      "El Padrino", "Harry Potter", "Star Wars", "Shrek", "Los Simpson", "Batman", "Avatar",
    ],
  },
  {
    category: "Videojuegos",
    words: [
      "Minecraft", "GTA V", "Fortnite", "Counter-Strike", "FIFA", "League of Legends",
      "Among Us", "Mario Bros", "Pokémon", "God of War", "Valorant", "The Sims",
    ],
  },
  {
    category: "Profesiones",
    words: [
      "Bombero", "Astronauta", "Chef", "Cirujano", "Programador", "Detective",
      "Piloto", "Arquitecto", "Periodista", "Veterinario", "Abogado", "Mago",
    ],
  },
  {
    category: "Deportes",
    words: [
      "Fútbol", "Básquet", "Tenis", "Boxeo", "Natación", "Fórmula 1",
      "Rugby", "Vóley", "Golf", "Surf", "Ciclismo", "Ajedrez",
    ],
  },
  {
    category: "Objetos Cotidianos",
    words: [
      "Paraguas", "Espejo", "Auriculares", "Linterna", "Mochila", "Reloj",
      "Sartén", "Tijera", "Teclado", "Almohada", "Llave", "Bicicleta",
    ],
  },
];

const INNOCENT_REWARD = 15000;
const IMPOSTOR_REWARD = 35000;
const MIN_PLAYERS = 3;
const LOBBY_DURATION_MS = 30000;

const activeImpostorGames = new Map<string, ActiveImpostorGame>();

function normalizeText(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function formatMention(jid: string): string {
  return `@${jid.split("@")[0].split(":")[0]}`;
}

async function creditReward(userJid: string, amount: number): Promise<void> {
  try {
    const user = await resolveOrRegisterUser(userJid);
    await withWriteLock(async () => {
      await prisma.userProfile.update({
        where: { id: user.id },
        data: { balance: { increment: amount } },
      });
    });
  } catch (err) {
    console.error(`[Impostor Reward Error] Error al acreditar a ${userJid}:`, err);
  }
}

export function isImpostorGameActive(chatJid: string): boolean {
  return activeImpostorGames.has(chatJid);
}

export function getActiveImpostorGame(chatJid: string): ActiveImpostorGame | undefined {
  return activeImpostorGames.get(chatJid);
}

export function startImpostorLobby(
  chatJid: string,
  initiatorJid: string,
  initiatorName: string,
  sock: WASocket
): { success: boolean; error?: string } {
  if (!chatJid.endsWith("@g.us")) {
    return {
      success: false,
      error: "⚠️ *El Impostor* solo se puede jugar en grupos.",
    };
  }

  if (activeImpostorGames.has(chatJid)) {
    const existing = activeImpostorGames.get(chatJid)!;
    if (existing.status === "lobby") {
      return {
        success: false,
        error: "⚠️ Ya hay una convocatoria abierta para El Impostor. ¡Escribí `!unirme` para sumarte!",
      };
    }
    return {
      success: false,
      error: "⚠️ Ya hay una partida de El Impostor en curso en este grupo. Podés cerrarla con `!impostor terminar`.",
    };
  }

  const players = new Map<string, ImpostorPlayer>();
  players.set(initiatorJid, {
    index: 1,
    userJid: initiatorJid,
    userName: initiatorName,
  });

  const lobbyTimer = setTimeout(async () => {
    await launchImpostorRound(chatJid, sock);
  }, LOBBY_DURATION_MS);

  activeImpostorGames.set(chatJid, {
    chatJid,
    status: "lobby",
    startedAt: Date.now(),
    lobbyTimer,
    players,
    impostorJid: "",
    category: "",
    secretWord: "",
    votes: new Map<string, string>(),
  });

  return { success: true };
}

export function joinImpostorGame(
  chatJid: string,
  userJid: string,
  userName: string
): { success: boolean; error?: string; totalPlayers?: number } {
  const game = activeImpostorGames.get(chatJid);
  if (!game || game.status !== "lobby") {
    return {
      success: false,
      error: "⚠️ No hay ninguna convocatoria abierta de El Impostor para unirse.",
    };
  }

  if (game.players.has(userJid)) {
    return {
      success: false,
      error: "⚠️ Ya estás anotado en esta partida de El Impostor.",
    };
  }

  const nextIndex = game.players.size + 1;
  game.players.set(userJid, {
    index: nextIndex,
    userJid,
    userName,
  });

  return { success: true, totalPlayers: game.players.size };
}

async function launchImpostorRound(chatJid: string, sock: WASocket): Promise<void> {
  const game = activeImpostorGames.get(chatJid);
  if (!game || game.status !== "lobby") return;

  if (game.players.size < MIN_PLAYERS) {
    activeImpostorGames.delete(chatJid);
    await sock
      .sendMessage(chatJid, {
        text: `⏱️ *¡CONVOCATORIA FINALIZADA!* 🛑\n\n⚠️ *Partida cancelada:* Se requieren al menos *${MIN_PLAYERS} jugadores* para jugar a El Impostor.`,
      })
      .catch(() => {});
    return;
  }

  const bankEntry = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  const secretWord = bankEntry.words[Math.floor(Math.random() * bankEntry.words.length)];
  const playersList = Array.from(game.players.values());
  const impostor = playersList[Math.floor(Math.random() * playersList.length)];

  game.status = "playing";
  game.category = bankEntry.category;
  game.secretWord = secretWord;
  game.impostorJid = impostor.userJid;

  for (const player of playersList) {
    const isImpostor = player.userJid === game.impostorJid;
    const dmText = isImpostor
      ? `🕵️ *EL IMPOSTOR (Tu rol secreto)* 🎭\n\n` +
        `🚨 *¡SOS EL IMPOSTOR!* 🚨\n` +
        `• *Categoría:* ${game.category}\n` +
        `• *Tu palabra:* ❓ _(Desconocida — tenés que disimular)_\n\n` +
        `💡 Escuchá las pistas en el grupo y tirá una coherente con la categoría para que no te descubran.\n` +
        `🎯 Si deducís la palabra exacta, podés robar la victoria con:\n` +
        `\`!impostor adivinar <palabra>\``
      : `🕵️ *EL IMPOSTOR (Tu rol secreto)* 🎭\n\n` +
        `✅ *SOS INOCENTE*\n` +
        `• *Categoría:* ${game.category}\n` +
        `• *Palabra secreta:* *${game.secretWord}*\n\n` +
        `💡 Tirá una pista sutil en el grupo sin regalar la palabra para descubrir quién no la sabe.\n` +
        `🗳️ Cuando estén listos, voten en el grupo con \`!votar @usuario\` o \`!votar <número>\`.`;

    try {
      await sock.sendMessage(player.userJid, { text: dmText });
    } catch (err) {
      console.warn(`[Impostor DM Error] No se pudo enviar privado a ${player.userJid}:`, err);
    }
  }

  const mentions = playersList.map((p) => p.userJid);
  const numberedList = playersList
    .map((p) => `*${p.index}.* ${formatMention(p.userJid)}`)
    .join("\n");

  const groupText =
    `🕵️ *¡EL IMPOSTOR HA COMENZADO!* 🎭\n\n` +
    `📂 *Categoría:* *${game.category}*\n` +
    `📩 *Los roles y la palabra secreta ya se enviaron por privado.*\n\n` +
    `👥 *Jugadores (${playersList.length}):*\n` +
    `${numberedList}\n\n` +
    `🗣️ *Debate sin límite de tiempo:* Tiren sus pistas en el grupo y encuentren al que miente.\n` +
    `🗳️ *Votar:* \`!votar @usuario\` o \`!votar <número>\`\n` +
    `🕵️ *Impostor:* Podés arriesgar la palabra con \`!impostor adivinar <palabra>\`\n` +
    `🛑 *¿Se desconectó alguien?* Usen \`!impostor cerrar\` (resuelve con los votos actuales) o \`!terminarimpostor\` (anula la partida).`;

  await sock.sendMessage(chatJid, { text: groupText, mentions }).catch(() => {});
}

export async function castImpostorVote(
  chatJid: string,
  voterJid: string,
  targetInput: { mentionedJid?: string; playerNumber?: number },
  sock: WASocket
): Promise<{
  success: boolean;
  error?: string;
  targetJid?: string;
  votesCount?: number;
  totalPlayers?: number;
  resolved?: boolean;
}> {
  const game = activeImpostorGames.get(chatJid);
  if (!game || game.status !== "playing") {
    return {
      success: false,
      error: "⚠️ No hay ninguna partida activa de El Impostor en este grupo.",
    };
  }

  if (!game.players.has(voterJid)) {
    return {
      success: false,
      error: "⚠️ No estás participando en esta partida de El Impostor.",
    };
  }

  let targetPlayer: ImpostorPlayer | undefined;
  if (targetInput.mentionedJid) {
    targetPlayer = game.players.get(targetInput.mentionedJid);
  } else if (targetInput.playerNumber !== undefined) {
    targetPlayer = Array.from(game.players.values()).find(
      (p) => p.index === targetInput.playerNumber
    );
  }

  if (!targetPlayer) {
    return {
      success: false,
      error: "⚠️ Jugador no encontrado en la partida. Usá `!votar @usuario` o `!votar <número>`.",
    };
  }

  if (targetPlayer.userJid === voterJid) {
    return {
      success: false,
      error: "⚠️ No podés votarte a vos mismo.",
    };
  }

  game.votes.set(voterJid, targetPlayer.userJid);

  const votesCount = game.votes.size;
  const totalPlayers = game.players.size;

  if (votesCount >= totalPlayers) {
    await resolveImpostorByVotes(chatJid, sock);
    return {
      success: true,
      targetJid: targetPlayer.userJid,
      votesCount,
      totalPlayers,
      resolved: true,
    };
  }

  return {
    success: true,
    targetJid: targetPlayer.userJid,
    votesCount,
    totalPlayers,
    resolved: false,
  };
}

export async function guessImpostorSecretWord(
  chatJid: string,
  playerJid: string,
  guessRaw: string,
  sock: WASocket
): Promise<{ success: boolean; error?: string }> {
  const game = activeImpostorGames.get(chatJid);
  if (!game || game.status !== "playing") {
    return {
      success: false,
      error: "⚠️ No hay ninguna partida activa de El Impostor.",
    };
  }

  if (!game.players.has(playerJid)) {
    return {
      success: false,
      error: "⚠️ No estás participando en esta partida.",
    };
  }

  if (playerJid !== game.impostorJid) {
    return {
      success: false,
      error: "⚠️ Solo el Impostor puede usar este comando para intentar robar la palabra.",
    };
  }

  const normalizedGuess = normalizeText(guessRaw);
  const normalizedSecret = normalizeText(game.secretWord);

  if (!normalizedGuess) {
    return {
      success: false,
      error: "⚠️ Tenés que escribir una palabra. Ejemplo: `!impostor adivinar pizza`",
    };
  }

  activeImpostorGames.delete(chatJid);
  const playersList = Array.from(game.players.values());
  const mentions = playersList.map((p) => p.userJid);

  if (normalizedGuess === normalizedSecret) {
    await creditReward(game.impostorJid, IMPOSTOR_REWARD);
    const text =
      `🕵️ *¡EL IMPOSTOR ROBÓ LA PARTIDA!* 🎭\n\n` +
      `💀 ${formatMention(game.impostorJid)} adivinó la palabra secreta: *${game.secretWord}*!\n\n` +
      `💰 *Premio:* +*$${IMPOSTOR_REWARD.toLocaleString("es-AR")}* fichas para el Impostor.\n` +
      `💡 _Para jugar otra ronda manden \`!impostor\`._`;

    await sock.sendMessage(chatJid, { text, mentions }).catch(() => {});
    return { success: true };
  }

  const innocents = playersList.filter((p) => p.userJid !== game.impostorJid);
  for (const innocent of innocents) {
    await creditReward(innocent.userJid, INNOCENT_REWARD);
  }

  const text =
    `🎉 *¡GANARON LOS INOCENTES!* 🛡️\n\n` +
    `❌ ${formatMention(game.impostorJid)} era el Impostor, intentó adivinar *"${guessRaw.trim()}"* y falló.\n` +
    `🔑 *La palabra secreta era:* *${game.secretWord}* (${game.category})\n\n` +
    `💰 *Premio:* +*$${INNOCENT_REWARD.toLocaleString("es-AR")}* fichas para cada Inocente.\n` +
    `💡 _Para jugar otra ronda manden \`!impostor\`._`;

  await sock.sendMessage(chatJid, { text, mentions }).catch(() => {});
  return { success: true };
}

export async function closeImpostorVotingManually(
  chatJid: string,
  sock: WASocket
): Promise<{ success: boolean; error?: string }> {
  const game = activeImpostorGames.get(chatJid);
  if (!game) {
    return { success: false, error: "⚠️ No hay ninguna partida de El Impostor activa." };
  }

  if (game.status === "lobby") {
    return {
      success: false,
      error: "⚠️ La partida todavía está en convocatoria. Esperá a que cierre o usá `!terminarimpostor`.",
    };
  }

  if (game.votes.size === 0) {
    return {
      success: false,
      error: "⚠️ Todavía no hay ningún voto registrado. Si quieren anular la partida usen `!terminarimpostor`.",
    };
  }

  await resolveImpostorByVotes(chatJid, sock);
  return { success: true };
}

export function abortImpostorGame(
  chatJid: string
): {
  success: boolean;
  error?: string;
  wasPlaying?: boolean;
  impostorJid?: string;
  secretWord?: string;
  category?: string;
} {
  const game = activeImpostorGames.get(chatJid);
  if (!game) {
    return {
      success: false,
      error: "⚠️ No hay ninguna partida activa de El Impostor en este grupo.",
    };
  }

  if (game.lobbyTimer) clearTimeout(game.lobbyTimer);
  activeImpostorGames.delete(chatJid);

  return {
    success: true,
    wasPlaying: game.status === "playing",
    impostorJid: game.impostorJid,
    secretWord: game.secretWord,
    category: game.category,
  };
}

async function resolveImpostorByVotes(chatJid: string, sock: WASocket): Promise<void> {
  const game = activeImpostorGames.get(chatJid);
  if (!game) return;

  activeImpostorGames.delete(chatJid);

  const tally = new Map<string, number>();
  for (const targetJid of game.votes.values()) {
    tally.set(targetJid, (tally.get(targetJid) || 0) + 1);
  }

  let maxVotes = 0;
  let topCandidates: string[] = [];

  for (const [jid, count] of tally.entries()) {
    if (count > maxVotes) {
      maxVotes = count;
      topCandidates = [jid];
    } else if (count === maxVotes) {
      topCandidates.push(jid);
    }
  }

  const playersList = Array.from(game.players.values());
  const mentions = playersList.map((p) => p.userJid);
  const voteBreakdown = playersList
    .map((p) => {
      const count = tally.get(p.userJid) || 0;
      return `• ${formatMention(p.userJid)}: *${count}* ${count === 1 ? "voto" : "votos"}`;
    })
    .join("\n");

  const isTie = topCandidates.length !== 1;
  const accusedJid = !isTie ? topCandidates[0] : null;
  const innocentsWon = !isTie && accusedJid === game.impostorJid;

  if (innocentsWon) {
    const innocents = playersList.filter((p) => p.userJid !== game.impostorJid);
    for (const innocent of innocents) {
      await creditReward(innocent.userJid, INNOCENT_REWARD);
    }

    const text =
      `🎉 *¡IMPOSTOR DESCUBIERTO! GANAN LOS INOCENTES* 🛡️\n\n` +
      `📊 *Resultados de la votación:*\n${voteBreakdown}\n\n` +
      `🕵️ *El Impostor era:* ${formatMention(game.impostorJid)}\n` +
      `🔑 *Palabra secreta:* *${game.secretWord}* (${game.category})\n\n` +
      `💰 *Premio:* +*$${INNOCENT_REWARD.toLocaleString("es-AR")}* fichas para cada Inocente.\n` +
      `💡 _Para jugar otra ronda manden \`!impostor\`._`;

    await sock.sendMessage(chatJid, { text, mentions }).catch(() => {});
    return;
  }

  await creditReward(game.impostorJid, IMPOSTOR_REWARD);
  const reasonLine = isTie
    ? `⚖️ *Hubo empate en la votación* y el Impostor logró escapar.`
    : `❌ Expulsaron a ${formatMention(accusedJid!)}, que era *Inocente*.`;

  const text =
    `🕵️ *¡EL IMPOSTOR SOBREVIVIÓ Y GANA LA PARTIDA!* 🎭\n\n` +
    `📊 *Resultados de la votación:*\n${voteBreakdown}\n\n` +
    `${reasonLine}\n` +
    `😈 *El Impostor era:* ${formatMention(game.impostorJid)}\n` +
    `🔑 *Palabra secreta:* *${game.secretWord}* (${game.category})\n\n` +
    `💰 *Premio:* +*$${IMPOSTOR_REWARD.toLocaleString("es-AR")}* fichas para el Impostor.\n` +
    `💡 _Para jugar otra ronda manden \`!impostor\`._`;

  await sock.sendMessage(chatJid, { text, mentions }).catch(() => {});
}
