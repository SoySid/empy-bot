import { Command, CommandContext } from "../types.js";
import {
  startMinefieldGame,
  stepOnTile,
  cashOutMinefield,
  renderMinefieldBoard,
} from "../../services/games/campominado.service.js";

export const campominadoCommand: Command = {
  name: "campominado",
  aliases: ["campo", "buscaminas", "minas"],
  description: "Inicia o consulta una partida de Campo Minado grupal (!campo [apuesta]).",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const userName = senderProfile?.primaryName || senderProfile?.pushName || "Jugador";

    // Si pasaron una coordenada directa (ej: !campo B2 o !minas A1), derivar a pisar directamente
    if (args.length > 0 && /^[A-Da-d][1-4]$/.test(args[0])) {
      await pisarCommand.execute({ sock, remoteJid, msg, args, cleanText: args[0], body: args[0], senderProfile } as any);
      return;
    }

    const betArg = args[0] ? parseInt(args[0].replace(/\D/g, ""), 10) : 500;
    const bet = isNaN(betArg) || betArg <= 0 ? 500 : betArg;

    const res = await startMinefieldGame(remoteJid, senderJid, userName, bet);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const game = res.game!;
    const boardText = renderMinefieldBoard(game);

    const text =
      `💣 *¡NUEVO CAMPO MINADO ABIERTO!* 💥\n\n` +
      `*${userName}* puso en juego *$${bet.toLocaleString("es-AR")}* fichas.\n` +
      `Hay *3 minas ocultas* y *13 casilleros con diamantes* 💎.\n\n` +
      `${boardText}\n` +
      `💰 *Pozo inicial:* *$${game.currentPot.toLocaleString("es-AR")}* fichas (${game.multiplier}x)\n` +
      `💳 *Tu saldo restante:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas\n\n` +
      `👣 *Para pisar:* \`!pisar <A1..D4>\` (ej: \`!pisar B2\`)\n` +
      `💰 *Para cobrar el pozo y retirarte:* \`!cobrar\``;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const pisarCommand: Command = {
  name: "pisar",
  aliases: ["piso", "despejar"],
  description: "Pisa una coordenada en el Campo Minado activo (!pisar B2).",
  execute: async ({ sock, remoteJid, msg, args, cleanText, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const userName = senderProfile?.primaryName || senderProfile?.pushName || "Valiente";
    const coord = (args[0] || cleanText).trim();

    if (!coord) {
      await sock.sendMessage(
        remoteJid,
        { text: "👣 Indicá la coordenada que querés pisar.\n_Ejemplo:_ `!pisar B2` o `!pisar D4`" },
        { quoted: msg as any }
      );
      return;
    }

    const res = await stepOnTile(remoteJid, senderJid, userName, coord);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const game = res.game!;
    const boardText = renderMinefieldBoard(game);

    // 1. PISÓ UNA MINA
    if (res.hitMine) {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "💥", key: msg.key } }).catch(() => {});
      }

      const text =
        `💥 *¡¡¡¡BOOOOOOOOM!!!!* 💣🩸\n\n` +
        `*${userName}* pisó el casillero *${res.coordFormatted}*... *¡HABÍA UNA MINA ACTIVA!*\n\n` +
        `${boardText}\n` +
        `💀 *El campo explotó y el pozo de $${game.currentPot.toLocaleString("es-AR")} fichas se quemó por completo.*\n\n` +
        `_Iniciá una nueva partida con \`!campo [apuesta]\`._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // 2. VICTORIA TOTAL (despejó todos)
    if (res.gameWon) {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "👑", key: msg.key } }).catch(() => {});
      }

      const text =
        `🏆 *¡¡¡VICTORIA TOTAL EN EL CAMPO MINADO!!!* 👑💎\n\n` +
        `*${userName}* pisó el último casillero seguro *${res.coordFormatted}* sin tocar una sola mina.\n\n` +
        `${boardText}\n` +
        `💰 *¡PREMIO MAYOR COBRADO!* Ganaste *$${res.potWon?.toLocaleString("es-AR")}* fichas.\n` +
        `💳 *Tu nuevo saldo:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas.`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // 3. PASO SEGURO
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "💎", key: msg.key } }).catch(() => {});
    }

    const text =
      `💎 *¡Paso seguro!* *${userName}* pisó *${res.coordFormatted}* con éxito.\n\n` +
      `${boardText}\n` +
      `💰 *Pozo acumulado:* *$${game.currentPot.toLocaleString("es-AR")}* fichas (${game.multiplier}x)\n` +
      `👣 *Seguros descubiertos:* ${game.safeTilesRevealed}/${game.safeTilesTotal}\n\n` +
      `_Podés seguir pisando con \`!pisar <coord>\` o cobrar el botín con \`!cobrar\`._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const cobrarCommand: Command = {
  name: "cobrar",
  aliases: ["retirar", "retirarse", "cobrarcampo"],
  description: "Cobra el pozo acumulado del Campo Minado y asegura tus ganancias (!cobrar).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const userName = senderProfile?.primaryName || senderProfile?.pushName || "Jugador";

    const res = await cashOutMinefield(remoteJid, senderJid, userName);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `⚠️ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const game = res.game!;
    const boardText = renderMinefieldBoard(game);

    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "🤑", key: msg.key } }).catch(() => {});
    }

    const text =
      `🤑 *¡POZO RETIRADO CON ÉXITO!* 💰\n\n` +
      `*${userName}* decidió no arriesgarse más y se retira del campo minado.\n\n` +
      `${boardText}\n` +
      `💵 *Premio cobrado:* +*$${res.potWon?.toLocaleString("es-AR")}* fichas\n` +
      `💳 *Tu nuevo saldo:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas\n\n` +
      `_¡Partida terminada! Abrí otro campo con \`!campo [apuesta]\`._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
