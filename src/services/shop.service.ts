import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser } from "./db/user.service.js";
import { SHOP_ITEMS, ShopItem } from "../config/shop.config.js";
import { buyShield, getUserProfession } from "./economy.service.js";
import { PROFESSIONS } from "../config/economy.config.js";
import { getUserEducationDiscounts } from "./education.service.js";
import { isUserEconomyFrozen } from "./admin-economy.service.js";

/**
 * Busca un ítem en el catálogo por ID o alias insensible a mayúsculas/acentos.
 */
export function findShopItem(query: string): ShopItem | undefined {
  if (!query) return undefined;
  const clean = query
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Búsqueda directa por ID
  if (SHOP_ITEMS[clean]) return SHOP_ITEMS[clean];

  // Búsqueda por alias
  for (const item of Object.values(SHOP_ITEMS)) {
    if (item.id === clean) return item;
    for (const alias of item.aliases) {
      const cleanAlias = alias
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (cleanAlias === clean) return item;
    }
  }

  return undefined;
}

/**
 * Realiza la compra de uno o más ítems de la tienda.
 */
export async function buyItem(
  userJid: string,
  itemQuery: string,
  quantity: number = 1
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  quantity?: number;
  totalCost?: number;
  newBalance?: number;
  isDirectShield?: boolean;
}> {
  const freezeCheck = isUserEconomyFrozen(userJid);
  if (freezeCheck.frozen) {
    const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
    return {
      success: false,
      error: `🧊 *¡ECONOMÍA CONGELADA!* Tenés tu cuenta suspendida por la patronal (*${mins}m* restantes). No podés comprar en la tienda.`,
    };
  }

  const item = findShopItem(itemQuery);
  if (!item) {
    return {
      success: false,
      error: `El producto "${itemQuery}" no existe en la tienda. Tirá \`!tienda\` para ver el menú.`,
    };
  }

  const qty = Math.max(1, Math.min(quantity, 50));

  // Los escudos fueron abolidos por ley marcial
  if (item.id === "escudo") {
    return {
      success: false,
      error: "🛡️ *Los escudos han sido abolidos* en la ciudad por ley marcial. ¡Ahora nadie se salva de los asaltos!",
    };
  }

  const discounts = await getUserEducationDiscounts(userJid);
  let effectivePrice = item.price;
  if (
    (item.category === "comida" || item.category === "bebida" || item.category === "kiosco") &&
    discounts.foodDiscountPercent > 0
  ) {
    effectivePrice = Math.round(item.price * (1 - discounts.foodDiscountPercent / 100));
  } else if (item.category === "herramienta" && discounts.toolsDiscountPercent > 0) {
    effectivePrice = Math.round(item.price * (1 - discounts.toolsDiscountPercent / 100));
  }

  const totalCost = effectivePrice * qty;
  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    // Restricción de oficio: herramientas, reliquias y sedes sólo las puede comprar quien tenga ese oficio activo
    if (item.profession) {
      const userProfession = await getUserProfession(user.id);
      if (userProfession !== item.profession) {
        const profMeta = (PROFESSIONS as any)[item.profession];
        const profName = profMeta?.name || item.profession;
        return {
          success: false,
          error: `*${item.name}* es exclusivo del oficio *${profName}*. Cambiate de oficio con \`!profesion ${item.profession}\` para adquirirlo.`,
        };
      }
    }

    const userJids = [user.jid, user.lid, user.phone ? `${user.phone}@s.whatsapp.net` : null].filter(Boolean) as string[];
    const hasExistingItem = async (itemId: string): Promise<boolean> => {
      const found = await (prisma as any).userInventoryItem.findFirst({
        where: { userJid: { in: userJids }, itemId, quantity: { gt: 0 } },
      });
      return Boolean(found);
    };

    // Unicidad de reliquias especiales
    if (item.uniqueProfessionItem) {
      if (await hasExistingItem(item.id)) {
        return {
          success: false,
          error: `Ya tenés en tu poder la reliquia única *${item.name}*. No se pueden poseer copias duplicadas.`,
        };
      }
    }

    // Límites de compra de 1 unidad para activos no consumibles
    if ((item.uniqueProfessionItem || item.category === "negocio" || item.category === "herramienta" || item.category === "coleccionable") && qty > 1) {
      return {
        success: false,
        error: `Solo podés adquirir 1 unidad de *${item.name}* a la vez.`,
      };
    }

    if (item.category === "herramienta") {
      if (await hasExistingItem(item.id)) {
        return {
          success: false,
          error: `Ya tenés en tu poder la herramienta *${item.name}*. Sus beneficios ya están activos de forma permanente.`,
        };
      }
    }

    if (item.category === "negocio") {
      if (await hasExistingItem(item.id)) {
        return {
          success: false,
          error: `Ya sos dueño de *${item.name}*. Las ganancias diarias de este negocio ya se suman automáticamente a tu \`!diario\`.`,
        };
      }
    }

    if (item.category === "coleccionable") {
      if (await hasExistingItem(item.id)) {
        return {
          success: false,
          error: `Ya tenés en tu poder este coleccionable: *${item.name}*. Ya luce en tu inventario y billetera.`,
        };
      }
    }

    if (current.balance < totalCost) {
      return {
        success: false,
        error: `Saldo insuficiente. Comprar *${qty}x ${item.name}* cuesta *$${totalCost}* fichas (tu saldo: *$${current.balance}*).`,
      };
    }

    // 1. Descontar saldo
    const updated = await prisma.userProfile.update({
      where: { id: current.id },
      data: {
        balance: { decrement: totalCost },
      },
    });

    // 2. Agregar al inventario relacional
    const existing = await (prisma as any).userInventoryItem.findUnique({
      where: {
        userJid_itemId: {
          userJid: user.jid,
          itemId: item.id,
        },
      },
    });

    if (existing) {
      await (prisma as any).userInventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: qty } },
      });
    } else {
      await (prisma as any).userInventoryItem.create({
        data: {
          userJid: user.jid,
          itemId: item.id,
          quantity: qty,
        },
      });
    }

    return {
      success: true,
      item,
      quantity: qty,
      totalCost,
      newBalance: updated.balance,
    };
  });
}

