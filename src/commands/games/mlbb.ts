import { Command, CommandContext } from "../types.js";
import {
  startMlbbGame,
  getUserMlbbHeroes,
  ActiveMlbbGame,
} from "../../services/games/mlbb.service.js";
import { checkGameCooldown, setGameCooldown } from "../../services/games/game-cooldown.service.js";

export const mlbbCommand: Command = {
  name: "mlbb",
  aliases: ["heroe", "heroemlbb", "mobilelegends"],
  description: "Adiviná el héroe de Mobile Legends: Bang Bang por su avatar pixelado (!mlbb).",
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

    const onTimeout = async (game: ActiveMlbbGame) => {
      setGameCooldown(remoteJid);
      const text =
        `⏱️ *¡TIEMPO AGOTADO EN MOBILE LEGENDS!*\n\n` +
        `Nadie logró reconocer al héroe a tiempo.\n` +
        `¡Era *${game.hero.name}*! (${game.hero.role} - ${game.hero.lane})`;

      await sock.sendMessage(
        remoteJid,
        {
          image: game.colorBuffer,
          caption: text,
        }
      ).catch(() => {});
    };

    const res = await startMlbbGame(remoteJid, onTimeout);

    if (!res.success || !res.game) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo iniciar el juego de Mobile Legends." }, { quoted: msg as any });
      return;
    }

    const { hero, reward, pixelatedBuffer } = res.game;

    const caption =
      `❓ *¿QUIÉN ES ESTE HÉROE DE MOBILE LEGENDS?* ⚔️\n\n` +
      `• *Rol:* ${hero.role.toUpperCase()}\n` +
      `• *Línea habitual:* ${hero.lane}\n` +
      `• *Premio:* *$${reward.toLocaleString("es-AR")}* fichas + Colección\n\n` +
      `⏳ *Tienen 60 segundos para escribir el nombre en el chat!*`;

    await sock.sendMessage(
      remoteJid,
      {
        image: pixelatedBuffer,
        caption,
      },
      { quoted: msg as any }
    );
  },
};

export const mlbbdexCommand: Command = {
  name: "mlbbdex",
  aliases: ["misheroesmlbb", "heroesmlbb"],
  description: "Muestra tu colección de héroes dominados en Mobile Legends (!mlbbdex).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const { total, list } = await getUserMlbbHeroes(senderJid);

    if (total === 0) {
      await sock.sendMessage(
        remoteJid,
        { text: `⚔️ *TU MLBB-DEX ESTÁ VACÍA*\n\nTodavía no descubriste ningún héroe de Mobile Legends. ¡Jugá con \`!mlbb\` para empezar a dominarlos!` },
        { quoted: msg as any }
      );
      return;
    }

    const heroDisplay = list.map((name, i) => `${i + 1}. ⚔️ *${name}*`).join("\n");

    const text =
      `⚔️ *MLBB-DEX OFICIAL DE EMPY* 🛡️\n\n` +
      `👤 *Jugador:* @${senderProfile?.phone || "Invocador"}\n` +
      `📊 *Total Dominados:* **${total} héroes**\n\n` +
      `📋 *Héroes en tu lista:*\n${heroDisplay}\n\n` +
      `_¡Seguí reconociendo avatares con \`!mlbb\`!_`;

    await sock.sendMessage(
      remoteJid,
      { text, mentions: [senderJid] },
      { quoted: msg as any }
    );
  },
};
