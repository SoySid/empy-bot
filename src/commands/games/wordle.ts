import { Command, CommandContext } from "../types.js";
import {
  startWordleGame,
  submitWordleGuess,
  isWordleGameActive,
  ActiveWordleGame,
} from "../../services/games/wordle.service.js";
import { checkGameCooldown, setGameCooldown } from "../../services/games/game-cooldown.service.js";

export const wordleCommand: Command = {
  name: "wordle",
  aliases: ["palabrita", "wordlegame"],
  description: "Inicia una partida de Wordle de 5 letras para todo el grupo (!wordle).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    // Si pasaron una palabra como argumento (ej: !wordle barco)
    if (args.length > 0 && isWordleGameActive(remoteJid)) {
      await handleGuess(sock, remoteJid, msg, senderProfile, args[0]);
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

    const onTimeout = async (game: ActiveWordleGame) => {
      setGameCooldown(remoteJid);
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN WORDLE!*\n\n` +
        `Se terminaron los 5 minutos y no lograron descubrir la palabra secreta.\n` +
        `¡La palabra era: *${game.secretWord}*!`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startWordleGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar Wordle." }, { quoted: msg as any });
      return;
    }

    const text =
      `🟩 *¡COMIENZA EL WORDLE GRUPAL!* 🟨\n\n` +
      `• *Consigna:* Adivinen la palabra secreta de 5 letras en español.\n` +
      `• *Intentos compartidos:* Hasta 6 intentos entre todos.\n` +
      `• *Premio:* *$${res.game.reward.toLocaleString("es-AR")}* fichas al que acierte la palabra.\n\n` +
      `🟩 Verde: Letra correcta en la posición correcta.\n` +
      `🟨 Amarillo: La letra existe pero en otra posición.\n` +
      `⬛ Negro: La letra no pertenece a la palabra.\n\n` +
      `✍️ *Para intentar:* Escribí \`!palabra <texto>\` o \`!wordle <texto>\` (ej: \`!palabra barco\`).`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const palabraCommand: Command = {
  name: "palabra",
  aliases: ["p", "intento"],
  description: "Arriesga una palabra de 5 letras en la partida activa de Wordle (!palabra <texto>).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    const rawWord = args[0] || "";
    if (!rawWord) {
      await sock.sendMessage(
        remoteJid,
        { text: "Uso: `!palabra <texto>` (debe ser una palabra de exactamente 5 letras)." },
        { quoted: msg as any }
      );
      return;
    }

    await handleGuess(sock, remoteJid, msg, senderProfile, rawWord);
  },
};

async function handleGuess(
  sock: any,
  remoteJid: string,
  msg: any,
  senderProfile: any,
  word: string
) {
  const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
  const senderName = senderProfile?.primaryName || senderProfile?.phone || "Jugador";

  const res = await submitWordleGuess(remoteJid, senderJid, senderName, word);

  if (!res.valid) {
    await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg });
    return;
  }

  if (res.gameWon) {
    const winText =
      `🎉 *¡WORDLE RESUELTO!* 🏆\n\n` +
      `${res.gridDisplay}\n\n` +
      `👑 *Ganador:* @${senderProfile?.phone || senderName} descubrió la palabra: *${res.secretWord}*!\n` +
      `• *Premio cobrado:* +*$${res.reward?.toLocaleString("es-AR")}* fichas\n` +
      `• *Tu saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas`;

    await sock.sendMessage(
      remoteJid,
      { text: winText, mentions: [senderJid] },
      { quoted: msg }
    );
  } else if (res.gameOver) {
    const loseText =
      `💀 *FIN DEL JUEGO: INTENTOS AGOTADOS* (6/6)\n\n` +
      `${res.gridDisplay}\n\n` +
      `La palabra secreta era: *${res.secretWord}*.\n` +
      `¡Nadie cobró las fichas esta vez!`;

    await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg });
  } else {
    const progText =
      `🟩 *WORDLE EN CURSO* (${res.attemptNumber}/${res.maxAttempts})\n\n` +
      `${res.gridDisplay}\n\n` +
      (res.lettersStatus ? `${res.lettersStatus}\n\n` : "") +
      `⏳ _Quedan ${res.maxAttempts! - res.attemptNumber!} intentos restantes (\`!palabra <texto>\`)._`;

    await sock.sendMessage(remoteJid, { text: progText }, { quoted: msg });
  }
}
