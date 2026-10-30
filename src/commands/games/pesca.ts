import { Command, CommandContext } from "../types.js";
import {
  castFishingLine,
  getUserFishingState,
  buyFishingShopItem,
} from "../../services/games/pesca.service.js";
import { FISH_CATALOG, FISHING_SHOP } from "../../config/fish.config.js";

export const pescarCommand: Command = {
  name: "pescar",
  aliases: ["pesca", "fish"],
  description: "Tirá la caña al río para pescar peces coleccionables y ganar fichas (!pescar).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const res = await castFishingLine(senderJid);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "Error al pescar." }, { quoted: msg as any });
      return;
    }

    // Caso de blooper / lance fallido
    if (res.blooper && !res.blooper.savedByRepelente) {
      const junkBonus = res.blooper.junkPrice ? `\n• *Cobro de consuelo:* +*$${res.blooper.junkPrice}* fichas` : "";
      const balanceLine = res.newBalance !== undefined ? `\n💳 *Tu saldo actual:* *$${res.newBalance.toLocaleString("es-AR")}* fichas` : "";
      const blooperText =
        `🎣 *¡PIQUE EN EL RÍO!*\n\n` +
        `${res.blooper.message}${junkBonus}\n\n` +
        `🪱 *Carnadas restantes:* ${res.chargesRemaining}/${res.maxCharges}${balanceLine}\n` +
        `📖 *Álbum del Acuario:* ${res.totalSpeciesDiscovered}/30 especies (\`!acuario\`)`;

      await sock.sendMessage(remoteJid, { text: blooperText }, { quoted: msg as any });
      return;
    }

    const fish = res.fish!;
    const tierStars =
      fish.tier === 5 ? "🧪 MÍTICO ⭐⭐⭐⭐⭐" :
      fish.tier === 4 ? "👑 LEGENDARIO ⭐⭐⭐⭐" :
      fish.tier === 3 ? "🦈 ÉPICO ⭐⭐⭐" :
      fish.tier === 2 ? "🐠 RARO ⭐⭐" : "🐟 COMÚN ⭐";

    const newTag = res.isNewSpecies ? "\n✨ *¡NUEVA ESPECIE DESCUBIERTA PARA TU ÁLBUM!*" : "";
    const recordTag = res.isNewRecord ? "\n🏆 *¡NUEVO RÉCORD PERSONAL DE PESO!*" : "";
    const repelenteTag = res.blooper?.savedByRepelente ? `\n${res.blooper.message}\n` : "";
    const conservadoraTag = res.conservadoraBonus ? `\n• *Conservadora Térmica:* +*$${res.conservadoraBonus.toLocaleString("es-AR")}* fichas (frescura 🧊)` : "";
    const weightBonusTag = res.priceBonus ? ` (+$${res.priceBonus.toLocaleString("es-AR")} por ejemplar pesado)` : "";

    const text =
      `🎣 *¡PIQUE EN EL RÍO!*\n\n` +
      `¡Tiraste la línea con tu *${res.equippedRodName}* y sacaste un *${fish.name}*! ${fish.icon}\n` +
      `• *Peso registrado:* *${res.weightKg} kg*${weightBonusTag}\n` +
      `• *Rareza:* ${tierStars}\n` +
      `• *Valor de venta:* +*$${res.price?.toLocaleString("es-AR")}* fichas${conservadoraTag}\n` +
      `• *Detalle:* _"${fish.lore}"_\n` +
      `${repelenteTag}${newTag}${recordTag}\n\n` +
      `🪱 *Carnadas restantes:* ${res.chargesRemaining}/${res.maxCharges}\n` +
      `💳 *Tu saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas\n` +
      `📖 *Álbum del Acuario:* ${res.totalSpeciesDiscovered}/30 especies (\`!acuario\`)`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const acuarioCommand: Command = {
  name: "acuario",
  aliases: ["balde", "peces", "coleccionpesca"],
  description: "Muestra tu álbum de peces coleccionados, récords de peso y equipo de pesca (!acuario).",
  execute: async ({ sock, remoteJid, msg, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const state = await getUserFishingState(senderJid);

    const fishes = Object.values(FISH_CATALOG);
    const totalFishes = fishes.length;
    const discovered = state.collection.length;
    const percent = Math.round((discovered / totalFishes) * 100);

    // Conteo por rareza
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const tierTotals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of fishes) {
      tierTotals[f.tier] = (tierTotals[f.tier] || 0) + 1;
      if (state.collection.includes(f.id)) {
        tierCounts[f.tier] = (tierCounts[f.tier] || 0) + 1;
      }
    }

    const tierBreakdown =
      `• 🐟 *Comunes:* ${tierCounts[1]}/${tierTotals[1]} ${tierCounts[1] === tierTotals[1] ? "✅" : ""}\n` +
      `• 🐠 *Raros:* ${tierCounts[2]}/${tierTotals[2]} ${tierCounts[2] === tierTotals[2] ? "✅" : ""}\n` +
      `• 🦈 *Épicos:* ${tierCounts[3]}/${tierTotals[3]} ${tierCounts[3] === tierTotals[3] ? "✅" : ""}\n` +
      `• 👑 *Legendarios:* ${tierCounts[4]}/${tierTotals[4]} ${tierCounts[4] === tierTotals[4] ? "✅" : ""}\n` +
      `• 🧪 *Míticos:* ${tierCounts[5]}/${tierTotals[5]} ${tierCounts[5] === tierTotals[5] ? "✅" : ""}`;

    // Récord
    let recordText = "Sin capturas registradas";
    if (state.maxWeightRecord) {
      const recFish = FISH_CATALOG[state.maxWeightRecord.fishId];
      recordText = `${recFish?.icon || "🐟"} *${recFish?.name || state.maxWeightRecord.fishId}* de *${state.maxWeightRecord.weightKg} kg*`;
    }

    // Equipo equipado
    const cañaName = state.ownedItems.includes("cana_grafito")
      ? "Caña de Grafito & Riel Rotativo 🏆"
      : state.ownedItems.includes("cana_fibra")
      ? "Caña de Fibra de Vidrio 🎣"
      : "Mojarrera de Tacuara (Inicial)";

    const accesorios = state.ownedItems.filter((it) => it !== "cana_grafito" && it !== "cana_fibra");
    const accText = accesorios.length > 0
      ? accesorios.map((a) => FISHING_SHOP[a]?.name || a).join(", ")
      : "Ninguno";

    // Cebos y mejoras activas
    const activeBuffsList: string[] = [];
    if (state.activeBuffs.tier2Uses && state.activeBuffs.tier2Uses > 0) {
      activeBuffsList.push(`🍯 Masa dulce (${state.activeBuffs.tier2Uses} usos restantes)`);
    }
    if (state.activeBuffs.tier3Uses && state.activeBuffs.tier3Uses > 0) {
      activeBuffsList.push(`🐟 Mojarra viva (${state.activeBuffs.tier3Uses} usos restantes)`);
    }
    if (state.activeBuffs.antiBlooperUses && state.activeBuffs.antiBlooperUses > 0) {
      activeBuffsList.push(`🧴 Repelente Off! (${state.activeBuffs.antiBlooperUses} usos restantes)`);
    }
    const buffsDisplay = activeBuffsList.length > 0 ? activeBuffsList.join("\n• ") : "Ninguno";

    const text =
      `🌊 *TU ÁLBUM DE PESCA & ACUARIO* 🐠\n\n` +
      `📊 *Progreso de Colección:* *${discovered}/${totalFishes}* (${percent}% completado)\n` +
      `${tierBreakdown}\n\n` +
      `🏆 *Mayor Captura Histórica:* ${recordText}\n` +
      `🎣 *Caña Equipada:* ${cañaName}\n` +
      `🧰 *Accesorios Permanentes:* ${accText}\n` +
      `🎒 *Cebos & Protección:* \n• ${buffsDisplay}\n\n` +
      `🪱 *Carnadas actuales:* ${state.charges}/${state.ownedItems.includes("cana_fibra") ? 8 : 5}\n\n` +
      `_Tirá la caña con \`!pescar\` o equipate en \`!tiendapesca\`._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const tiendaPescaCommand: Command = {
  name: "tiendapesca",
  aliases: ["pescatienda", "tiendadepesca"],
  description: "Muestra los artículos, cañas y cebos de la tienda de pesca (!tiendapesca).",
  execute: async (ctx: CommandContext) => {
    // Si pasaron un argumento (ej: !tiendapesca pote_lombrices), derivar a compra directa
    if (ctx.args.length > 0) {
      await comprarPescaCommand.execute(ctx);
      return;
    }

    const { sock, remoteJid, msg } = ctx;
    const items = Object.values(FISHING_SHOP);

    const carnadas = items.filter((i) => i.category === "carnada");
    const cañas = items.filter((i) => i.category === "cana");
    const accesorios = items.filter((i) => i.category === "accesorio");

    const formatList = (list: typeof items) =>
      list
        .map(
          (it) =>
            `• ${it.icon} *${it.name}* — *$${it.price.toLocaleString("es-AR")}* fichas\n` +
            `  _${it.description}_\n` +
            `  👉 Comprar: \`!comprarpesca ${it.id}\``
        )
        .join("\n\n");

    const text =
      `🏪 *EL RINCONCITO DEL PESCADOR (Tienda de Pesca)*\n\n` +
      `🪱 *CARNADAS & CEBOS:*\n${formatList(carnadas)}\n\n` +
      `🎣 *CAÑAS & EQUIPAMIENTO PESADO:*\n${formatList(cañas)}\n\n` +
      `🧰 *ACCESORIOS & PERMISOS:*\n${formatList(accesorios)}\n\n` +
      `_Para comprar escribí \`!comprarpesca <id>\` (ej: \`!comprarpesca pote_lombrices\`)._`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const comprarPescaCommand: Command = {
  name: "comprarpesca",
  aliases: ["comprarcana", "comprarcarnada"],
  description: "Comprá artículos de pesca: !comprarpesca <id_articulo>.",
  execute: async ({ sock, remoteJid, msg, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const itemId = (args[0] || "").toLowerCase().trim();

    if (!itemId) {
      await sock.sendMessage(
        remoteJid,
        { text: "Uso: `!comprarpesca <id_articulo>`. Mirá las opciones disponibles con `!tiendapesca`." },
        { quoted: msg as any }
      );
      return;
    }

    const res = await buyFishingShopItem(senderJid, itemId);

    if (!res.success) {
      await sock.sendMessage(remoteJid, { text: res.error || "No se pudo realizar la compra." }, { quoted: msg as any });
      return;
    }

    const text =
      `✅ *¡COMPRA EXITOSA EN LA TIENDA DE PESCA!*\n\n` +
      `Adquiriste: ${res.item?.icon} *${res.item?.name}*\n` +
      `• *Costo:* -$${res.item?.price.toLocaleString("es-AR")} fichas\n` +
      `• *Efecto aplicado:* _${res.item?.description}_\n` +
      `• *Tu nuevo saldo:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas\n\n` +
      `¡Salí al río a probarlo con \`!pescar\`!`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
