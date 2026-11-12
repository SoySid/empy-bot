import { Command, CommandContext } from "../types.js";
import {
  startImpostorLobby,
  joinImpostorGame,
  castImpostorVote,
  guessImpostorSecretWord,
  closeImpostorVotingManually,
  abortImpostorGame,
  getActiveImpostorGame,
} from "../../services/games/impostor.service.js";

function extractMentionedJid(msg: any): string | undefined {
  const contextInfo =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo;
  const mentioned = contextInfo?.mentionedJid;
  return Array.isArray(mentioned) && mentioned.length > 0 ? mentioned[0] : undefined;
}

function parseVoteTarget(args: string[], msg: any): { mentionedJid?: string; playerNumber?: number } {
  const mentionedJid = extractMentionedJid(msg);
  if (mentionedJid) return { mentionedJid };

  const numArg = args.find((a) => /^\d+$/.test(a.trim()));
  if (numArg) {
    const parsed = parseInt(numArg.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      return { playerNumber: parsed };
    }
  }

  return {};
}

async function handleAbort(ctx: CommandContext): Promise<void> {
  const { sock, remoteJid, msg } = ctx;
  const res = abortImpostorGame(remoteJid);
  if (!res.success) {
    await sock.sendMessage(remoteJid, { text: res.error || "No se pudo terminar la partida." }, { quoted: msg as any });
    return;
  }

  if (res.wasPlaying && res.impostorJid) {
    const impostorPhone = res.impostorJid.split("@")[0].split(":")[0];
    await sock.sendMessage(
      remoteJid,
      {
        text:
          `🛑 *PARTIDA DE EL IMPOSTOR TERMINADA*\n\n` +
          `La partida se cerró manualmente sin repartir premios.\n` +
          `🕵️ *El Impostor era:* @${impostorPhone}\n` +
          `🔑 *Palabra secreta:* *${res.secretWord}* (${res.category})`,
        mentions: [res.impostorJid],
      },
      { quoted: msg as any }
    );
    return;
  }

  await sock.sendMessage(
    remoteJid,
    { text: "🛑 La convocatoria de *El Impostor* fue cancelada." },
    { quoted: msg as any }
  );
}

