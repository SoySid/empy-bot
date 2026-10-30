import { Command, CommandContext } from "../types.js";
import {
  startSuperheroGame,
  getUserSuperheroes,
  ActiveSuperheroGame,
} from "../../services/games/superhero.service.js";

export const superheroeCommand: Command = {
  name: "superheroe",
  aliases: ["comic", "superheroes", "personaje"],
  description: "Adiviná el personaje o superhéroe de cómics y películas para ganar fichas (!superheroe).",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const onTimeout = async (game: ActiveSuperheroGame) => {
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN SUPERHÉROES!*\n\n` +
        `Nadie logró descubrir al personaje a tiempo.\n` +
        `¡Era *${game.name}*! (${game.publisher} - ${game.fullName})`;

      await sock.sendMessage(
        remoteJid,
        {
          image: game.colorBuffer,
          caption: text,
        }
      ).catch(() => {});
    };

    const res = await startSuperheroGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar el juego de superhéroes." }, { quoted: msg as any });
      return;
    }

    const caption =
      `❓ *¿QUIÉN ES ESTE PERSONAJE / SUPERHÉROE?* 🦸\n\n` +
      `• *Universo:* ${res.game.publisher.toUpperCase()}\n` +
      `• *Bando:* ${res.game.alignment}\n` +
      `• *Premio:* *$${res.game.reward.toLocaleString("es-AR")}* fichas + Colección\n\n` +
      `⏳ *Tienen 60 segundos para escribir el nombre en el chat!*`;

    await sock.sendMessage(
      remoteJid,
      {
        image: res.game.pixelatedBuffer,
        caption,
      },
      { quoted: msg as any }
    );
  },
};

export const superheroesColeccionCommand: Command = {
  name: "coleccioncomics",
  aliases: ["miscomics", "superheroesalbum"],
  description: "Muestra tu colección de superhéroes y villanos descubiertos (!coleccioncomics).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const { total, list } = await getUserSuperheroes(senderJid);

    if (total === 0) {
      await sock.sendMessage(
        remoteJid,
        { text: `🦸 *TU COLECCIÓN DE CÓMICS ESTÁ VACÍA*\n\nTodavía no descubriste ningún personaje. ¡Jugá con \`!superheroe\` para sumar héroes y villanos!` },
        { quoted: msg as any }
      );
      return;
    }

    const heroDisplay = list.map((name, i) => `${i + 1}. 🦸 *${name}*`).join("\n");

    const text =
      `🦸 *ÁLBUM DE HÉROES & VILLANOS* 🦹\n\n` +
      `👤 *Coleccionista:* @${senderProfile?.phone || "Lector"}\n` +
      `📊 *Total Descubiertos:* **${total} personajes**\n\n` +
      `📋 *Tus personajes en el haber:*\n${heroDisplay}\n\n` +
      `_¡Seguí descubriendo personajes con \`!superheroe\`!_`;

    await sock.sendMessage(
      remoteJid,
      { text, mentions: [senderJid] },
      { quoted: msg as any }
    );
  },
};
