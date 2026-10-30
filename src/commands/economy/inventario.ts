import { Command, CommandContext } from "../types.js";
import { getUserInventory } from "../../services/shop.service.js";

export const inventarioCommand: Command = {
  name: "inventario",
  aliases: ["mochila", "items", "misitems"],
  description: "Muestra las comidas, bebidas y provisiones que tenés guardadas en tu mochila (!inventario).",
  execute: async ({ sock, msg, remoteJid, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const items = await getUserInventory(senderJid);

    if (items.length === 0) {
      const emptyText =
        `🎒 *TU INVENTARIO ESTÁ VACÍO*\n\n` +
        `No tenés ninguna comida, herramienta ni propiedad registrada.\n\n` +
        `¡Pasate por la \`!tienda\` para equiparte o comprarte unos chipás para recargar energía!`;
      await sock.sendMessage(remoteJid, { text: emptyText }, { quoted: msg as any });
      return;
    }

    // Clasificar ítems por categoría
    const consumables = items.filter(
      ({ item }) => (item.category === "comida" || item.category === "bebida" || item.category === "kiosco") && !item.uniqueProfessionItem
    );
    const tools = items.filter(
      ({ item }) => item.category === "herramienta"
    );
    const relics = items.filter(
      ({ item }) => item.uniqueProfessionItem
    );
    const businesses = items.filter(({ item }) => item.category === "negocio");
    const collectibles = items.filter(
      ({ item }) => item.category === "coleccionable"
    );

    const sections: string[] = [];

    // 1. Mochila (Morfi y Bebidas)
    if (consumables.length > 0) {
      const list = consumables
        .map(({ item, quantity }) => {
          const verb = item.category === "bebida" ? "tomar" : "comer";
          return `• ${item.icon} *${item.name}* x${quantity} (\`!${verb} ${item.id}\`)`;
        })
        .join("\n");
      sections.push(`🎒 *MOCHILA & PROVISIONES:*\n${list}`);
    }

    // 2. Herramientas
    if (tools.length > 0) {
      const list = tools
        .map(({ item }, idx) => {
          const buffSummary = item.buff
            ? ` [${item.buff.earningsBonusPercent ? `+${item.buff.earningsBonusPercent}% ` : ""}${item.buff.cooldownReductionSec ? `-${item.buff.cooldownReductionSec}s ` : ""}${item.buff.hungerReductionPercent ? `-${item.buff.hungerReductionPercent}% h` : ""}]`
            : "";
          return `${idx + 1}. ${item.icon} *${item.name}*${buffSummary}`;
        })
        .join("\n");
      sections.push(`🧰 *HERRAMIENTAS DE OFICIO:*\n${list}`);
    }

    // 3. Reliquias
    if (relics.length > 0) {
      const list = relics
        .map(({ item }) => {
          const buffSummary = item.buff
            ? ` [${item.buff.earningsBonusPercent ? `+${item.buff.earningsBonusPercent}% ` : ""}${item.buff.cooldownReductionSec ? `-${item.buff.cooldownReductionSec}s ` : ""}${item.buff.hungerReductionPercent ? `-${item.buff.hungerReductionPercent}% h` : ""}]`
            : "";
          return `• ${item.icon} *${item.name}*${buffSummary}`;
        })
        .join("\n");
      sections.push(`✨ *RELIQUIAS ÚNICAS:*\n${list}`);
    }

    // 4. Negocios y Sedes Propias
    if (businesses.length > 0) {
      let totalPer50 = 0;
      const list = businesses
        .map(({ item, quantity }) => {
          const bonus = (item.passiveMessageBonus || item.passiveDailyBonus || 500) * quantity;
          totalPer50 += bonus;
          return `• ${item.icon} *${item.name}* x${quantity} (+$${bonus.toLocaleString("es-AR")} c/50 msgs)`;
        })
        .join("\n");
      sections.push(`🏢 *PROPIEDADES (+$${totalPer50.toLocaleString("es-AR")} c/50 msgs):*\n${list}`);
    }

    // 5. Coleccionables
    if (collectibles.length > 0) {
      const list = collectibles
        .map(({ item }) => `• ${item.icon} *${item.name}*`)
        .join("\n");
      sections.push(`🚗 *GARAJE & COLECCIÓN:*\n${list}`);
    }

    const userName = senderProfile?.primaryName ? `DE ${senderProfile.primaryName.toUpperCase()}` : "PERSONAL";
    const message =
      `📦 *INVENTARIO ${userName}*\n\n` +
      sections.join("\n\n");

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};