export const impostorCommand: Command = {
  name: "impostor",
  aliases: ["imp", "impostorgame"],
  description: "Inicia o gestiona una partida del juego social El Impostor (!impostor).",
  execute: async (ctx: CommandContext) => {
    const { sock, remoteJid, msg, args, senderProfile } = ctx;
    const subCommand = args[0]?.toLowerCase();
    const senderJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const senderName = senderProfile?.primaryName || "Jugador";

    if (subCommand === "unirme" || subCommand === "entrar" || subCommand === "join") {
      const res = joinImpostorGame(remoteJid, senderJid, senderName);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo unir a la partida." }, { quoted: msg as any });
        return;
      }
      await sock.sendMessage(
        remoteJid,
        { text: `✅ *${senderName}* se unió a El Impostor. (${res.totalPlayers} jugadores anotados).` },
        { quoted: msg as any }
      );
      return;
    }

    if (subCommand === "votar" || subCommand === "vote") {
      const target = parseVoteTarget(args.slice(1), msg);
      const res = await castImpostorVote(remoteJid, senderJid, target, sock);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo registrar el voto." }, { quoted: msg as any });
        return;
      }
      if (!res.resolved) {
        await sock.sendMessage(remoteJid, { react: { text: "🗳️", key: msg.key } }).catch(() => {});
        await sock.sendMessage(
          remoteJid,
          { text: `🗳️ *${senderName}* registró su voto (${res.votesCount}/${res.totalPlayers} votos).` },
          { quoted: msg as any }
        );
      }
      return;
    }

    if (subCommand === "adivinar" || subCommand === "arriesgar") {
      const guessText = args.slice(1).join(" ").trim();
      const res = await guessImpostorSecretWord(remoteJid, senderJid, guessText, sock);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo procesar el intento." }, { quoted: msg as any });
      }
      return;
    }

    if (subCommand === "cerrar" || subCommand === "resolver") {
      const res = await closeImpostorVotingManually(remoteJid, sock);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo cerrar la votación." }, { quoted: msg as any });
      }
      return;
    }

    if (subCommand === "terminar" || subCommand === "cancelar" || subCommand === "fin" || subCommand === "abortar") {
      await handleAbort(ctx);
      return;
    }

    if (subCommand === "estado" || subCommand === "status") {
      const game = getActiveImpostorGame(remoteJid);
      if (!game) {
        await sock.sendMessage(
          remoteJid,
          { text: "ℹ️ No hay ninguna partida de *El Impostor* activa en este grupo. Iniciá una con `!impostor`." },
          { quoted: msg as any }
        );
        return;
      }

      const playersList = Array.from(game.players.values());
      const mentions = playersList.map((p) => p.userJid);
      const listStr = playersList
        .map((p) => `*${p.index}.* @${p.userJid.split("@")[0].split(":")[0]} ${game.votes.has(p.userJid) ? "✅" : "⏳"}`)
        .join("\n");

      const statusText =
        game.status === "lobby"
          ? `⏳ *CONVOCATORIA ABIERTA (${playersList.length} anotados)*\nEscribí \`!unirme\` para entrar.`
          : `🕵️ *EL IMPOSTOR EN CURSO*\n📂 *Categoría:* ${game.category}\n🗳️ *Votos:* ${game.votes.size}/${playersList.length}\n\n${listStr}`;

      await sock.sendMessage(remoteJid, { text: statusText, mentions }, { quoted: msg as any });
      return;
    }

    const res = startImpostorLobby(remoteJid, senderJid, senderName, sock);
    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar El Impostor." }, { quoted: msg as any });
      return;
    }

    const text =
      `🕵️ *¡CONVOCATORIA: EL IMPOSTOR!* 🎭\n\n` +
      `¡Se abrió una partida de deducción social grupal!\n\n` +
      `📋 *¿Cómo se juega?*\n` +
      `• Todos reciben una *palabra secreta* por privado, menos *1 Impostor* que solo sabe la categoría.\n` +
      `• En el grupo debaten sin límite de tiempo tirando pistas para encontrar al que miente.\n` +
      `• Votan con \`!votar @usuario\` o \`!votar <número>\`.\n` +
      `• Si alguien se desconecta, pueden anularla con \`!terminarimpostor\`.\n\n` +
      `⏳ *Tienen 30 segundos para unirse:* Manden *!unirme* en el grupo.\n` +
      `👥 _(Mínimo 3 jugadores para iniciar)_`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const votarCommand: Command = {
  name: "votar",
  aliases: ["voto"],
  description: "Vota por un sospechoso en la partida activa de El Impostor (!votar @usuario o !votar <número>).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const senderName = senderProfile?.primaryName || "Jugador";
    const target = parseVoteTarget(args, msg);

    const res = await castImpostorVote(remoteJid, senderJid, target, sock);
    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo registrar el voto." }, { quoted: msg as any });
      return;
    }

    if (!res.resolved) {
      await sock.sendMessage(remoteJid, { react: { text: "🗳️", key: msg.key } }).catch(() => {});
      await sock.sendMessage(
        remoteJid,
        { text: `🗳️ *${senderName}* registró su voto (${res.votesCount}/${res.totalPlayers} votos).` },
        { quoted: msg as any }
      );
    }
  },
};

export const terminarImpostorCommand: Command = {
  name: "terminarimpostor",
  aliases: ["finimpostor", "cancelarimpostor"],
  description: "Termina y limpia una partida activa de El Impostor si los jugadores se desconectan.",
  execute: async (ctx: CommandContext) => {
    await handleAbort(ctx);
  },
};
