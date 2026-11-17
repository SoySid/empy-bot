import { Command, CommandContext } from "../types.js";
import { ActiveQuienGame, startQuienGame } from "../../services/games/quien.service.js";

export const quienCommand: Command = {
  name: "quien",
  aliases: ["quiendijo", "adivinaquien"],
  description: "Adivina quién escribió una frase real del historial del grupo (!quien).",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    if (!remoteJid.endsWith("@g.us")) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ Este minijuego solo puede jugarse dentro de un grupo." },
        { quoted: msg as any }
      );
      return;
    }

    const onTimeout = async (game: ActiveQuienGame) => {
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN ¿QUIÉN LO DIJO?!*\n\n` +
        `Nadie descubrió al autor a tiempo.\n` +
        `💬 _"${game.secretQuote}"_\n` +
        `🗣️ *Autor real:* *${game.winnerName}*`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startQuienGame(remoteJid, onTimeout);
    if (!res.success || !res.game) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No se pudo iniciar la partida de *¿Quién lo dijo?*." },
        { quoted: msg as any }
      );
      return;
    }

    const game = res.game;
    const candidatesList = game.candidates.map((c) => `*${c.name}*`).join(" • ");

    const text =
      `🕵️ *¿QUIÉN LO DIJO?*\n\n` +
      `_"${game.secretQuote}"_\n\n` +
      `👥 *Sospechosos (${game.candidates.length}):* ${candidatesList}\n` +
      `💰 *Premio:* *$${game.baseReward.toLocaleString("es-AR")}* fichas\n\n` +
      `⏳ *Tienen 45 segundos para escribir el nombre o apodo del autor en el chat!*`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
