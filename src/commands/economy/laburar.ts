import { Command, CommandContext } from "../types.js";
import { executeJob } from "../../services/economy.service.js";
import { JobCategory } from "../../config/economy.config.js";

export const laburarCommand: Command = {
  name: "laburar",
  aliases: ["changa", "trabajar", "laburo"],
  description: "Hacé una changa de tu oficio cada 1:30 min (o 45s con herramientas) para ganar fichas (!laburar).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await executeJob(senderJid, undefined, sock, remoteJid);

    if (!res.success && res.error) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error },
        { quoted: msg as any }
      );
      return;
    }

    if (!res.success && res.isStarved) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `💀 *¡SIN ENERGÍA!* (0%)\nNo tenés fuerzas para laburar. Comé algo con \`!comer\` o compralo en la \`!tienda\`.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    if (!res.success && res.onCooldown) {
      const remainingMs = res.remainingMs || 0;
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.ceil((remainingMs % 60000) / 1000);
      const timeText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      await sock.sendMessage(
        remoteJid,
        {
          text: `⏳ *Descansando:* Podés volver a laburar en *${timeText}*.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const rubroText = res.professionName
      ? `${res.professionIcon} ${res.professionName}`
      : "Changarín General";

    const statusBadge = res.isSuccess
      ? "✅ *CHANGA EXITOSA*"
      : "💥 *¡QUÉ CAGADA TE MANDASTE!*";

    const hungerText = res.newHunger !== undefined
      ? ` | 🔋 *Energía:* ${res.newHunger}%`
      : "";

    const storyText = res.story ? `${res.story}\n\n` : "";
    
    // Desglose transparente de multiplicadores
    const breakdownParts: string[] = [`Base: *$${(res.baseReward ?? 2500).toLocaleString("es-AR")}*`];
    if (res.multiplier && res.multiplier !== 1.0) {
      breakdownParts.push(`${res.weatherIcon || "🌦️"} Clima *x${res.multiplier}*`);
    }
    if (res.hadFoodBuff) {
      breakdownParts.push(`⚡ Buff *+30%*`);
    } else if (res.hasJobNerf) {
      breakdownParts.push(`📉 Nerf *-30%*`);
    }
    if (res.toolBonusPercent) {
      breakdownParts.push(`🛠️ Herramientas *+${res.toolBonusPercent}%*`);
    }

    const breakdownNotice = `\n📊 *Desglose:* ${breakdownParts.join(" | ")}`;

    const weatherNotice = res.weatherResisted
      ? `\n🌦️ *Clima:* ${res.weatherIcon} ${res.weatherName} _(¡Mitigado por herramientas/sede!)_`
      : "";

    const buffNotice = res.hadFoodBuff
      ? `\n⚡ *Buff activo:* +30% ganancias (${res.foodBuffRemaining} turnos restantes)`
      : res.hasJobNerf
      ? `\n📉 *Nerf activo:* -30% ganancias (${res.foodBuffRemaining} turnos restantes)`
      : "";

    const toolNotice = res.toolBonusPercent
      ? `\n🛠️ *Herramientas:* +${res.toolBonusPercent}% en changas`
      : "";

    const wearNotice = res.isToolBroken
      ? `\n⚠️ *¡Tu herramienta ${res.toolName || "principal"} quedó desafilada al 0%!* No dará buffs hasta que la afiles con \`!afilar\`.`
      : res.toolDurability !== undefined && res.toolDurability <= 20
      ? `\n⚠️ *Desgaste:* ${res.toolName || "Herramienta"} al ${res.toolDurability}%. Podés afilarla con \`!afilar\`.`
      : "";

    const payoutNotice = `💰 *Cobro:* +*$${(res.earnings ?? 0).toLocaleString("es-AR")}* fichas (Saldo: *$${(res.newBalance ?? 0).toLocaleString("es-AR")}*)`;

    const message =
      `${statusBadge} (${rubroText})\n\n` +
      `${storyText}` +
      `${payoutNotice}${breakdownNotice}${hungerText}${weatherNotice}${buffNotice}${toolNotice}${wearNotice}`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};
