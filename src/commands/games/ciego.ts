import { Command, CommandContext } from "../types.js";
import {
  startCiegoLobby,
  joinCiegoGame,
  submitCiegoGuess,
  finishCiegoManually,
  cancelCiegoGame,
  isCiegoGameActive,
  getActiveCiegoGame,
} from "../../services/games/ciego.service.js";
import {
  isImpostorGameActive,
  joinImpostorGame,
} from "../../services/games/impostor.service.js";

export const ciegoCommand: Command = {
  name: "ciego",
  aliases: ["elnumero", "elnúmero", "ciegogame"],
  description: "Inicia el juego social y de deducción de El Número Ciego (!ciego).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile, cleanText }: CommandContext) => {
    const subCommand = args[0]?.toLowerCase();
    const senderJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const senderName = senderProfile?.primaryName || "Jugador";

    // 1. Subcomando !ciego unirme
    if (subCommand === "unirme" || subCommand === "entrar" || subCommand === "join") {
      const res = joinCiegoGame(remoteJid, senderJid, senderName);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo unir a la partida." }, { quoted: msg as any });
        return;
      }

      await sock.sendMessage(
        remoteJid,
        { text: `✅ *${senderName}* se unió a El Número Ciego. (${res.totalPlayers} jugadores anotados).` },
        { quoted: msg as any }
      );
      return;
    }

    // 2. Subcomando !ciego arriesgar <numero>
    if (subCommand === "arriesgar" || subCommand === "adivinar") {
      const num = parseInt(args[1], 10);
      if (isNaN(num) || num < 1 || num > 99) {
        await sock.sendMessage(
          remoteJid,
          { text: "⚠️ Debes ingresar un número del 1 al 99. Ejemplo: `!arriesgar 45`" },
          { quoted: msg as any }
        );
        return;
      }

      const res = await submitCiegoGuess(remoteJid, senderJid, num, sock);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo arriesgar." }, { quoted: msg as any });
        return;
      }

      if (!res.allGuessed) {
        await sock.sendMessage(remoteJid, { react: { text: "🎯", key: msg.key } }).catch(() => {});
      }
      return;
    }

    // 3. Subcomando !ciego terminar / cerrar
    if (subCommand === "terminar" || subCommand === "cerrar" || subCommand === "fin") {
      const res = await finishCiegoManually(remoteJid, sock);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo finalizar." }, { quoted: msg as any });
      }
      return;
    }

    // 4. Subcomando !ciego cancelar
    if (subCommand === "cancelar") {
      const res = cancelCiegoGame(remoteJid);
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: res.error || "No se pudo cancelar." }, { quoted: msg as any });
        return;
      }
      await sock.sendMessage(remoteJid, { text: "🛑 La partida de El Número Ciego fue cancelada." }, { quoted: msg as any });
      return;
    }

    // 5. Inicio normal del juego (!ciego)
    const res = await startCiegoLobby(remoteJid, senderJid, senderName, sock);
    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar El Número Ciego." }, { quoted: msg as any });
      return;
    }

    const text =
      `🕶️ *¡CONVOCATORIA: EL NÚMERO CIEGO!* 🎲\n\n` +
      `¡Se abrió una partida de deducción social grupal!\n\n` +
      `📋 *¿Cómo se juega?*\n` +
      `• El bot le asigna en secreto un número del 1 al 99 a cada jugador.\n` +
      `• Por mensaje privado recibirás los números de todos tus compañeros (el tuyo no).\n` +
      `• En el grupo debaten libremente haciéndose preguntas y sacando pistas.\n` +
      `• Arriesgás tu número con \`!arriesgar <número>\` (margen de victoria: *±3 números*).\n\n` +
      `⏳ *Tienen 30 segundos para unirse:* Manden *!unirme* en el grupo.\n` +
      `👥 _(Mínimo 2 jugadores para iniciar)_`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const unirmeCommand: Command = {
  name: "unirme",
  aliases: ["unir", "join", "entrar", "anotarme"],
  description: "Se une a la convocatoria activa de El Número Ciego o El Impostor (!unirme).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || remoteJid;
    const senderName = senderProfile?.primaryName || "Jugador";

    if (isImpostorGameActive(remoteJid) && !isCiegoGameActive(remoteJid)) {
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

    if (!isCiegoGameActive(remoteJid)) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ No hay ninguna convocatoria activa en este grupo. Podés iniciar una con `!ciego` o `!impostor`." },
        { quoted: msg as any }
      );
      return;
    }

    const res = joinCiegoGame(remoteJid, senderJid, senderName);
    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo unir a la partida." }, { quoted: msg as any });
      return;
    }

    await sock.sendMessage(
      remoteJid,
      { text: `✅ *${senderName}* se unió a El Número Ciego. (${res.totalPlayers} jugadores anotados).` },
      { quoted: msg as any }
    );
  },
};
