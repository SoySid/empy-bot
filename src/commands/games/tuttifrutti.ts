import { Command, CommandContext } from "../types.js";
import {
  startTuttiFruttiGame,
  getTuttiFruttiRanking,
  TuttiFruttiRoundResult,
} from "../../services/games/tuttifrutti.service.js";

export const tuttifruttiCommand: Command = {
  name: "tuttifrutti",
  aliases: ["basta", "tutti", "frutti"],
  description: "Inicia una ronda multijugador de Tutti Frutti / Basta con 7 categorías (!tuttifrutti).",
  execute: async ({ sock, remoteJid, msg, cleanText }: CommandContext) => {
    const subCommand = cleanText.trim().toLowerCase();

    // 1. Subcomando de Ranking / Top
    if (subCommand.includes("ranking") || subCommand.includes("top")) {
      const top = getTuttiFruttiRanking(10);
      if (top.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: "📊 *RANKING TUTTI FRUTTI* 🍓\n\n_Aún no hay partidas multijugador registradas. ¡Jugá con `!tuttifrutti` para rankear!_" },
          { quoted: msg as any }
        );
        return;
      }

      const lines = top.map((p, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}️⃣`;
        return `${medal} *${p.name}:* ${p.wins} victorias | ${p.totalPoints} pts (${p.gamesPlayed} partidas)`;
      });

      const rankingText =
        `🏆 *TOP 10 CAMPEONES DE TUTTI FRUTTI* 🍓\n\n` +
        lines.join("\n") +
        `\n\n💡 _Sumá puntos jugando en grupo con \`!tuttifrutti\`._`;

      await sock.sendMessage(remoteJid, { text: rankingText }, { quoted: msg as any });
      return;
    }

    // 2. Callback de finalización de ronda y entrega de resultados
    const onRoundEnd = async (result: TuttiFruttiRoundResult) => {
      if (!result.valid) {
        if (result.reason === "no_submissions") {
          const text =
            `⏱️ *¡TIEMPO AGOTADO EN TUTTI FRUTTI!* 🛑\n\n` +
            `Nadie logró completar las 7 categorías con la letra *"${result.game.letter}"* a tiempo.`;
          await sock.sendMessage(remoteJid, { text }).catch(() => {});
        } else {
          const text =
            `⏱️ *¡RONDA FINALIZADA!* 🛑\n\n` +
            `⚠️ *Partida no válida:* Se requiere un mínimo de *2 jugadores* para competir, puntuar y repartir el premio. ¡Inviten a más amigos la próxima!`;
          await sock.sendMessage(remoteJid, { text }).catch(() => {});
        }
        return;
      }

      const { winner, standings, reward, game } = result;
      if (!winner || !standings) return;

      const mentions: string[] = standings.map((s) => s.userJid);

      const podiumText = standings
        .map((p, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖️";
          const winTag = i === 0 ? ` 👑 *(+ $${reward?.toLocaleString("es-AR")} fichas)*` : "";
          const phone = p.userJid.split("@")[0].split(":")[0];
          return `${medal} *@${phone}:* *${p.totalPoints} pts*${winTag}`;
        })
        .join("\n");

      // Detalle de palabras del ganador
      const winnerWordsText = game.categories
        .map((cat, i) => `• *${cat}:* ${winner.words[i]} (${winner.categoryPoints[i]} pts)`)
        .join("\n");

      const victoryText =
        `🍓 *¡RESULTADOS FINALES DE TUTTI FRUTTI!* 📝\n\n` +
        `🔤 *Letra de la ronda:* 👉 *[ ${game.letter} ]*\n\n` +
        `🏆 *PODIO DEL GRUPO:*\n${podiumText}\n\n` +
        `📋 *Respuestas del Ganador (@${winner.userJid.split("@")[0].split(":")[0]}):*\n` +
        winnerWordsText +
        `\n\n💰 *Premio acreditado al ganador:* +*$${reward?.toLocaleString("es-AR")}* fichas.\n` +
        `💡 _Consultá las estadísticas con \`!tuttifrutti ranking\`._`;

      await sock.sendMessage(
        remoteJid,
        { text: victoryText, mentions },
      ).catch(() => {});
    };

    // 3. Inicio de la partida (sin cooldown)
    const res = await startTuttiFruttiGame(remoteJid, onRoundEnd);

    if (!res.success || !res.game) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No se pudo iniciar el juego de Tutti Frutti." },
        { quoted: msg as any }
      );
      return;
    }

    const { letter, categories, reward } = res.game;

    const categoriesList = categories
      .map((cat, i) => `${i + 1}️⃣ *${cat}*`)
      .join("\n");

    const text =
      `🍓 *¡TUTTI FRUTTI / BASTA MULTIJUGADOR!* 📝\n\n` +
      `🔤 *Letra asignada:* 👉 *[ ${letter} ]*\n\n` +
      `🎯 *Las 7 Categorías a responder:*\n` +
      categoriesList +
      `\n\n` +
      `💡 *¿Cómo jugar?*\n` +
      `• Mandá las 7 palabras separadas por comas (todas con *${letter}* y mín. 3 letras).\n` +
      `• El primero en mandar grita *¡BASTA!* y queda *1 minuto de prórroga* para el resto.\n` +
      `• *Puntos:* 10 pts si nadie la repite, 5 pts si se repite, 0 si duplicás tu propia palabra.\n` +
      `• *Mínimo 2 jugadores* para que sea válida.\n\n` +
      `💰 *Premio en juego:* *$${reward.toLocaleString("es-AR")}* fichas al ganador.\n` +
      `⏳ *¡Tienen 60 segundos para arrancar!*`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
