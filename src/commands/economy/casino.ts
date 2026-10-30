import { Command, CommandContext } from "../types.js";
import { executeRoulette, executeSlot } from "../../services/economy.service.js";
import { prisma } from "../../services/db/prisma.js";

export const ruletaCommand: Command = {
  name: "ruleta",
  aliases: ["roulette"],
  description: "Apostá a la ruleta: !ruleta <color|monto> <monto|color> (Rojo/Negro paga 2x, Verde paga 14x).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const arg1 = (args[0] || "").toLowerCase().trim();
    const arg2 = (args[1] || "").toLowerCase().trim();

    const colorSynonyms: Record<string, "rojo" | "negro" | "verde"> = {
      rojo: "rojo",
      roja: "rojo",
      red: "rojo",
      r: "rojo",
      negro: "negro",
      negra: "negro",
      black: "negro",
      n: "negro",
      verde: "verde",
      green: "verde",
      v: "verde",
    };

    let targetColor: "rojo" | "negro" | "verde" | undefined;
    let targetAmount: number | undefined;

    // Detectar cuál argumento es el color
    if (colorSynonyms[arg1]) {
      targetColor = colorSynonyms[arg1];
    } else if (colorSynonyms[arg2]) {
      targetColor = colorSynonyms[arg2];
    }

    // El otro argumento es el monto
    const rawAmountArg = targetColor === colorSynonyms[arg1] ? arg2 : arg1;

    if (["all", "todo", "toda"].includes(rawAmountArg)) {
      const cur = await prisma.userProfile.findUnique({ where: { jid: senderJid } });
      const balance = cur?.balance ?? senderProfile?.balance ?? 0;
      if (balance < 20) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ *Saldo insuficiente:* Tenés apenas *$${balance}* fichas para apostar (el mínimo es *$20*).` },
          { quoted: msg as any }
        );
        return;
      }
      targetAmount = Math.min(balance, 1000);
    } else {
      const parsed = parseInt(rawAmountArg, 10);
      if (!isNaN(parsed) && parsed > 0) {
        targetAmount = parsed;
      }
    }

    if (!targetColor || !targetAmount) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🎰 *RULETA CLÁSICA (Casino de Empyreal)*\n\n` +
            `Podés apostar en cualquier orden:\n` +
            `• \`!ruleta <color> <monto>\` (ej: \`!ruleta rojo 100\`)\n` +
            `• \`!ruleta <monto> <color>\` (ej: \`!ruleta 100 rojo\` o \`!ruleta 100 roja\`)\n` +
            `• \`!ruleta todo negro\` (apuesta todo tu saldo hasta $1000)\n\n` +
            `• *Colores válidos:* \`rojo\` / \`roja\`, \`negro\` / \`negra\` (pagan 2x), o \`verde\` (paga 14x)\n` +
            `• *Apuesta permitida:* Entre $20 y $1000 fichas.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const res = await executeRoulette(senderJid, targetColor, targetAmount);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const colorEmoji =
      res.rollColor === "verde" ? "🟢" : res.rollColor === "rojo" ? "🔴" : "⚫";
    const resultBadge = res.won
      ? "🎉 *¡GANASTE!*"
      : res.amuletoSaved
      ? "🎗️ *¡SALVADO POR EL GAUCHITO!*"
      : "💸 *PERDISTE*";
    const profitText = res.won
      ? `+*$${res.netProfit}* fichas (Total cobrado: *$${res.winAmount}*)`
      : res.amuletoSaved
      ? `*$0* fichas (¡Tu *Estampita del Gauchito* intercedió y no perdiste la apuesta!)`
      : `-*$${targetAmount}* fichas`;

    const text =
      `🎰 *RULETA - RESULTADO*\n\n` +
      `• *Tu apuesta:* *$${targetAmount}* fichas al *${targetColor?.toUpperCase()}*\n` +
      `• *Salió:* ${colorEmoji} *Número ${res.rollNumber} (${res.rollColor?.toUpperCase()})*\n\n` +
      `${resultBadge}\n` +
      `• *Balance de la jugada:* ${profitText}\n` +
      `• *Tu saldo actual:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const slotCommand: Command = {
  name: "slot",
  aliases: ["slots", "tragamonedas"],
  description: "Jugá al tragamonedas: !slot <monto> (Entre $20 y $1000 fichas).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const arg0 = (args[0] || "").toLowerCase().trim();
    let rawAmount: number;

    if (["all", "todo", "toda"].includes(arg0)) {
      const cur = await prisma.userProfile.findUnique({ where: { jid: senderJid } });
      const balance = cur?.balance ?? senderProfile?.balance ?? 0;
      if (balance < 20) {
        await sock.sendMessage(
          remoteJid,
          { text: `❌ *Saldo insuficiente:* Tenés apenas *$${balance}* fichas para apostar (el mínimo es *$20*).` },
          { quoted: msg as any }
        );
        return;
      }
      rawAmount = Math.min(balance, 1000);
    } else {
      rawAmount = parseInt(arg0, 10);
    }

    if (isNaN(rawAmount) || rawAmount <= 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🎰 *TRAGAMONEDAS (SLOT)*\n\n` +
            `Uso: \`!slot <monto>\` (o \`!slot todo\`)\n` +
            `• *Apuesta permitida:* Entre $20 y $1000 fichas.\n\n` +
            `💎 *Premios triples:*\n` +
            `• 7️⃣ 7️⃣ 7️⃣ = x25 (JACKPOT)\n` +
            `• 💎 💎 💎 = x15\n` +
            `• 🔔 🔔 🔔 = x10\n` +
            `• 🍇 🍇 🍇 = x6\n` +
            `• 🍋 🍋 🍋 = x4\n` +
            `• 🍒 🍒 🍒 = x3\n` +
            `• 2 iguales (7️⃣/💎) = x1.5 / otros = x1.1`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const res = await executeSlot(senderJid, rawAmount);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const reelsDisplay = `[ ${res.reels?.[0]} | ${res.reels?.[1]} | ${res.reels?.[2]} ]`;
    const resultBadge = res.won ? `🎉 *¡PREMIO!* (x${res.multiplier})` : "💨 *AGUA* (No hubo coincidencia)";
    const profitText = res.won ? `+*$${res.netProfit}* fichas` : `-*$${rawAmount}* fichas`;

    const text =
      `🎰 *TRAGAMONEDAS*\n\n` +
      `╔═════════════╗\n` +
      `   ${reelsDisplay}\n` +
      `╚═════════════╝\n\n` +
      `${resultBadge}\n` +
      `• *Apuesta:* $${rawAmount}\n` +
      `• *Ganancia neta:* ${profitText}\n` +
      `• *Tu saldo actual:* *$${res.newBalance}* fichas`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
