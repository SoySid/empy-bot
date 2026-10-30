import { Command, CommandContext } from "../types.js";
import {
  startCountryGame,
  ActiveCountryGame,
} from "../../services/games/geoguessr.service.js";

export const banderaCommand: Command = {
  name: "bandera",
  aliases: ["pais", "geoguessr", "paises"],
  description: "Adiviná a qué país pertenece la bandera para ganar fichas (!bandera).",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const onTimeout = async (game: ActiveCountryGame) => {
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN BANDERAS!*\n\n` +
        `Nadie logró adivinar el país a tiempo.\n` +
        `¡Era *${game.country.name}* ${game.country.flagEmoji}! (Capital: *${game.country.capital}*)`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startCountryGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar el juego de banderas." }, { quoted: msg as any });
      return;
    }

    const { country, reward, flagBuffer } = res.game;
    const initialCapital = country.capital.slice(0, 1).toUpperCase();

    const caption =
      `🚩 *¿A QUÉ PAÍS PERTENECE ESTA BANDERA?* 🌍\n\n` +
      `• *Continente:* ${country.continent}\n` +
      `• *Pista:* Su capital empieza con la letra *"${initialCapital}..."*\n` +
      `• *Premio:* *$${reward.toLocaleString("es-AR")}* fichas\n\n` +
      `⏳ *Tienen 45 segundos para escribir el nombre del país en el chat!*`;

    if (flagBuffer) {
      await sock.sendMessage(
        remoteJid,
        {
          image: flagBuffer,
          caption,
        },
        { quoted: msg as any }
      );
    } else {
      await sock.sendMessage(
        remoteJid,
        { text: `${country.flagEmoji} ${caption}` },
        { quoted: msg as any }
      );
    }
  },
};
