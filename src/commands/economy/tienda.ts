import { Command, CommandContext } from "../types.js";
import { SHOP_ITEMS, ShopItem } from "../../config/shop.config.js";
import { buyItem } from "../../services/shop.service.js";
import { getUserProfession } from "../../services/economy.service.js";
import { PROFESSIONS, ProfessionType } from "../../config/economy.config.js";
import { prisma } from "../../services/db/prisma.js";
import { resolveOrRegisterUser } from "../../services/db/user.service.js";

export const tiendaCommand: Command = {
  name: "tienda",
  aliases: ["shop", "kiosco", "almacen", "rotiseria", "ferreteria", "mercado"],
  description: "Mercado Central de Empy: morfi, herramientas T1-T7, 5 reliquias por oficio, sedes y vehículos (!tienda).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    // Resolver siempre al usuario canónico para evitar discrepancias de LID vs Teléfono
    const rawSender = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const user = await resolveOrRegisterUser(rawSender);
    const senderJid = user.jid;

    // Si el usuario usó "!tienda comprar <item>"
    if (args[0]?.toLowerCase() === "comprar" && args[1]) {
      const itemQuery = args[1];
      const qty = parseInt(args[2], 10) || 1;
      await handlePurchase(sock, remoteJid, msg, senderJid, itemQuery, qty);
      return;
    }

    const firstArg = args[0]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    function formatBuffShort(buff?: any): string {
      if (!buff) return "";
      const parts: string[] = [];
      if (buff.earningsBonusPercent) parts.push(`+${buff.earningsBonusPercent}% cobro`);
      if (buff.cooldownReductionSec) parts.push(`-${buff.cooldownReductionSec}s espera`);
      if (buff.hungerReductionPercent) parts.push(`-${buff.hungerReductionPercent}% hambre`);
      if (buff.blooperResistancePercent) parts.push(`🛡️ ${buff.blooperResistancePercent}% anti-blooper`);
      if (buff.weatherResistancePercent) parts.push(`🌦️ ${buff.weatherResistancePercent}% anti-clima`);
      return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
    }

    // Detectar inventario del usuario con JID canónico para marcar [ADQUIRIDO]
    const userInv = await prisma.userInventoryItem.findMany({
      where: { userJid: user.jid, quantity: { gt: 0 } },
    });
    const ownedItemIds = new Set<string>(userInv.map((inv: any) => inv.itemId));

    // Revisar oficio del usuario
    const userProf = await getUserProfession(user.id);

    // Si el usuario pidió "!tienda herramientas", redirigir a su oficio si lo tiene
    let targetProfKey = firstArg;
    if ((firstArg === "herramienta" || firstArg === "herramientas") && userProf) {
      targetProfKey = userProf;
    }

    // ----------------------------------------------------
    // AISLE 2 & SUBMENU: HERRAMIENTAS Y RELIQUIAS DE OFICIO (!tienda <oficio>)
    // ----------------------------------------------------
    const matchedProf = Object.values(PROFESSIONS).find(
      (p) => p.id === targetProfKey || p.aliases.some((a) => a.toLowerCase() === targetProfKey)
    );

    if (matchedProf) {
      const tools = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "herramienta" && i.profession === matchedProf.id)
        .sort((a, b) => a.price - b.price);

      const relics = Object.values(SHOP_ITEMS)
        .filter((i) => i.uniqueProfessionItem && i.profession === matchedProf.id)
        .sort((a, b) => a.price - b.price);

      const hq = Object.values(SHOP_ITEMS).find(
        (i) => i.category === "negocio" && i.profession === matchedProf.id
      );

      const toolList = tools
        .map((t, idx) => {
          const isOwned = ownedItemIds.has(t.id);
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${t.price.toLocaleString("es-AR")}* (\`!comprar ${t.id}\`)`;
          return `${idx + 1}. ${t.icon} *${t.name}* — ${buySnippet}${formatBuffShort(t.buff)}`;
        })
        .join("\n");

      const relicList = relics.length > 0
        ? `\n\n✨ *5 Reliquias Únicas Legendarias:*\n` +
          relics
            .map((r) => {
              const isOwned = ownedItemIds.has(r.id);
              const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${r.price.toLocaleString("es-AR")}* (\`!comprar ${r.id}\`)`;
              return `• ${r.icon} *${r.name}* — ${buySnippet}${formatBuffShort(r.buff)}\n  _${r.description}_`;
            })
            .join("\n")
        : "";

      const hqText = hq
        ? `\n\n🏢 *Sede Central Inmobiliaria:*\n• ${hq.icon} *${hq.name}* — ${ownedItemIds.has(hq.id) ? "✅ *[ADQUIRIDO]*" : `*$${hq.price.toLocaleString("es-AR")}* (\`!comprar ${hq.id}\`)`}\n  _Renta: +$${(hq.passiveMessageBonus || 2200).toLocaleString("es-AR")} c/50 msgs (+15% cobro)_`
        : "";

      const text =
        `🛒 *CATÁLOGO PROFESIONAL: ${matchedProf.icon} ${matchedProf.name.toUpperCase()}*\n\n` +
        `🛠️ *Herramientas de Carrera (T1 a T7):*\n${toolList}` +
        relicList +
        hqText +
        `\n\n💡 _Comprá cualquier ítem con \`!comprar <id>\` (ej: \`!comprar ${tools[0]?.id || "llave10"}\`)._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // ----------------------------------------------------
    // AISLE 3: SOLO RELIQUIAS (!tienda reliquias [oficio])
    // ----------------------------------------------------
    if (firstArg === "reliquia" || firstArg === "reliquias") {
      const targetProf = (args[1] ? Object.values(PROFESSIONS).find((p) => p.id === args[1].toLowerCase() || p.aliases.includes(args[1].toLowerCase()))?.id : null) || userProf;

      if (!targetProf || !PROFESSIONS[targetProf as ProfessionType]) {
        const profList = Object.values(PROFESSIONS).map((p) => `• \`!tienda reliquias ${p.id}\` — ${p.icon} *${p.name}*`).join("\n");
        const text =
          `✨ *SANTUARIO DE RELIQUIAS ÚNICAS*\n\n` +
          `Cada oficio posee 5 reliquias únicas legendarias con buffs permanentes.\n` +
          `Para ver las reliquias de un oficio, consultá:\n\n` +
          `${profList}\n\n` +
          `💡 _Si ya tenés oficio elegido con \`!profesion\`, usá simplemente \`!tienda reliquias\`._`;
        await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
        return;
      }

      const pMeta = PROFESSIONS[targetProf as ProfessionType];
      const relics = Object.values(SHOP_ITEMS)
        .filter((i) => i.uniqueProfessionItem && i.profession === pMeta.id)
        .sort((a, b) => a.price - b.price);

      const relicList = relics
        .map((r) => {
          const isOwned = ownedItemIds.has(r.id);
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${r.price.toLocaleString("es-AR")}* (\`!comprar ${r.id}\`)`;
          return `• ${r.icon} *${r.name}* — ${buySnippet}${formatBuffShort(r.buff)}\n  _${r.description}_`;
        })
        .join("\n\n");

      const text =
        `✨ *5 RELIQUIAS LEGENDARIAS: ${pMeta.icon} ${pMeta.name.toUpperCase()}*\n\n` +
        `${relicList}\n\n` +
        `💡 _Solo podés poseer 1 copia única de cada reliquia. Comprá con \`!comprar <id>\`._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // ----------------------------------------------------
    // AISLE 1: MORFI, BEBIDAS & KIOSCO (!tienda comida / !tienda morfi)
    // ----------------------------------------------------
    if (firstArg === "morfi" || firstArg === "comida" || firstArg === "comidas" || firstArg === "bebida" || firstArg === "bebidas" || firstArg === "kiosco" || firstArg === "rotiseria") {
      const comidas = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "comida")
        .sort((a, b) => a.price - b.price);

      const bebidas = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "bebida")
        .sort((a, b) => a.price - b.price);

      const kiosco = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "kiosco" || (i.category === "especial" && !i.uniqueProfessionItem))
        .sort((a, b) => a.price - b.price);

      const formatItems = (items: ShopItem[], verb: string) =>
        items
          .map((i) => `• ${i.icon} *${i.name}* — *$${i.price.toLocaleString("es-AR")}* (+${i.hungerRestore || 0}% energ) (\`!${verb} ${i.id}\`)`)
          .join("\n");

      const text =
        `🍽️ *ROTISERÍA, BEBIDAS & KIOSCO CENTRAL*\n` +
        `_Ordenado por precio ascendente:_\n\n` +
        `🥘 *COMIDAS CALIENTES:*\n${formatItems(comidas, "comer")}\n\n` +
        `🥤 *BEBIDAS HELADAS:*\n${formatItems(bebidas, "tomar")}\n\n` +
        `⚡ *KIOSCO, ENERGIZANTES & VICIOS:*\n${formatItems(kiosco, "comer")}\n\n` +
        `💡 _Comé con \`!comer <item>\` y tomá con \`!tomar <item>\`._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // ----------------------------------------------------
    // AISLE 4: NEGOCIOS & SEDES INMOBILIARIAS (!tienda negocios / !tienda sedes)
    // ----------------------------------------------------
    if (firstArg === "sedes" || firstArg === "sede") {
      const sedes = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "negocio" && i.profession)
        .sort((a, b) => a.price - b.price);

      const list = sedes
        .map((s) => {
          const isOwned = ownedItemIds.has(s.id);
          const profName = s.profession ? (PROFESSIONS as any)[s.profession]?.name || s.profession : "";
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${s.price.toLocaleString("es-AR")}* (\`!comprar ${s.id}\`)`;
          return `• ${s.icon} *${s.name}* [${profName}]\n  _Renta: +$${(s.passiveMessageBonus || 2200).toLocaleString("es-AR")} c/50 msgs_ — ${buySnippet}`;
        })
        .join("\n\n");

      const text =
        `🏛️ *DIRECTORIO DE LAS 10 SEDES DE OFICIO*\n\n` +
        `_Cada sede es exclusiva de su rubro y suma renta automática cada 50 mensajes:_\n\n` +
        `${list}\n\n` +
        `💡 _Comprá tu sede con \`!comprar <id>\` (ej: \`!comprar software_factory\`)._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    if (firstArg === "negocio" || firstArg === "negocios" || firstArg === "inversion" || firstArg === "inversiones") {
      const generalNegocios = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "negocio" && !i.profession)
        .sort((a, b) => a.price - b.price);

      const generalList = generalNegocios
        .map((n) => {
          const isOwned = ownedItemIds.has(n.id);
          const bonus = n.passiveMessageBonus || n.passiveDailyBonus || 500;
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${n.price.toLocaleString("es-AR")}* (\`!comprar ${n.id}\`)`;
          return `• ${n.icon} *${n.name}* — ${buySnippet}\n  _Renta pasiva: +$${bonus.toLocaleString("es-AR")} cada 50 mensajes_`;
        })
        .join("\n\n");

      let profHqSection = "";
      if (userProf && PROFESSIONS[userProf]) {
        const prof = PROFESSIONS[userProf];
        const hq = Object.values(SHOP_ITEMS).find((i) => i.category === "negocio" && i.profession === prof.id);
        if (hq) {
          const isOwned = ownedItemIds.has(hq.id);
          const bonus = hq.passiveMessageBonus || hq.passiveDailyBonus || 2200;
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${hq.price.toLocaleString("es-AR")}* (\`!comprar ${hq.id}\`)`;
          profHqSection =
            `\n\n🏢 *SEDE DE TU OFICIO (${prof.icon} ${prof.name.toUpperCase()}):*\n` +
            `• ${hq.icon} *${hq.name}* — ${buySnippet}\n` +
            `  _Renta pasiva: +$${bonus.toLocaleString("es-AR")} cada 50 msgs (+15% cobro en changas)_`;
        }
      }

      const text =
        `🏢 *NEGOCIOS & RENTA PASIVA*\n` +
        `_Acreditan fichas automáticas en la repartija cada 50 mensajes en el chat:_\n\n` +
        `${generalList}` +
        profHqSection +
        `\n\n💡 _Para ver las sedes de todos los oficios usá \`!tienda sedes\`._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // ----------------------------------------------------
    // AISLE 5: CONCESIONARIA & COLECCIONABLES (!tienda autos / !tienda lujo)
    // ----------------------------------------------------
    if (firstArg === "coleccionable" || firstArg === "coleccionables" || firstArg === "lujo" || firstArg === "autos" || firstArg === "auto" || firstArg === "vehiculo" || firstArg === "vehiculos" || firstArg === "concesionaria") {
      const coleccionables = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "coleccionable")
        .sort((a, b) => a.price - b.price);

      const list = coleccionables
        .map((c) => {
          const isOwned = ownedItemIds.has(c.id);
          const buySnippet = isOwned ? "✅ *[ADQUIRIDO]*" : `*$${c.price.toLocaleString("es-AR")}* (\`!comprar ${c.id}\`)`;
          return `• ${c.icon} *${c.name}* — ${buySnippet}${formatBuffShort(c.buff)}\n  _${c.description}_`;
        })
        .join("\n\n");

      const text =
        `🏎️ *CONCESIONARIA & COLECCIONABLES DE PRESTIGIO*\n` +
        `_Ordenados por gama y precio ascendente:_\n\n` +
        `${list}\n\n` +
        `💡 _Comprá tu vehículo con \`!comprar <id>\` (ej: \`!comprar lamborghini\`, \`!comprar peugeot504\`, \`!comprar zanella50\`)._`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // ----------------------------------------------------
    // MENÚ PRINCIPAL ESTRUCTURADO Y JERÁRQUICO (!tienda)
    // ----------------------------------------------------
    let toolsQuickSummary = "";
    if (userProf && PROFESSIONS[userProf]) {
      const prof = PROFESSIONS[userProf];
      const tools = Object.values(SHOP_ITEMS)
        .filter((i) => i.category === "herramienta" && i.profession === prof.id)
        .sort((a, b) => (a.tier || 0) - (b.tier || 0));
      const ownedToolsCount = tools.filter((t) => ownedItemIds.has(t.id)).length;

      const relics = Object.values(SHOP_ITEMS)
        .filter((i) => i.uniqueProfessionItem && i.profession === prof.id);
      const ownedRelicsCount = relics.filter((r) => ownedItemIds.has(r.id)).length;

      toolsQuickSummary =
        `\n👷 *TU CARRERA PROFESIONAL (${prof.icon} ${prof.name.toUpperCase()}):*\n` +
        `• 🧰 Herramientas: *${ownedToolsCount}/${tools.length}* adquiridas (\`!tienda herramientas\`)\n` +
        `• ✨ Reliquias únicas: *${ownedRelicsCount}/5* obtenidas (\`!tienda reliquias\`)\n`;
    } else {
      toolsQuickSummary =
        `\n👷 *CARRERA PROFESIONAL:*\n` +
        `_Aún no tenés oficio. Elegí uno permanente con \`!profesion <oficio>\` para desbloquear tus 5 reliquias y herramientas._\n`;
    }

    const text =
      `🏪 *MERCADO CENTRAL DE EMPYREAL*\n` +
      `_Explorá los pasillos especializados del mercado:_\n\n` +
      `1️⃣ 🍔 *Rotisería, Bebidas & Kiosco:* \`!tienda comida\`\n` +
      `   _Morfi (+energía), coquita, fernet, pucho y alfajor._\n\n` +
      `2️⃣ 🧰 *Herramientas de Carrera (T1 a T7):* \`!tienda herramientas\`\n` +
      `   _Equipamiento progresivo para maximizar cobros en \`!laburar\`._\n\n` +
      `3️⃣ ✨ *5 Reliquias Únicas Legendarias:* \`!tienda reliquias\`\n` +
      `   _Objetos de culto exclusivos para tu rubro con buffs permanentes._\n\n` +
      `4️⃣ 🏢 *Negocios & Renta Pasiva:* \`!tienda negocios\` | \`!tienda sedes\`\n` +
      `   _Kiosco 24hs, remis, departamentos y sedes de oficio cada 50 msgs._\n\n` +
      `5️⃣ 🏎️ *Concesionaria & Lujos:* \`!tienda autos\`\n` +
      `   _Zanella 50cc, Peugeot 504, Hilux 4x4 y Lamborghini Diablo V12._\n` +
      toolsQuickSummary +
      `\n🛒 *Comprar:* \`!comprar <item>\` | 🍽️ *Consumir:* \`!comer <item>\` o \`!tomar <item>\``;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};