/**
 * Consume o utiliza un ítem del inventario del usuario.
 */
export async function useItem(
  userJid: string,
  itemQuery: string
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  remainingQty?: number;
  effectMessage?: string;
  hungerBar?: string;
  newHunger?: number;
  jobBuffTurns?: number;
}> {
  const item = findShopItem(itemQuery);
  if (!item) {
    return {
      success: false,
      error: `Ese ítem no existe. Revisá tu \`!inventario\` o el menú de la \`!tienda\`.`,
    };
  }

  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const invItem = await (prisma as any).userInventoryItem.findUnique({
      where: {
        userJid_itemId: {
          userJid: user.jid,
          itemId: item.id,
        },
      },
    });

    if (!invItem || invItem.quantity <= 0) {
      return {
        success: false,
        error: `No tenés ningún *${item.name}* en tu mochila. ¡Compralo en la \`!tienda\` con \`!comprar ${item.id}\`!`,
      };
    }

    if (!isConsumableItem(item)) {
      return {
        success: false,
        error: `*${item.name}* es un objeto permanente y no se puede consumir. Sus ventajas se aplican automáticamente en tu oficio o cada 50 mensajes en el grupo.`,
      };
    }

    const remainingQty = invItem.quantity - 1;
    if (remainingQty > 0) {
      await (prisma as any).userInventoryItem.update({
        where: { id: invItem.id },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await (prisma as any).userInventoryItem.delete({
        where: { id: invItem.id },
      });
    }

    let effectMessage = "";
    let hungerBar = "";
    let newHunger = 0;
    let jobBuffTurns = 0;

    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;



    // Restauración de hambre y buffs de trabajo si es alimento/bebida
    if (item.hungerRestore) {
      const oldHunger = typeof (current as any).hunger === "number" ? (current as any).hunger : 85;
      newHunger = Math.min(100, Math.max(0, oldHunger + item.hungerRestore));
      const curTurns = typeof (current as any).jobBuffTurns === "number" ? (current as any).jobBuffTurns : 0;
      jobBuffTurns = Math.min(9, curTurns + 3);

      await (prisma.userProfile as any).update({
        where: { id: user.id },
        data: {
          hunger: newHunger,
          hungerWarningSent: newHunger <= 15,
          jobBuffTurns: jobBuffTurns,
          foodEaten: { increment: 1 },
        },
      });

      const totalBlocks = 10;
      const filledBlocks = Math.round((newHunger / 100) * totalBlocks);
      const emptyBlocks = totalBlocks - filledBlocks;
      const fillChar = newHunger <= 15 ? "🟥" : newHunger <= 40 ? "🟨" : "🟩";
      hungerBar = `[${fillChar.repeat(filledBlocks)}${"⬜".repeat(emptyBlocks)}] ${newHunger}%`;
    }

    return {
      success: true,
      item,
      remainingQty,
      effectMessage,
      hungerBar,
      newHunger,
      jobBuffTurns,
    };
  });
}

