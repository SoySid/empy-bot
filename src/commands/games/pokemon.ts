import { Command, CommandContext } from "../types.js";
import {
  startPokemonGame,
  getUserPokedex,
  ActivePokemonGame,
} from "../../services/games/pokemon.service.js";

export const pokemonCommand: Command = {
  name: "pokemon",
  aliases: ["poke", "wtp"],
  description: "Inicia el juego de ¿Quién es este Pokémon? con silueta y premio en fichas (!pokemon).",
  execute: async ({ sock, remoteJid, msg, args }: CommandContext) => {
    const onTimeout = async (game: ActivePokemonGame) => {
      const text =
        `⏱️ *¡TIEMPO AGOTADO!* (60s sin acertar)\n\n` +
        `El Pokémon salvaje escapó entre los pastos.\n` +
        `¡Era *${game.name}*!`;

      await sock.sendMessage(
        remoteJid,
        {
          image: game.colorBuffer,
          caption: text,
        }
      ).catch(() => {});
    };

    const allGens = args?.[0]?.toLowerCase() === "all" || args?.[0]?.toLowerCase() === "todas";
    const res = await startPokemonGame(remoteJid, onTimeout, allGens);

    if (!res.success || !res.game) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar el juego de Pokémon." }, { quoted: msg as any });
      return;
    }

    const caption =
      `❓ *¿QUIÉN ES ESTE POKÉMON?* ⚡\n\n` +
      `• *Tipo:* ${res.game.types.join(" / ").toUpperCase()}\n` +
      `• *Región:* ${res.game.generation}\n` +
      `• *Premio:* *$${res.game.reward.toLocaleString("es-AR")}* fichas + Registro en Pokédex\n\n` +
      `⏳ *Tienen 60 segundos para escribir el nombre directo en el chat!*`;

    await sock.sendMessage(
      remoteJid,
      {
        image: res.game.silhouetteBuffer,
        caption,
      },
      { quoted: msg as any }
    );
  },
};

export const pokedexCommand: Command = {
  name: "pokedex",
  aliases: ["mispokemon", "coleccionpoke"],
  description: "Muestra tu colección de Pokémon capturados en el bot (!pokedex).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const { total, list } = await getUserPokedex(senderJid);

    if (total === 0) {
      await sock.sendMessage(
        remoteJid,
        { text: `📕 *TU POKÉDEX ESTÁ VACÍA*\n\nTodavía no atrapaste ningún Pokémon. ¡Jugá con \`!pokemon\` para empezar tu colección!` },
        { quoted: msg as any }
      );
      return;
    }

    const pokemonDisplay = list.map((name, i) => `${i + 1}. 🐾 *${name}*`).join("\n");

    const text =
      `📕 *POKÉDEX OFICIAL DE EMPY* ⚡\n\n` +
      `👤 *Entrenador:* @${senderProfile?.phone || "Pescador"}\n` +
      `📊 *Total Capturados:* **${total} Pokémon**\n\n` +
      `📋 *Ejemplares en tu colección:*\n${pokemonDisplay}\n\n` +
      `_¡Seguí descubriendo siluetas con \`!pokemon\`!_`;

    await sock.sendMessage(
      remoteJid,
      { text, mentions: [senderJid] },
      { quoted: msg as any }
    );
  },
};
