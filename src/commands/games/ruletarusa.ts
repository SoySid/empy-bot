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
  description: "Probá tu suerte con el revólver. Si sale la bala, el bot te ignora por 1 minuto.",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const userName = senderProfile?.primaryName || senderProfile?.pushName || "Valiente";

    if (isUserIgnoredByRoulette(senderJid)) {
      const remaining = getRemainingDeathSeconds(senderJid);
      await sock.sendMessage(
        remoteJid,
        {
          text: `💀 *@${senderJid.split("@")[0].split(":")[0]}*, seguís fiambre.\n\nTe quedan *${remaining}s* de silencio antes de volver al juego.`,
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
        `🔫 *Click.* Zafaste.\n\n` +
        `*${userName}* gatilló la recámara *${result.chamberNumber}/6*... ¡Vacía!\n\n` +
        `🎲 Quedan *${result.remainingChambers}* tiro(s) en el tambor. ¿Quién sigue?`;

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
        `💥 *¡PUM!* Al lobby.\n\n` +
        `*${userName}* gatilló la recámara *${result.chamberNumber}/6* y salió el plomo.\n\n` +
        `⚰️ Quedás mudo por *1 minuto*. Empy no te va a registrar hasta que revivas.\n\n` +
        `🔄 _Tambor recargado y girado._`;

      await sock.sendMessage(
        remoteJid,
        { text, mentions: [senderJid] },
        { quoted: msg as any }
      ).catch(() => {});
    }
  },
};