/**
 * Obtiene el listado de ítems en el inventario del usuario.
 */
export async function getUserInventory(
  userJid: string
): Promise<Array<{ item: ShopItem; quantity: number }>> {
  const user = await resolveOrRegisterUser(userJid);
  const possibleJids = [user.jid];
  if (user.lid) possibleJids.push(user.lid);
  if (user.phone) possibleJids.push(user.phone);

  const rawItems = await (prisma as any).userInventoryItem.findMany({
    where: {
      userJid: { in: possibleJids },
      quantity: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  const result: Array<{ item: ShopItem; quantity: number }> = [];

  for (const raw of rawItems) {
    const item = SHOP_ITEMS[raw.itemId];
    if (item) {
      result.push({
        item,
        quantity: raw.quantity,
      });
    }
  }

  return result;
}

/**
 * Determina si un ítem de la tienda es realmente un producto consumible (alimento, bebida, golosina o con efecto).
 * Descarta herramientas, negocios y vehículos/coleccionables para evitar que se consuman por error.
 */
export function isConsumableItem(item: ShopItem): boolean {
  if (
    item.category === "herramienta" ||
    item.category === "negocio" ||
    item.category === "coleccionable" ||
    item.category === "especial" ||
    Boolean(item.uniqueProfessionItem)
  ) {
    return false;
  }
  return (
    item.category === "comida" ||
    item.category === "bebida" ||
    item.category === "kiosco" ||
    Boolean(item.hungerRestore) ||
    Boolean(item.effect)
  );
}

/**
 * Determina qué ítem consumir o regalar:
 * 1. Si el usuario especifica un ítem exacto (ej. "chipa", "keke", "coquita"):
 *    - Revisa si lo tiene en su inventario.
 *    - Si no lo tiene, lo selecciona para compra automática.
 * 2. Si el usuario pasa un comodín ("comida", "bebida") o nada:
 *    - Busca si tiene algún ítem de esa categoría en su inventario con cantidad > 0.
 *    - Si tiene, consume el primero disponible (priorizando mayor restauración).
 *    - Si no tiene ninguno en la mochila, selecciona el producto por defecto para auto-comprarlo (chipa para comida, coquita para bebida).
 */
export async function resolveConsumableItemForUser(
  userJid: string,
  query?: string,
  preferredCategory: "comida" | "bebida" | "any" = "comida"
): Promise<{
  item?: ShopItem;
  fromInventory: boolean;
  inventoryItemId?: string;
  error?: string;
}> {
  const cleanQuery = (query || "").trim().toLowerCase();

  const isFoodWildcard = ["comida", "morfi", "alimento", "plato"].includes(cleanQuery);
  const isDrinkWildcard = ["bebida", "trago", "tomar", "beber"].includes(cleanQuery);

  const targetCategory: "comida" | "bebida" | "any" =
    isFoodWildcard ? "comida" :
    isDrinkWildcard ? "bebida" :
    !cleanQuery ? preferredCategory :
    "any";

  const userInventory = await getUserInventory(userJid);

    // Caso 1: Se pasó un ítem específico o alias
  if (cleanQuery && !isFoodWildcard && !isDrinkWildcard) {
    const specificItem = findShopItem(cleanQuery);
    if (!specificItem) {
      return {
        fromInventory: false,
        error: `El ítem "${query}" no existe en el menú. Tirá \`!tienda\` para consultar el catálogo.`,
      };
    }

    if (!isConsumableItem(specificItem)) {
      const typeLabel =
        specificItem.category === "herramienta"
          ? "una herramienta de oficio permanente"
          : specificItem.category === "negocio"
          ? "una propiedad o negocio permanente"
          : specificItem.category === "coleccionable"
          ? "un vehículo u objeto coleccionable permanente"
          : "un objeto permanente";
      return {
        fromInventory: false,
        error: `*${specificItem.name}* es ${typeLabel}, ¡no se puede comer ni consumir! Sus ventajas se aplican de forma pasiva en \`!laburar\` o \`!diario\`.`,
      };
    }

    // Verificar si lo tiene en el inventario
    const invMatch = userInventory.find((i) => i.item.id === specificItem.id && i.quantity > 0);
    if (invMatch) {
      return {
        item: specificItem,
        fromInventory: true,
        inventoryItemId: specificItem.id,
      };
    }

    // No lo tiene en inventario: se seleccionará para auto-compra
    return {
      item: specificItem,
      fromInventory: false,
    };
  }

  // Caso 2: Comodín de categoría ("comida", "bebida") o llamado sin argumentos
  // 1ro: Intentar encontrar algún ítem disponible en su inventario
  const matchingInv = userInventory.filter((i) => {
    if (i.quantity <= 0) return false;
    if (targetCategory === "comida") return i.item.category === "comida" || (Boolean(i.item.hungerRestore) && i.item.category !== "bebida");
    if (targetCategory === "bebida") return i.item.category === "bebida";
    return Boolean(i.item.hungerRestore);
  });

  if (matchingInv.length > 0) {
    // Priorizar el que mayor energía restaura
    matchingInv.sort((a, b) => (b.item.hungerRestore || 0) - (a.item.hungerRestore || 0));
    const chosen = matchingInv[0];
    return {
      item: chosen.item,
      fromInventory: true,
      inventoryItemId: chosen.item.id,
    };
  }

  // 2do: No tiene ninguno en inventario, auto-comprar el producto estrella de la categoría
  let defaultItemKey = "chipa";
  if (targetCategory === "bebida") {
    defaultItemKey = "coquita";
  }

  const defaultItem = SHOP_ITEMS[defaultItemKey] || Object.values(SHOP_ITEMS)[0];
  return {
    item: defaultItem,
    fromInventory: false,
  };
}

/**
 * Consume un alimento o bebida: usa del inventario y si no tiene, lo compra automáticamente.
 */
export async function consumeOrAutoBuy(
  userJid: string,
  rawQuery?: string,
  preferredCategory: "comida" | "bebida" | "any" = "comida"
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  fromInventory?: boolean;
  autoBoughtCost?: number;
  remainingQty?: number;
  effectMessage?: string;
  hungerBar?: string;
  newHunger?: number;
  jobBuffTurns?: number;
  newBalance?: number;
}> {
  const resolved = await resolveConsumableItemForUser(userJid, rawQuery, preferredCategory);
  if (resolved.error || !resolved.item) {
    return {
      success: false,
      error: resolved.error || "No se pudo determinar el producto a consumir.",
    };
  }

  const item = resolved.item;
  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const curUser = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const curHunger = typeof (curUser as any).hunger === "number" ? (curUser as any).hunger : 85;

    // Si ya está al 100% de energía y el ítem no otorga un efecto especial (ej: reset de cooldown), rechazar
    if (curHunger >= 100 && !item.effect && (item.hungerRestore || 0) > 0) {
      return {
        success: false,
        error: `¡Ya estás al *100%* de energía! 🔋 No tenés hambre ni necesidad de consumir *${item.name}* ahora. Guardalo para cuando labures.`,
      };
    }

    let remainingQty = 0;
    let autoBoughtCost = 0;

    if (resolved.fromInventory) {
      const invItem = await (prisma as any).userInventoryItem.findUnique({
        where: {
          userJid_itemId: {
            userJid: curUser.jid,
            itemId: item.id,
          },
        },
      });

      if (!invItem || invItem.quantity <= 0) {
        const discounts = await getUserEducationDiscounts(curUser.jid);
        const autoPrice = discounts.foodDiscountPercent > 0
          ? Math.round(item.price * (1 - discounts.foodDiscountPercent / 100))
          : item.price;

        if (curUser.balance < autoPrice) {
          return {
            success: false,
            error: `No tenés *${item.name}* en tu mochila y no te alcanza el saldo para comprarlo al paso (*$${autoPrice}* fichas necesarias, tu saldo: *$${curUser.balance}*).`,
          };
        }
        await prisma.userProfile.update({
          where: { id: curUser.id },
          data: { balance: { decrement: autoPrice } },
        });
        autoBoughtCost = autoPrice;
      } else {
        remainingQty = invItem.quantity - 1;
        if (remainingQty > 0) {
          await (prisma as any).userInventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: { decrement: 1 } },
          });
        } else {
          await (prisma as any).userInventoryItem.delete({
            where: { id: invItem.id },
          });
        }
      }
    } else {
      if (curUser.balance < item.price) {
        return {
          success: false,
          error: `No tenés *${item.name}* en tu mochila y no te alcanza el saldo para comprarlo al paso (*$${item.price}* fichas necesarias, tu saldo: *$${curUser.balance}*).`,
        };
      }

      await prisma.userProfile.update({
        where: { id: curUser.id },
        data: { balance: { decrement: item.price } },
      });
      autoBoughtCost = item.price;
    }

    let effectMessage = "";
    let hungerBar = "";
    let newHunger = 0;
    let jobBuffTurns = 0;



    if (item.hungerRestore) {
      const oldHunger = typeof (curUser as any).hunger === "number" ? (curUser as any).hunger : 85;
      newHunger = Math.min(100, Math.max(0, oldHunger + item.hungerRestore));
      const curTurns = typeof (curUser as any).jobBuffTurns === "number" ? (curUser as any).jobBuffTurns : 0;
      jobBuffTurns = curTurns + 3;

      await (prisma.userProfile as any).update({
        where: { id: curUser.id },
        data: {
          hunger: newHunger,
          hungerWarningSent: newHunger <= 15,
          jobBuffTurns,
          foodEaten: { increment: 1 },
        },
      });

      const totalBlocks = 10;
      const filledBlocks = Math.round((newHunger / 100) * totalBlocks);
      const emptyBlocks = totalBlocks - filledBlocks;
      const fillChar = newHunger <= 15 ? "🟥" : newHunger <= 40 ? "🟨" : "🟩";
      hungerBar = `[${fillChar.repeat(filledBlocks)}${"⬜".repeat(emptyBlocks)}] ${newHunger}%`;
    }

    const updatedProfile = await prisma.userProfile.findUnique({ where: { id: curUser.id } });

    return {
      success: true,
      item,
      fromInventory: resolved.fromInventory && autoBoughtCost === 0,
      autoBoughtCost,
      remainingQty,
      effectMessage,
      hungerBar,
      newHunger,
      jobBuffTurns,
      newBalance: updatedProfile?.balance ?? curUser.balance,
    };
  });
}

