import { Command, CommandContext } from "../types.js";
import { assistCommunityEmergency } from "../../services/community.service.js";
import { formatUserName } from "../../services/db/user.service.js";

export const asistirCommand: Command = {
  name: "asistir",
  aliases: ["auxilio", "curar", "reparar", "ayudar", "servicio", "socorro"],
  description: "Interviene y asiste profesionalmente en una urgencia comunitaria activa del barrio.",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await assistCommunityEmergency(remoteJid, senderJid);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: res.error || "No pudiste resolver la urgencia." },
        { quoted: msg as any }
      );
      return;
    }

    const helperName = formatUserName(res.helperJid!);
    const victimName = formatUserName(res.victimJid!);

    const bonusParts: string[] = [];
    if (res.toolBonusPercent) {
      bonusParts.push(`+${res.toolBonusPercent}% herramientas/reliquias`);
    }
    if (res.hadFoodBuff) {
      bonusParts.push(`+30% comida`);
    }
    const bonusText = bonusParts.length > 0
      ? `\n   _(Base: $${res.baseReward?.toLocaleString("es-AR")} con ${bonusParts.join(" y ")})_`
      : "";

    const text =
      `🎉 *¡URGENCIA COMUNITARIA RESUELTA CON ÉXITO!* 🛠️\n\n` +
      `El/La profesional ${helperName} acudió volando como *${res.professionTitle}* y le salvó las papas a ${victimName}.\n\n` +
      `💵 *Recompensa para el profesional:* +*$${res.rewardHelper?.toLocaleString("es-AR")}* fichas en mano${bonusText}\n` +
      `   _(Nuevo saldo: $${res.newHelperBalance?.toLocaleString("es-AR")})_\n\n` +
      `💪 *Beneficio para la víctima:* ¡Recuperó el aliento y recibe *+15% de cobro* en sus próximas ${res.rewardBuffTurns} changas!\n\n` +
      `🤝 _La solidaridad y los oficios barriales mueven la economía._`;

    await sock.sendMessage(
      remoteJid,
      {
        text,
      },
      { quoted: msg as any }
    );
  },
};
