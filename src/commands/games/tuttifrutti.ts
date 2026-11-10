import { Command, CommandContext } from "../types.js";
import {
  startTuttiFruttiGame,
  ActiveTuttiFruttiGame,
} from "../../services/games/tuttifrutti.service.js";
import { checkGameCooldown, setGameCooldown } from "../../services/games/game-cooldown.service.js";

export const tuttifruttiCommand: Command = {
  name: "tuttifrutti",
  aliases: ["basta", "tutti", "frutti"],
  description: "Inicia una ronda relámpago de Tutti Frutti / Basta en el grupo (!tuttifrutti).",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const cd = checkGameCooldown(remoteJid);
    if (!cd.canStart) {
      await sock.sendMessage(
        remoteJid,
        { text: `⏳ *Minijuegos en enfriamiento:* Esperen *${cd.remainingSeconds}s* antes de iniciar otra partida en el grupo.` },
        { quoted: msg as any }
      );
      return;
    }

    const onTimeout = async (game: ActiveTuttiFruttiGame) => {
      setGameCooldown(remoteJid);
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN TUTTI FRUTTI!* 🛑\n\n` +
        `Nadie logró completar las 3 categorías con la letra *"${game.letter}"* a tiempo.\n` +
        `_Categorías:_ 1. ${game.categories[0]} | 2. ${game.categories[1]} | 3. ${game.categories[2]}`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startTuttiFruttiGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No se pudo iniciar el juego de Tutti Frutti." },
        { quoted: msg as any }
      );
      return;
    }

    const { letter, categories, reward } = res.game;

    const text =
      `🍓 *¡TUTTI FRUTTI RELÁMPAGO / BASTA!* 📝\n\n` +
      `🔤 *Letra asignada:* 👉 *[ ${letter} ]*\n\n` +
      `🎯 *Categorías a responder (las 3 con la letra ${letter}):*\n` +
      `1️⃣ *${categories[0]}*\n` +
      `2️⃣ *${categories[1]}*\n` +
      `3️⃣ *${categories[2]}*\n\n` +
      `💰 *Pozo en juego:* *$${reward.toLocaleString("es-AR")}* fichas\n` +
      `⚡ *¿Cómo ganar?* El primero que mande las 3 palabras (separadas por coma o espacio) grita *¡BASTA!* y se lleva el pozo.\n\n` +
      `⏳ *Tienen 60 segundos!*`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