/**
 * Permite a un usuario alimentar o invitarle comida/bebida a otro miembro del grupo.
 * Consume de su mochila si lo tiene, o se lo compra al paso con sus fichas.
 */
export async function feedOtherUser(
  giverJid: string,
  targetJid: string,
  itemQuery?: string,
  preferredCategory: "comida" | "bebida" | "any" = "comida"
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  fromInventory?: boolean;
  autoBoughtCost?: number;
  giverBalance?: number;
  targetHunger?: number;
  targetHungerBar?: string;
  jobBuffTurns?: number;
}> {
  const giver = await resolveOrRegisterUser(giverJid);
  const target = await resolveOrRegisterUser(targetJid);

  if (giver.id === target.id) {
    return {
      success: false,
      error: `Para comer o beber vos mismo, usá directamente \`!comer ${itemQuery || ""}\` o \`!tomar\`.`,
    };
  }

  const resolved = await resolveConsumableItemForUser(giverJid, itemQuery, preferredCategory);
  if (resolved.error || !resolved.item) {
    return {
      success: false,
      error: resolved.error || `El ítem "${itemQuery}" no existe en el menú. Revisá la \`!tienda\`.`,
    };
  }

  const item = resolved.item;
  if (item.category !== "comida" && item.category !== "bebida" && !item.hungerRestore) {
    return {
      success: false,
      error: `Solo podés convidar alimentos o bebidas para alimentar a alguien.`,
    };
  }

  return await withWriteLock(async () => {
    const curTarget = (await prisma.userProfile.findUnique({ where: { id: target.id } })) || target;
    const oldHunger = typeof (curTarget as any).hunger === "number" ? (curTarget as any).hunger : 85;

    if (oldHunger >= 100 && !item.effect && (item.hungerRestore || 0) > 0) {
      return {
        success: false,
        error: `¡${curTarget.primaryName || "Ese usuario"} ya está al *100%* de energía! 🔋 No necesita que le invites comida en este momento.`,
      };
    }

    const curGiver = (await prisma.userProfile.findUnique({ where: { id: giver.id } })) || giver;
    let giverBalance = curGiver.balance;
    let autoBoughtCost = 0;

    if (resolved.fromInventory) {
      const invItem = await (prisma as any).userInventoryItem.findUnique({
        where: {
          userJid_itemId: {
            userJid: curGiver.jid,
            itemId: item.id,
          },
        },
      });

      if (!invItem || invItem.quantity <= 0) {
        if (curGiver.balance < item.price) {
          return {
            success: false,
            error: `No tenés *${item.name}* en tu mochila ni saldo suficiente para comprárselo (*$${item.price}* fichas necesarias, tu saldo: *$${curGiver.balance}*).`,
          };
        }
        const updatedGiver = await prisma.userProfile.update({
          where: { id: curGiver.id },
          data: { balance: { decrement: item.price } },
        });
        giverBalance = updatedGiver.balance;
        autoBoughtCost = item.price;
      } else {
        if (invItem.quantity > 1) {
          await (prisma as any).userInventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: { decrement: 1 } },
          });
        } else {
          await (prisma as any).userInventoryItem.delete({
            where: { id: invItem.id },
          });
        }
      }
    } else {
      if (curGiver.balance < item.price) {
        return {
          success: false,
          error: `No tenés *${item.name}* en tu mochila ni saldo suficiente para comprárselo (*$${item.price}* fichas necesarias, tu saldo: *$${curGiver.balance}*).`,
        };
      }
      const updatedGiver = await prisma.userProfile.update({
        where: { id: curGiver.id },
        data: { balance: { decrement: item.price } },
      });
      giverBalance = updatedGiver.balance;
      autoBoughtCost = item.price;
    }

    // 2. Alimentar al destinatario
    const restore = item.hungerRestore || 30;
    const newHunger = Math.min(100, Math.max(0, oldHunger + restore));
    const curBuffTurns = typeof (curTarget as any).jobBuffTurns === "number" ? (curTarget as any).jobBuffTurns : 0;
    const newBuffTurns = curBuffTurns + 3;

    await (prisma.userProfile as any).update({
      where: { id: target.id },
      data: {
        hunger: newHunger,
        hungerWarningSent: newHunger <= 15,
        jobBuffTurns: newBuffTurns,
        foodEaten: { increment: 1 },
      },
    });

    const totalBlocks = 10;
    const filledBlocks = Math.round((newHunger / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const fillChar = newHunger <= 15 ? "🟥" : newHunger <= 40 ? "🟨" : "🟩";
    const hungerBar = `[${fillChar.repeat(filledBlocks)}${"⬜".repeat(emptyBlocks)}] ${newHunger}%`;

    return {
      success: true,
      item,
      fromInventory: resolved.fromInventory && autoBoughtCost === 0,
      autoBoughtCost,
      giverBalance,
      targetHunger: newHunger,
      targetHungerBar: hungerBar,
      jobBuffTurns: newBuffTurns,
    };
  });
}

