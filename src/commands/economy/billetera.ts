import { Command, CommandContext } from "../types.js";
import { getWallet, transfer } from "../../services/economy.service.js";
import { formatUserName } from "../../services/db/user.service.js";

export const billeteraCommand: Command = {
  name: "billetera",
  aliases: ["saldo", "bal", "wallet"],
  description: "Consultá tu saldo, escudos y cooldowns disponibles (o el de otro usuario mencionado).",
  execute: async ({ sock, msg, remoteJid, contextInfo, senderProfile }: CommandContext) => {
    const userSenderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const targetJid =
      contextInfo?.mentionedJid?.[0] ||
      contextInfo?.participant ||
      userSenderJid;

    const isSelf = targetJid === userSenderJid;
    const wallet = await getWallet(targetJid);
    const targetName = formatUserName(targetJid);

    // Job cooldown format
    const jobMins = Math.floor(wallet.jobRemainingMs / 60000);
    const jobSecs = Math.ceil((wallet.jobRemainingMs % 60000) / 1000);
    const jobTimeFormatted = jobMins > 0 ? `${jobMins}m ${jobSecs}s` : `${jobSecs}s`;
    const jobStatus = wallet.canJob
      ? "✅ *Listo para laburar* (`!laburar`)"
      : `⏳ Descansando (${jobTimeFormatted})`;

    // Daily format
    const dailyMinutes = Math.ceil(wallet.dailyRemainingMs / (60 * 1000));
    const dailyHours = Math.floor(dailyMinutes / 60);
    const dailyMins = dailyMinutes % 60;
    const dailyStatus = wallet.dailyCreditedJustNow
      ? "🎁 *¡Acreditado recién!* (+250)"
      : `⏳ En ${dailyHours}h ${dailyMins}m`;

    const titleHeader = isSelf
      ? "💳 *TU BILLETERA*"
      : `💳 *BILLETERA DE ${targetName}*`;

    const userTitleText = wallet.title ? `🎖️ *Título:* "${wallet.title}"\n` : "";
    const profText = wallet.professionName
      ? `👷 *Oficio:* ${wallet.professionIcon} *${wallet.professionName}*\n`
      : `👷 *Oficio:* 🎲 *Changarín Libre* (\`!profesion\`)\n`;

    let toolsText = "";
    if (wallet.professionBuffs && wallet.professionBuffs.ownedTools.length > 0) {
      const b = wallet.professionBuffs;
      toolsText = `🧰 *Herramientas:* ${b.ownedTools.length}/7 (+${b.earningsBonusPercent}% cobro${b.cooldownReductionSec > 0 ? ` | -${b.cooldownReductionSec}s` : ""})\n`;
    }

    let relicText = "";
    if (wallet.relics && wallet.relics.length > 0) {
      const rNames = wallet.relics.map((r) => `${r.icon} ${r.name}`).join(", ");
      relicText = `✨ *Reliquia:* ${rNames}\n`;
    }

    let businessText = "";
    if (wallet.businesses && wallet.businesses.length > 0) {
      const bNames = wallet.businesses.map((b) => `${b.icon} ${b.name}`).join(", ");
      const totalBonus = wallet.businesses.reduce((acc: number, b: any) => acc + (b.passiveMessageBonus || b.passiveDailyBonus || 500), 0);
      businessText = `🏢 *Propiedades:* ${bNames} (+$${totalBonus.toLocaleString("es-AR")} c/50 msgs)\n`;
    }

    let collectText = "";
    if (wallet.collectibles && wallet.collectibles.length > 0) {
      const cNames = wallet.collectibles.map((c) => `${c.icon} ${c.name}`).join(", ");
      collectText = `🚗 *Colección:* ${cNames}\n`;
    }

    const jobBuffText = wallet.jobBuffTurns && wallet.jobBuffTurns > 0
      ? `💪 *Morfi:* +30% cobro (${wallet.jobBuffTurns} changas restantes)\n`
      : wallet.jobBuffTurns && wallet.jobBuffTurns < 0
      ? `📉 *Castigo:* -30% cobro (${Math.abs(wallet.jobBuffTurns)} changas restantes)\n`
      : "";

    const text =
      `${titleHeader}\n\n` +
      userTitleText +
      profText +
      `💰 *Saldo:* *$${wallet.balance.toLocaleString("es-AR")}* fichas\n` +
      `🔋 *Energía:* ${wallet.hungerBar}${wallet.hunger <= 15 ? " ⚠️ *¡CRÍTICO!*" : ""}\n\n` +
      toolsText +
      relicText +
      businessText +
      collectText +
      jobBuffText +
      `💼 *Laburo:* ${jobStatus}\n` +
      `📅 *Diario:* ${dailyStatus}`;

    await sock.sendMessage(
      remoteJid,
      { text },
      { quoted: msg as any }
    );
  },
};

export const transferirCommand: Command = {
  name: "transferir",
  aliases: ["pagar", "transfer", "dar"],
  description: "Transferí fichas de tu saldo a otro miembro del grupo: !transferir @usuario <monto>",
  execute: async ({ sock, msg, remoteJid, args, contextInfo, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const targetJid =
      contextInfo?.mentionedJid?.[0] ||
      contextInfo?.participant ||
      "";

    // Filtrar los args para excluir menciones explícitas (@123456) y el targetJid
    const nonMentionArgs = args.filter(
      (a) => !a.startsWith("@") && (!targetJid || !targetJid.includes(a.replace(/\D/g, "")))
    );

    let amount = NaN;
    for (const arg of nonMentionArgs) {
      const cleanNum = arg.replace(/[\$,\.]/g, "").trim();
      if (/^\d+$/.test(cleanNum)) {
        const val = parseInt(cleanNum, 10);
        if (val > 0 && val <= 100_000_000) {
          amount = val;
          break;
        }
      }
    }

    if (!targetJid || isNaN(amount) || amount <= 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `💸 *TRANSFERENCIA DE FICHAS*\n\n` +
            `Uso: \`!transferir @usuario <monto>\` (o respondé al mensaje del usuario).\n\n` +
            `_Ejemplo:_ \`!transferir @amigo 150\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    const res = await transfer(senderJid, targetJid, amount);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const senderName = formatUserName(senderJid);
    const targetName = formatUserName(targetJid);

    const text =
      `💸 *TRANSFERENCIA EXITOSA*\n\n` +
      `${senderName} le transfirió *$${amount}* fichas a ${targetName}.\n\n` +
      `• *Tu nuevo saldo:* *$${res.senderBalance}* fichas\n` +
      `• *Saldo del destinatario:* *$${res.targetBalance}* fichas`;

    await sock.sendMessage(remoteJid, {
      text,
    });
  },
};
