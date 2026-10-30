import { Command, CommandContext } from "../types.js";
import { consumeOrAutoBuy } from "../../services/shop.service.js";

export const comerCommand: Command = {
  name: "comer",
  aliases: ["morfar", "tomar", "beber", "usar", "consumir"],
  description: "Comé o bebé de tu mochila (o compralo automáticamente si no tenés) (!comer [comida], !tomar [bebida]).",
  execute: async ({ sock, msg, remoteJid, cleanText, args, senderProfile, body }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const invokedCmd = (body.trim().replace(/^[!/]/, "").split(/\s+/)[0] || "").toLowerCase();
    const isDrink = invokedCmd === "beber" || invokedCmd === "tomar" || args[0]?.toLowerCase() === "bebida";
    const preferredCategory: "comida" | "bebida" = isDrink ? "bebida" : "comida";

    // Argumento del ítem (ej: "chipa", "comida", "bebida", o undefined)
    const itemArg = args[0];

    const res = await consumeOrAutoBuy(senderJid, itemArg, preferredCategory);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const { item, fromInventory, autoBoughtCost, remainingQty, effectMessage, hungerBar, jobBuffTurns } = res;
    const effectExtra = effectMessage ? `\n\n${effectMessage}` : "";
    const hungerExtra = hungerBar
      ? `\n\n🔋 *Nivel de Energía:* ${hungerBar}\n💪 *Buff de Laburo:* ¡+30% en tus próximas ${jobBuffTurns} changas!`
      : "";

    const originText = fromInventory
      ? `🎒 *Mochila:* Consumiste 1 unidad de tu inventario (te quedan ${remainingQty}).`
      : `🛒 *Auto-compra:* No tenías en la mochila, se compró al paso por *$${autoBoughtCost}* fichas.`;

    const titleAction = isDrink || item?.category === "bebida" ? "¡SALUD!" : "¡PROVECHO!";

    const message =
      `${item?.icon} *${titleAction}* (${item?.name})${effectExtra}${hungerExtra}\n\n` +
      `${originText}`;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};
