import { Command, CommandContext } from "../types.js";
import { feedOtherUser } from "../../services/shop.service.js";
import { formatUserName } from "../../services/db/user.service.js";

export const alimentarCommand: Command = {
  name: "alimentar",
  aliases: ["invitar", "darcomida", "alimenta", "invita", "convidar"],
  description: "Invitale o dale de comer/beber a otro miembro (!invitar @usuario [comida/bebida]).",
  execute: async ({ sock, msg, remoteJid, cleanText, args, contextInfo, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const targetJid =
      contextInfo?.mentionedJid?.[0] ||
      contextInfo?.participant ||
      "";

    if (!targetJid) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🍲 *INVITAR / CONVIDAR MORFI O BEBIDA*\n\n` +
            `Podés salvar a un amigo de la inanición invitándole comida o bebida de tu mochila, o comprándosela al paso si no tenés.\n\n` +
            `Uso: \`!invitar @usuario [comida/bebida]\` (o \`!darcomida @usuario [comida]\`)\n` +
            `_Ejemplos:_\n` +
            `• \`!invitar @amigo\` (usa comida de tu mochila o compra chipa)\n` +
            `• \`!invitar @amigo guiso\`\n` +
            `• \`!invitar @amigo coquita\`\n` +
            `• \`!invitar @amigo keke\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    // Encontrar el argumento de comida/bebida si lo hubo
    const foodQuery = args.find((a) => !a.startsWith("@") && !/^\d{10,}$/.test(a));

    const isDrink = foodQuery === "bebida" || (foodQuery && ["coquita", "cocido", "manaos", "terere", "fernet"].includes(foodQuery.toLowerCase()));
    const preferredCategory: "comida" | "bebida" = isDrink ? "bebida" : "comida";

    const res = await feedOtherUser(senderJid, targetJid, foodQuery, preferredCategory);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
      return;
    }

    const giverName = formatUserName(senderJid);
    const targetName = formatUserName(targetJid);
    const { item, fromInventory, autoBoughtCost, giverBalance, targetHungerBar, jobBuffTurns } = res;

    const originText = fromInventory
      ? `🎒 *Origen:* Convidado directamente de tu mochila.`
      : `🛒 *Origen:* No tenías en la mochila, se compró al paso por *$${autoBoughtCost}* fichas.`;

    const message =
      `🍲 *¡SOLIDARIDAD POPULAR!* 🍲\n\n` +
      `${giverName} tuvo un noble gesto y le convidó *${item?.name}* a ${targetName}.\n\n` +
      `"${item?.consumeText}"\n\n` +
      `${originText}\n` +
      `🔋 *Energía de ${targetName}:* ${targetHungerBar}\n` +
      `💪 *Buff de Morfi:* +30% de cobro en sus próximas ${jobBuffTurns} changas.\n` +
      `💳 *Tu saldo restante:* *$${giverBalance}* fichas.\n\n` +
      `_¡Salvaste a un compañero de desmayarse y que el bot le borre los mensajes por inanición!_`;

    await sock.sendMessage(remoteJid, {
      text: message,
    });
  },
};
