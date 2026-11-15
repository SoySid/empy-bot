import { Command, CommandContext } from "../types.js";
import { ActiveQuienGame, startQuienGame } from "../../services/games/quien.service.js";
import { checkGameCooldown, setGameCooldown } from "../../services/games/game-cooldown.service.js";

function formatNeuralPodium(game: ActiveQuienGame): string {
  return game.neuralRanking
    .slice(0, 3)
    .map((entry, idx) => `${idx + 1}. *${entry.name}* — ${entry.percent}%`)
    .join("\n");
}

export const quienCommand: Command = {
  name: "quien",
  aliases: ["quiendijo", "redneuronal", "adivinaquien"],
  description: "Humanos vs. Red Neuronal: adivina quién escribió una frase real del grupo (!quien).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    if (!remoteJid.endsWith("@g.us")) {
      await sock.sendMessage(
        remoteJid,
        { text: "⚠️ Este minijuego solo puede jugarse dentro de un grupo." },
        { quoted: msg as any }
      );
      return;
    }

    const cd = checkGameCooldown(remoteJid, senderProfile, msg.key?.participant || remoteJid);
    if (!cd.canStart) {
      await sock.sendMessage(
        remoteJid,
        { text: `⏳ *Minijuegos en enfriamiento:* Esperen *${cd.remainingSeconds}s* antes de iniciar otra partida en el grupo.` },
        { quoted: msg as any }
      );
      return;
    }

    const onTimeout = async (game: ActiveQuienGame) => {
      setGameCooldown(remoteJid);
      const neuralHit = game.neuralTopJid === game.winnerJid;
      const verdictLine = neuralHit
        ? `🤖 *Punto para la Red Neuronal:* acertó con *${game.neuralRanking[0]?.percent ?? 0}%* de confianza.`
        : `🤖 *La Red Neuronal también pifió:* apostaba por *${game.neuralTopName}* (${game.neuralRanking[0]?.percent ?? 0}%).`;

      const text =
        `⏱️ *¡TIEMPO AGOTADO EN ¿QUIÉN LO DIJO?!*\n\n` +
        `Nadie descubrió al autor a tiempo.\n` +
        `🗣️ *Autor real:* *${game.winnerName}*\n\n` +
        `${verdictLine}\n\n` +
        `📊 *Podio Softmax de la Red Neuronal:*\n` +
        `${formatNeuralPodium(game)}`;

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
    const accuracyPct = Math.round(game.trainAccuracy * 100);

    const text =
      `🧠 *¿QUIÉN LO DIJO? (Humanos vs. Red Neuronal)*\n\n` +
      `_"${game.secretQuote}"_\n\n` +
      `👥 *Sospechosos:* ${candidatesList}\n` +
      `🤖 *Red Neuronal:* entrenada con mensajes del grupo (${accuracyPct}% precisión), ya guardó su predicción secreta.\n` +
      `💰 *Premio:* *$${game.baseReward.toLocaleString("es-AR")}* fichas (+*$5.000* bonus si le ganan a la red)\n\n` +
      `⏳ *Tienen 45 segundos para escribir el nombre o apodo del autor en el chat!*`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
