import { Command, CommandContext } from "../types.js";
import { prisma } from "../../services/db/prisma.js";
import {
  startBlackjack,
  hitBlackjack,
  standBlackjack,
  formatHand,
} from "../../services/blackjack.service.js";

export const blackjackCommand: Command = {
  name: "21",
  aliases: ["blackjack", "veintiuno"],
  description: "Jugá al Blackjack/21 contra el bot: !21 <monto> (sin límite, podés ir all-in).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const arg0 = (args[0] || "").toLowerCase();
    let rawBet: number | undefined;

    if (["all", "todo", "toda"].includes(arg0)) {
      const cur = await prisma.userProfile.findUnique({ where: { jid: senderJid } });
      const balance = cur?.balance ?? senderProfile?.balance ?? 0;
      if (balance < 1000) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ *Saldo insuficiente:* Tenés apenas *$${balance}* fichas para apostar (el mínimo es *$1.000*).` },
          { quoted: msg as any }
        );
        return;
      }
      rawBet = balance;
    } else {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed) && parsed > 0) {
        rawBet = parsed;
      }
    }

    if (!rawBet || rawBet <= 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🃏 *CASINO: BLACKJACK / 21*\n\n` +
            `Uso: \`!21 <monto>\` (ej: \`!21 50000\` o \`!21 todo\`)\n` +
            `• *Apuesta permitida:* Desde $1.000 fichas (¡sin tope máximo de apuesta!).\n\n` +
            `📜 *Reglas del juego:*\n` +
            `• El objetivo es sumar lo más cerca de 21 sin pasarse.\n` +
            `• Las figuras (J, Q, K) valen 10. El As vale 11 o 1.\n` +
            `• Blackjack natural (21 de entrada en 2 cartas) paga *2.5x*.\n` +
            `• Para pedir otra carta: \`!pedir\`\n` +
            `• Para plantarte y ver la jugada del croupier: \`!plantarse\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    const onTimeout = async (timeoutRes: any) => {
      const profitText =
        (timeoutRes.netProfit || 0) > 0
          ? `+*$${timeoutRes.netProfit}* fichas`
          : (timeoutRes.netProfit || 0) < 0
          ? `-*$${Math.abs(timeoutRes.netProfit || 0)}* fichas`
          : "$0 (Empate)";

      const timeoutMsg =
        `⏱️ *¡TIEMPO AGOTADO EN BLACKJACK!* (60s sin responder)\n` +
        `Te plantaste automáticamente con tu jugada.\n\n` +
        `${timeoutRes.statusText}\n\n` +
        `👤 *Tus cartas:* ${formatHand(timeoutRes.playerCards || [])} (${timeoutRes.playerScore} pts)\n` +
        `🤖 *Croupier:* ${formatHand(timeoutRes.dealerCards || [])} (${timeoutRes.dealerScore} pts)\n\n` +
        `💰 *Resultado:* ${profitText}\n` +
        `💳 *Tu saldo actual:* *$${timeoutRes.newBalance}* fichas`;

      await sock.sendMessage(remoteJid, { text: timeoutMsg }).catch(() => {});
    };

    const res = await startBlackjack(senderJid, rawBet, onTimeout);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    if (res.gameFinished) {
      const profitText =
        (res.netProfit || 0) > 0
          ? `+*$${res.netProfit}* fichas`
          : (res.netProfit || 0) < 0
          ? `-*$${Math.abs(res.netProfit || 0)}* fichas`
          : "$0 (Empate)";

      const message =
        `🃏 *PARTIDA DE BLACKJACK (21)*\n\n` +
        `${res.statusText}\n\n` +
        `👤 *Tus cartas:* ${formatHand(res.playerCards || [])} (${res.playerScore} pts)\n` +
        `🤖 *Croupier:* ${formatHand(res.dealerCards || [])} (${res.dealerScore} pts)\n\n` +
        `💰 *Resultado:* ${profitText}\n` +
        `💳 *Tu saldo actual:* *$${res.newBalance}* fichas`;

      await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
      return;
    }

    // Partida en curso
    const message =
      `🃏 *PARTIDA DE BLACKJACK EN CURSO*\n\n` +
      `👤 *Tus cartas:* ${formatHand(res.playerCards || [])} (*${res.playerScore}* pts)\n` +
      `🤖 *Croupier:* ${formatHand(res.dealerCards || [], true)}\n\n` +
      `👉 Escribí \`!pedir\` para recibir otra carta.\n` +
      `👉 Escribí \`!plantarse\` para quedarte con tus ${res.playerScore} puntos.`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};

export const pedirCommand: Command = {
  name: "pedir",
  aliases: ["hit", "damecarta", "carta"],
  description: "Pedí otra carta en tu partida de Blackjack activa (!pedir).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await hitBlackjack(senderJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    if (res.gameFinished) {
      const profitText =
        (res.netProfit || 0) > 0
          ? `+*$${res.netProfit}* fichas`
          : `-*$${Math.abs(res.netProfit || 0)}* fichas`;

      const message =
        `🃏 *FINAL DEL JUEGO (21)*\n\n` +
        `${res.statusText}\n\n` +
        `👤 *Tus cartas:* ${formatHand(res.playerCards || [])} (*${res.playerScore}* pts)\n` +
        `🤖 *Croupier:* ${formatHand(res.dealerCards || [])} (*${res.dealerScore}* pts)\n\n` +
        `💰 *Resultado:* ${profitText}\n` +
        `💳 *Tu saldo actual:* *$${res.newBalance}* fichas`;

      await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
      return;
    }

    // Aún en juego
    const message =
      `🃏 *CARTA RECIBIDA*\n\n` +
      `👤 *Tus cartas:* ${formatHand(res.playerCards || [])} (*${res.playerScore}* pts)\n` +
      `🤖 *Croupier:* ${formatHand(res.dealerCards || [], true)}\n\n` +
      `👉 Escribí \`!pedir\` para pedir otra o \`!plantarse\` para cerrar.`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};

export const plantarseCommand: Command = {
  name: "plantarse",
  aliases: ["plantar", "stand", "quedo"],
  description: "Plantate con tus cartas y dejá jugar al croupier (!plantarse).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await standBlackjack(senderJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const profitText =
      (res.netProfit || 0) > 0
        ? `+*$${res.netProfit}* fichas`
        : (res.netProfit || 0) < 0
        ? `-*$${Math.abs(res.netProfit || 0)}* fichas`
        : "$0 (Empate)";

    const message =
      `🃏 *FINAL DE LA RONDA (21)*\n\n` +
      `${res.statusText}\n\n` +
      `👤 *Tus cartas:* ${formatHand(res.playerCards || [])} (*${res.playerScore}* pts)\n` +
      `🤖 *Croupier:* ${formatHand(res.dealerCards || [])} (*${res.dealerScore}* pts)\n\n` +
      `💰 *Resultado:* ${profitText}\n` +
      `💳 *Tu saldo actual:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};
