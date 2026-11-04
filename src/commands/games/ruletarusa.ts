import { Command, CommandContext } from "../types.js";
import {
  pullRouletteTrigger,
  isUserIgnoredByRoulette,
  getRemainingDeathSeconds,
} from "../../services/games/ruletarusa.service.js";

/**
 * Minijuego de Ruleta Rusa con sanción de ignoración temporal.
 * Cero riesgo de baneo de WhatsApp.
 */
export const ruletarusaCommand: Command = {
  name: "ruletarusa",
  aliases: ["ruleta-rusa", "disparar", "gatillar"],
  description: "Probá tu suerte con el revólver. Si te toca la bala, el bot te ignora por 5 minutos.",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const userName = senderProfile?.primaryName || senderProfile?.pushName || "Valiente";

    if (isUserIgnoredByRoulette(senderJid)) {
      const remaining = getRemainingDeathSeconds(senderJid);
      await sock.sendMessage(
        remoteJid,
        {
          text: `💀 *@${senderJid.split("@")[0].split(":")[0]}*, estás muerto en el más allá.\n\nTe quedan *${remaining}s* de ignoración antes de revivir.`,
          mentions: [senderJid],
        },
        { quoted: msg as any }
      ).catch(() => {});
      return;
    }

    const result = pullRouletteTrigger(remoteJid, senderJid);

    if (result.survived) {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "😅", key: msg.key } }).catch(() => {});
      }

      const text =
        `🔫 *¡¡CLICK!!* 😅\n\n` +
        `*${userName}* apretó el gatillo en la recámara *${result.chamberNumber}/6*... ¡VACÍO!\n` +
        `Te salvaste por un pelo.\n\n` +
        `🎲 *Quedan:* ${result.remainingChambers} recámara(s) en el tambor. ¿Quién se anima al próximo tiro?`;

      await sock.sendMessage(
        remoteJid,
        { text, mentions: [senderJid] },
        { quoted: msg as any }
      ).catch(() => {});
    } else {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "💀", key: msg.key } }).catch(() => {});
      }

      const text =
        `💥 *¡¡¡¡BOOOOOOOOM!!!!* 💀🩸\n\n` +
        `*${userName}* apretó el gatillo en la recámara *${result.chamberNumber}/6*... *¡SALIÓ LA BALA!*\n\n` +
        `⚰️ *HAS MUERTO EN COMBATE.*\n` +
        `Por los próximos *5 minutos*, Empy-Bot te va a ignorar olímpicamente. No responderá a tus comandos ni a tus pedidos.\n\n` +
        `🔄 _El tambor ha sido recargado y girado nuevamente._`;

      await sock.sendMessage(
        remoteJid,
        { text, mentions: [senderJid] },
        { quoted: msg as any }
      ).catch(() => {});
    }
  },
};
