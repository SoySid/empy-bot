import { Command, CommandContext } from "../types.js";
import {
  startBossRaid,
  attackBoss,
  renderHpBar,
  ActiveBossRaid,
} from "../../services/games/boss.service.js";

export const bossCommand: Command = {
  name: "boss",
  aliases: ["raid", "jefe", "monstruo"],
  description: "Invoca un jefe de raid grupal para derrotar cooperativamente (!boss).",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const onTimeout = async (raid: ActiveBossRaid) => {
      const text =
        `⏱️ *¡EL JEFE HA ESCAPADO!*\n\n` +
        `Se agotaron los 5 minutos y nadie logró rematar a *${raid.boss.name}*.\n` +
        `¡El botín de *$${raid.poolReward.toLocaleString("es-AR")}* fichas se perdió en el abismo!`;

      await sock.sendMessage(remoteJid, { text }).catch(() => {});
    };

    const res = await startBossRaid(remoteJid, onTimeout);

    if (!res.success || !res.raid) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo invocar al jefe." }, { quoted: msg as any });
      return;
    }

    const { boss, poolReward } = res.raid;

    const text =
      `👹 *¡HA APARECIDO UN JEFE EN EL GRUPO!* ${boss.icon}\n\n` +
      `¡**${boss.name}** desciende para causar caos!\n` +
      `• *Historia:* _"${boss.description}"_\n` +
      `• *Vida:* ${renderHpBar(boss.maxHp, boss.maxHp)}\n` +
      `• *Pozo de Botín:* *$${poolReward.toLocaleString("es-AR")}* fichas a repartir entre los atacantes.\n\n` +
      `⚔️ *¡Escribí \`!atacar\` para asestarle un golpe antes de que escape!* (5 min restantes)`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const atacarCommand: Command = {
  name: "atacar",
  aliases: ["golpear", "hit", "pegar"],
  description: "Golpea al jefe activo del grupo durante una raid (!atacar).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const senderName = senderProfile?.primaryName || senderProfile?.phone || "Guerrero";

    const res = await attackBoss(remoteJid, senderJid, senderName);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo atacar." }, { quoted: msg as any });
      return;
    }

    // Si el jefe fue derrotado
    if (res.bossDefeated && res.payouts) {
      const mentionJids = res.payouts.map((p) => p.jid);
      const rankingText = res.payouts
        .map((p, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖️";
          const finisherTag = p.isFinisher ? " 💀 *[GOLPE DE GRACIA]*" : "";
          return `${medal} *${p.name}*: +*$${p.amount.toLocaleString("es-AR")}* fichas${finisherTag}`;
        })
        .join("\n");

      const victoryText =
        `🎉 *¡${res.bossName?.toUpperCase()} HA SIDO DERROTADO!* 🏆\n\n` +
        `¡El grupo cooperó con furia y mandó a dormir a la bestia!\n\n` +
        `💰 *Reparto del Botín ($${res.totalPool?.toLocaleString("es-AR")} fichas):*\n${rankingText}\n\n` +
        `_¡Las fichas ya fueron acreditadas en las billeteras de los combatientes!_`;

      await sock.sendMessage(
        remoteJid,
        { text: victoryText, mentions: mentionJids },
        { quoted: msg as any }
      );
      return;
    }

    // Si el jefe sigue vivo
    const critTag = res.isCrit ? "🔥 *¡GOLPE CRÍTICO!*" : "";
    const progressText =
      `⚔️ *¡IMPACTO!* @${senderProfile?.phone || senderName} golpeó a *${res.bossName}* infligiendo **-${res.damageDealt} HP**! ${critTag}\n\n` +
      `❤️ *Vida restante:* ${res.hpBar}\n` +
      `_¡Sigan golpeando con \`!atacar\`!_`;

    await sock.sendMessage(
      remoteJid,
      { text: progressText, mentions: [senderJid] },
      { quoted: msg as any }
    );
  },
};
