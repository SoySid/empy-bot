import { Command, CommandContext } from "../types.js";
import {
  startHangmanGame,
  submitHangmanLetter,
  submitHangmanSolve,
  isHangmanGameActive,
  renderHangmanBoard,
  ActiveHangmanGame,
} from "../../services/games/ahorcado.service.js";
import { checkGameCooldown, setGameCooldown } from "../../services/games/game-cooldown.service.js";

export const ahorcadoCommand: Command = {
  name: "ahorcado",
  aliases: ["colgado", "hangman"],
  description: "Inicia una partida de El Ahorcado para todo el grupo o prueba una letra (!ahorcado [letra]).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile, cleanText }: CommandContext) => {
    // Si pasaron una letra o palabra como argumento (ej: !ahorcado a)
    if (args.length > 0 && isHangmanGameActive(remoteJid)) {
      const input = args.join(" ").trim();
      if (input.length === 1) {
        await handleLetterGuess(sock, remoteJid, msg, senderProfile, input);
      } else {
        await handleSolveGuess(sock, remoteJid, msg, senderProfile, input);
      }
      return;
    }

    const cd = checkGameCooldown(remoteJid);
    if (!cd.canStart) {
      await sock.sendMessage(
        remoteJid,
        { text: `⏳ *Minijuegos en enfriamiento:* Esperen *${cd.remainingSeconds}s* antes de iniciar otra partida en el grupo.` },
        { quoted: msg as any }
      );
      return;
    }

    const onTimeout = async (game: ActiveHangmanGame) => {
      setGameCooldown(remoteJid);
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN EL AHORCADO!*\n\n` +
        `Se terminaron los 5 minutos y el muñeco no sobrevivió.\n` +
        `¡La frase oculta era: *${game.item.phrase}*! (${game.item.category})`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startHangmanGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No se pudo iniciar El Ahorcado." },
        { quoted: msg as any }
      );
      return;
    }

    const boardText = renderHangmanBoard(res.game);
    const text =
      `🪢 *¡COMIENZA EL AHORCADO GRUPAL!* 🪢\n\n` +
      `${boardText}\n\n` +
      `• *Pozo acumulado:* *$${res.game.reward.toLocaleString("es-AR")}* fichas al que resuelva la frase.\n` +
      `• *Micro-bonus:* *$2.000* fichas por cada letra descubierta.\n` +
      `• *Vidas:* 6 vidas compartidas entre todo el grupo.\n\n` +
      `✍️ *Cómo jugar:* Escribí \`!ahorcado <letra>\` (o directamente una letra en el chat), y si sabés la frase completa arriesgá con \`!arriesgar <frase>\`.`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const arriesgarCommand: Command = {
  name: "arriesgar",
  aliases: ["resolver"],
  description: "Arriesga la solución completa de la partida activa de Ahorcado (!arriesgar <frase>).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    const rawAttempt = args.join(" ").trim();
    if (!rawAttempt) {
      await sock.sendMessage(
        remoteJid,
        { text: "Uso: `!arriesgar <frase o palabra completa>` (¡Cuidado! Si fallas restará 2 vidas)." },
        { quoted: msg as any }
      );
      return;
    }

    await handleSolveGuess(sock, remoteJid, msg, senderProfile, rawAttempt);
  },
};

export async function handleLetterGuess(
  sock: any,
  remoteJid: string,
  msg: any,
  senderProfile: any,
  letter: string
) {
  const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
  const senderPhone = senderProfile?.phone || senderProfile?.primaryName || "Jugador";

  const res = await submitHangmanLetter(remoteJid, senderJid, letter);

  if (!res.valid) {
    await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg });
    return;
  }

  if (res.gameWon) {
    const winText =
      `🎉 *¡AHORCADO RESUELTO!* 🏆\n\n` +
      `${res.boardDisplay}\n\n` +
      `👑 *¡Ganador:* @${senderPhone} descubrió la última letra y completó la frase: *${res.secretWord}*!\n` +
      `• *Pozo cobrado:* +*$${res.reward?.toLocaleString("es-AR")}* fichas\n` +
      `• *Saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text: winText, mentions: [senderJid] },
      { quoted: msg }
    );
  } else if (res.gameOver) {
    const loseText =
      `💀 *FIN DEL JUEGO: EL AHORCADO FUE COMPLETADO* 💀\n\n` +
      `${res.boardDisplay}\n\n` +
      `Se agotaron las 6 vidas del grupo.\n` +
      `La frase secreta era: *${res.secretWord}*.\n` +
      `¡Nadie cobró el pozo esta vez!`;

    await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg });
  } else if (res.isLetterHit) {
    const hitText =
      `✅ *¡Letra "${res.guessedLetter}" encontrada!*\n\n` +
      `${res.boardDisplay}\n\n` +
      `👤 @${senderPhone} sumó +*$${res.letterReward?.toLocaleString("es-AR")}* fichas por acertar.\n` +
      `⏳ _Sigan intentando con \`!ahorcado <letra>\` o \`!arriesgar <frase>\`._`;

    await sock.sendMessage(
      remoteJid,
      { text: hitText, mentions: [senderJid] },
      { quoted: msg }
    );
  } else {
    const missText =
      `❌ *La letra "${res.guessedLetter}" NO está en la frase.*\n\n` +
      `${res.boardDisplay}\n\n` +
      `⚠️ _Se perdió 1 vida. Quedan ${res.livesLeft} de ${res.maxLives} vidas._`;

    await sock.sendMessage(remoteJid, { text: missText }, { quoted: msg });
  }
}

export async function handleSolveGuess(
  sock: any,
  remoteJid: string,
  msg: any,
  senderProfile: any,
  attempt: string
) {
  const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
  const senderPhone = senderProfile?.phone || senderProfile?.primaryName || "Jugador";

  const res = await submitHangmanSolve(remoteJid, senderJid, attempt);

  if (!res.valid) {
    await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg });
    return;
  }

  if (res.gameWon) {
    const winText =
      `🏆 *¡ACIERTO TOTAL EN EL AHORCADO!* 🏆\n\n` +
      `${res.boardDisplay}\n\n` +
      `👑 @${senderPhone} arriesgó y adivinó la frase completa: *${res.secretWord}*!\n` +
      `• *Pozo cobrado:* +*$${res.reward?.toLocaleString("es-AR")}* fichas\n` +
      `• *Saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text: winText, mentions: [senderJid] },
      { quoted: msg }
    );
  } else if (res.gameOver) {
    const loseText =
      `💀 *FIN DEL JUEGO: EL AHORCADO FUE COMPLETADO* 💀\n\n` +
      `${res.boardDisplay}\n\n` +
      `El fallo de la solución consumió las últimas vidas del grupo.\n` +
      `La frase secreta era: *${res.secretWord}*.\n` +
      `¡Nadie cobró el pozo esta vez!`;

    await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg });
  } else {
    const errText =
      `${res.error}\n\n` +
      `${res.boardDisplay}\n\n` +
      `⚠️ _Quedan ${res.livesLeft} de ${res.maxLives} vidas._`;

    await sock.sendMessage(remoteJid, { text: errText }, { quoted: msg });
  }
}