export const comprarCommand: Command = {
  name: "comprar",
  aliases: ["buy"],
  description: "Comprá un ítem del almacén o rotisería (!comprar <item> [cantidad]).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    if (!args[0]) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🛒 *¿Qué querés comprar?*\n\n` +
            `Uso: \`!comprar <item> [cantidad]\`\n\n` +
            `_Ejemplos:_\n` +
            `• \`!comprar chipa\`\n` +
            `• \`!comprar guiso 2\`\n` +
            `• \`!comprar coquita\`\n` +
            `• \`!comprar alfajor\`\n` +
            `• \`!comprar llave10\`\n\n` +
            `Tirá \`!tienda\` para consultar el catálogo de precios.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const itemQuery = args[0];
    const qty = parseInt(args[1], 10) || 1;
    await handlePurchase(sock, remoteJid, msg, senderJid, itemQuery, qty);
  },
};

async function handlePurchase(
  sock: any,
  remoteJid: string,
  msg: any,
  senderJid: string,
  itemQuery: string,
  quantity: number
) {
  const res = await buyItem(senderJid, itemQuery, quantity);

  if (!res.success) {
    await sock.sendMessage(
      remoteJid,
      { text: `❌ ${res.error}` },
      { quoted: msg as any }
    );
    return;
  }

  const { item, quantity: qty, totalCost, newBalance, isDirectShield } = res;
  const costFormatted = (totalCost ?? 0).toLocaleString("es-AR");
  const balanceFormatted = (newBalance ?? 0).toLocaleString("es-AR");

  if (isDirectShield) {
    const message =
      `🛡️ *¡ESCUDO DE SEGURIDAD ACTIVADO!*\n\n` +
      `Compraste *${qty}x ${item?.name}* por *$${costFormatted}* fichas.\n` +
      `• *Tu saldo actual:* *$${balanceFormatted}* fichas.`;
    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    return;
  }

  if (item?.category === "herramienta") {
    const message =
      `🧰 *¡EQUIPAMIENTO DE OFICIO ADQUIRIDO!*\n\n` +
      `Adquiriste: *${item.icon} ${item.name}*\n` +
      `• *Beneficio:* ${item.description}\n` +
      `• *Total pagado:* *$${costFormatted}* fichas\n` +
      `• *Tu saldo actual:* *$${balanceFormatted}* fichas\n\n` +
      `⚡ *Efecto permanente:* Se aplicará automáticamente cada vez que tires \`!laburar\`.`;
    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    return;
  }

  if (item?.category === "negocio") {
    const bonus = item.passiveMessageBonus || item.passiveDailyBonus || 500;
    const message =
      `🏢 *¡ESCRITURACIÓN INMOBILIARIA EXITOSA!* 🏢\n\n` +
      `Sos el nuevo titular y propietario de: *${item.icon} ${item.name}*\n` +
      `• *Total invertido:* *$${costFormatted}* fichas\n` +
      `• *Tu saldo actual:* *$${balanceFormatted}* fichas\n\n` +
      `📈 *Renta Pasiva Automática:* Te acreditará *+$${bonus.toLocaleString("es-AR")} fichas* cada 50 mensajes en el grupo.\n` +
      `💡 _Revisá todas tus propiedades en \`!inventario\` o \`!billetera\`._`;
    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    return;
  }

  if (item?.category === "coleccionable") {
    const isVehicle = item.id.includes("moto") || item.id.includes("peugeot") || item.id.includes("fiat") || item.id.includes("honda") || item.id.includes("zanella") || item.id.includes("hilux");
    const titleHeader = isVehicle ? "🚗 *¡VEHÍCULO ADQUIRIDO!*" : "🏆 *¡OBJETO EXCLUSIVO ADQUIRIDO!*";
    const message =
      `${titleHeader}\n\n` +
      `Adquiriste: *${item.icon} ${item.name}*\n` +
      `• *Beneficio:* ${item.description}\n` +
      `• *Total pagado:* *$${costFormatted}* fichas\n` +
      `• *Tu saldo actual:* *$${balanceFormatted}* fichas\n\n` +
      `✨ *Efecto permanente:* Queda guardado en tu \`!inventario\` otorgando prestigio y sus ventajas pasivas continuas en \`!laburar\`.`;
    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    return;
  }

  if (item?.uniqueProfessionItem || item?.category === "especial") {
    const message =
      `🏆 *¡RELIQUIA DE OFICIO ADQUIRIDA!*\n\n` +
      `Adquiriste: *${item.icon} ${item.name}*\n` +
      `• *Beneficio:* ${item.description}\n` +
      `• *Total pagado:* *$${costFormatted}* fichas\n` +
      `• *Tu saldo actual:* *$${balanceFormatted}* fichas\n\n` +
      `✨ *Efecto permanente:* Queda guardada en tu \`!inventario\` aplicando sus buffs en cada \`!laburar\`.`;
    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
    return;
  }

  let consumeInstruction = `Revisá tu \`!inventario\`.`;
  if (item?.category === "bebida") {
    consumeInstruction = `Tomalo con \`!tomar ${item.id}\` para recuperar energía.`;
  } else if (item?.category === "comida") {
    consumeInstruction = `Comelo con \`!comer ${item.id}\` para recuperar energía.`;
  } else if (item?.category === "kiosco") {
    consumeInstruction = `Consumilo con \`!comer ${item.id}\` para aprovechar sus efectos.`;
  }

  const message =
    `🛍️ *¡COMPRA REALIZADA CON ÉXITO!*\n\n` +
    `Adquiriste: *${qty}x ${item?.icon} ${item?.name}*\n` +
    `• *Total pagado:* *$${costFormatted}* fichas\n` +
    `• *Tu saldo actual:* *$${balanceFormatted}* fichas\n\n` +
    `📦 Guardado en tu mochila. ${consumeInstruction}`;

  await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
}
