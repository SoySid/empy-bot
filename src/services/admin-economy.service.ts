import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser, updateCachedUser } from "./db/user.service.js";
import { SHOP_ITEMS, ShopItem } from "../config/shop.config.js";
import { findShopItem } from "./shop.service.js";
import { PROFESSIONS, ProfessionType } from "../config/economy.config.js";
import { renderHungerBar } from "./hunger.service.js";
import type { UserProfile } from "@prisma/client";
import { cleanJid, extractDigits, ramLidToPhoneMap, ramPhoneToLidMap } from "./whatsapp-identity.js";

// ID canónico, LID y teléfono del Creador (@Sid), configurable exclusivamente vía .env
export const BOT_OWNER_PHONE = (process.env.BOT_OWNER_PHONE || "").replace(/\D/g, "");
export const BOT_OWNER_JID = process.env.BOT_OWNER_JID || (BOT_OWNER_PHONE ? `${BOT_OWNER_PHONE}@s.whatsapp.net` : "");
export const BOT_OWNER_LID = process.env.BOT_OWNER_LID || "";
export const BOT_OWNER_LID_DIGITS = (process.env.BOT_OWNER_LID_DIGITS || BOT_OWNER_LID).replace(/\D/g, "");

// Tracking en memoria de usuarios congelados temporalmente (userJid/phone -> unfreezeTimestamp)
const frozenUsers = new Map<string, number>();

/**
 * Valida si un usuario es el Creador legítimo (@Sid) mediante comparación canónica estricta.
 */
export function isBotOwner(
  senderProfile?: { role?: string; phone?: string | null; jid?: string; lid?: string | null } | null,
  senderJid?: string
): boolean {
  if (senderProfile) {
    if (senderProfile.role === "owner") return true;
    if (BOT_OWNER_PHONE && senderProfile.phone && senderProfile.phone.replace(/\D/g, "") === BOT_OWNER_PHONE) return true;
    if (senderProfile.jid) {
      if (BOT_OWNER_JID && senderProfile.jid === BOT_OWNER_JID) return true;
      const jidPhone = senderProfile.jid.split("@")[0].replace(/\D/g, "");
      if (BOT_OWNER_PHONE && jidPhone === BOT_OWNER_PHONE) return true;
    }
    if (senderProfile.lid) {
      if (BOT_OWNER_LID && senderProfile.lid === BOT_OWNER_LID) return true;
      const lidDigits = senderProfile.lid.split("@")[0].replace(/\D/g, "");
      if (BOT_OWNER_LID_DIGITS && lidDigits === BOT_OWNER_LID_DIGITS) return true;
    }
  }
  if (senderJid) {
    const cleanDigits = senderJid.split("@")[0].replace(/\D/g, "");
    if (BOT_OWNER_PHONE && cleanDigits === BOT_OWNER_PHONE) return true;
    if (BOT_OWNER_LID_DIGITS && cleanDigits === BOT_OWNER_LID_DIGITS) return true;
    if (BOT_OWNER_JID && senderJid === BOT_OWNER_JID) return true;
    if (BOT_OWNER_LID && senderJid === BOT_OWNER_LID) return true;
  }
  return false;
}

/**
 * Comprueba si un usuario tiene la economía congelada administrativamente.
 */
export function isUserEconomyFrozen(userJid: string): { frozen: boolean; remainingSeconds?: number } {
  if (!userJid) return { frozen: false };
  const clean = cleanJid(userJid);
  const cleanDigits = extractDigits(clean);
  const mappedPhone = ramLidToPhoneMap.get(clean) || (cleanDigits ? ramLidToPhoneMap.get(cleanDigits) : undefined);
  const mappedLid = ramPhoneToLidMap.get(clean) || (cleanDigits ? ramPhoneToLidMap.get(cleanDigits) : undefined);
  const now = Date.now();

  const keysToCheck = [userJid, clean, cleanDigits, mappedPhone, mappedLid].filter(Boolean) as string[];
  for (const k of keysToCheck) {
    const expiry = frozenUsers.get(k) || 0;
    if (expiry > now) {
      const remainingSeconds = Math.ceil((expiry - now) / 1000);
      return { frozen: true, remainingSeconds };
    }
  }

  // Si ya venció, limpiar memoria
  for (const k of keysToCheck) {
    if (frozenUsers.has(k)) {
      frozenUsers.delete(k);
    }
  }

  return { frozen: false };
}

/**
 * Congela la economía de un usuario durante X minutos.
 */
export async function freezeUserEconomy(
  targetJid: string,
  minutes: number
): Promise<{ success: boolean; error?: string; minutes?: number; unfreezeAt?: Date; targetUser?: UserProfile }> {
  const user = await resolveOrRegisterUser(targetJid);
  const cleanDigits = user.phone || user.jid.replace(/\D/g, "");

  if (minutes <= 0) {
    frozenUsers.delete(user.jid);
    frozenUsers.delete(cleanDigits);
    return { success: true, minutes: 0, targetUser: user };
  }

  const unfreezeAt = new Date(Date.now() + minutes * 60 * 1000);
  frozenUsers.set(user.jid, unfreezeAt.getTime());
  frozenUsers.set(cleanDigits, unfreezeAt.getTime());

  return {
    success: true,
    minutes,
    unfreezeAt,
    targetUser: user,
  };
}

/**
 * Descongela la economía de un usuario inmediatamente.
 */
export async function unfreezeUserEconomy(
  targetJid: string
): Promise<{ success: boolean; error?: string; targetUser?: UserProfile }> {
  const user = await resolveOrRegisterUser(targetJid);
  const cleanDigits = user.phone || user.jid.replace(/\D/g, "");

  frozenUsers.delete(user.jid);
  frozenUsers.delete(cleanDigits);

  return { success: true, targetUser: user };
}

/**
 * Inyecta fichas a la billetera de un usuario.
 */
export async function grantCash(
  targetJid: string,
  amount: number
): Promise<{
  success: boolean;
  error?: string;
  amount?: number;
  oldBalance?: number;
  newBalance?: number;
  targetUser?: UserProfile;
}> {
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "El monto a transferir debe ser un número entero mayor a 0." };
  }

  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldBalance = current.balance;
    const newBalance = oldBalance + amount;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: newBalance },
    });

    updateCachedUser(user.jid, { balance: updated.balance });

    return {
      success: true,
      amount,
      oldBalance,
      newBalance: updated.balance,
      targetUser: updated,
    };
  });
}

/**
 * Confisca o descuenta fichas de la billetera de un usuario.
 */
export async function seizeCash(
  targetJid: string,
  amount: number
): Promise<{
  success: boolean;
  error?: string;
  amount?: number;
  oldBalance?: number;
  newBalance?: number;
  targetUser?: UserProfile;
}> {
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "El monto a confiscar debe ser un número entero mayor a 0." };
  }

  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldBalance = current.balance;
    const newBalance = Math.max(0, oldBalance - amount);
    const actualSeized = oldBalance - newBalance;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: newBalance },
    });

    updateCachedUser(user.jid, { balance: updated.balance });

    return {
      success: true,
      amount: actualSeized,
      oldBalance,
      newBalance: updated.balance,
      targetUser: updated,
    };
  });
}

/**
 * Deja la billetera del usuario en $0 fichas.
 */
export async function clearCash(
  targetJid: string
): Promise<{
  success: boolean;
  error?: string;
  oldBalance?: number;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldBalance = current.balance;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: 0 },
    });

    updateCachedUser(user.jid, { balance: 0 });

    return {
      success: true,
      oldBalance,
      targetUser: updated,
    };
  });
}

/**
 * Modifica la barra de hambre/energía del usuario (0 a 100).
 */
export async function setHunger(
  targetJid: string,
  hungerValue: number
): Promise<{
  success: boolean;
  error?: string;
  oldHunger?: number;
  newHunger?: number;
  hungerBar?: string;
  targetUser?: UserProfile;
}> {
  const targetHunger = Math.max(0, Math.min(100, Math.floor(hungerValue)));
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldHunger = current.hunger;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        hunger: targetHunger,
        hungerWarningSent: targetHunger === 0,
      },
    });

    updateCachedUser(user.jid, {
      hunger: updated.hunger,
      hungerWarningSent: updated.hungerWarningSent,
    });

    return {
      success: true,
      oldHunger,
      newHunger: updated.hunger,
      hungerBar: renderHungerBar(updated.hunger),
      targetUser: updated,
    };
  });
}

/**
 * Otorga o modifica turnos de buff de laburo (+25%).
 */
export async function modifyBuffTurns(
  targetJid: string,
  deltaTurns: number
): Promise<{
  success: boolean;
  error?: string;
  oldTurns?: number;
  newTurns?: number;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldTurns = current.jobBuffTurns;
    const newTurns = Math.max(0, oldTurns + deltaTurns);

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { jobBuffTurns: newTurns },
    });

    updateCachedUser(user.jid, { jobBuffTurns: updated.jobBuffTurns });

    return {
      success: true,
      oldTurns,
      newTurns: updated.jobBuffTurns,
      targetUser: updated,
    };
  });
}

/**
 * Establece directamente los turnos de buff (+30%) o nerf (-30%).
 */
export async function setBuffTurns(
  targetJid: string,
  turns: number
): Promise<{
  success: boolean;
  error?: string;
  oldTurns?: number;
  newTurns?: number;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldTurns = current.jobBuffTurns;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { jobBuffTurns: turns },
    });

    updateCachedUser(user.jid, { jobBuffTurns: updated.jobBuffTurns });

    return {
      success: true,
      oldTurns,
      newTurns: updated.jobBuffTurns,
      targetUser: updated,
    };
  });
}

/**
 * Elimina todos los turnos de buff de laburo acumulados.
 */
export async function clearBuffTurns(
  targetJid: string
): Promise<{
  success: boolean;
  error?: string;
  oldTurns?: number;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldTurns = current.jobBuffTurns;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { jobBuffTurns: 0 },
    });

    updateCachedUser(user.jid, { jobBuffTurns: 0 });

    return {
      success: true,
      oldTurns,
      targetUser: updated,
    };
  });
}

/**
 * Otorga un escudo anti-robos sagrado por X horas (o lo remueve si hours <= 0).
 */
export async function setRobShield(
  targetJid: string,
  hours: number
): Promise<{
  success: boolean;
  error?: string;
  hours?: number;
  shieldUntil?: Date | null;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const shieldUntil = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;

    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { robShieldUntil: shieldUntil },
    });

    updateCachedUser(user.jid, { robShieldUntil: updated.robShieldUntil });

    return {
      success: true,
      hours: Math.max(0, hours),
      shieldUntil,
      targetUser: updated,
    };
  });
}

/**
 * Remueve el escudo anti-robos sagrado de un usuario.
 */
export async function removeRobShield(targetJid: string) {
  return setRobShield(targetJid, 0);
}

/**
 * Reexporta la búsqueda de ítems para compatibilidad sin duplicar lógica.
 */
export const lookupShopItem = findShopItem;

/**
 * Otorga cualquier ítem directamente al inventario de un usuario.
 */
export async function giveItem(
  targetJid: string,
  itemQuery: string,
  quantity: number = 1
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  quantityAdded?: number;
  newTotalQuantity?: number;
  targetUser?: UserProfile;
}> {
  const item = lookupShopItem(itemQuery);
  if (!item) {
    return {
      success: false,
      error: `El ítem "${itemQuery}" no existe en el catálogo de la tienda.`,
    };
  }

  const qty = Math.max(1, Math.min(quantity, 50));
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const existing = await (prisma as any).userInventoryItem.findUnique({
      where: {
        userJid_itemId: {
          userJid: user.jid,
          itemId: item.id,
        },
      },
    });

    let newTotal = qty;
    if (existing) {
      newTotal = existing.quantity + qty;
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
      quantityAdded: qty,
      newTotalQuantity: newTotal,
      targetUser: user,
    };
  });
}

/**
 * Confisca o elimina un ítem del inventario de un usuario.
 */
export async function confiscateItem(
  targetJid: string,
  itemQuery: string,
  quantity?: number
): Promise<{
  success: boolean;
  error?: string;
  item?: ShopItem;
  quantityRemoved?: number;
  newTotalQuantity?: number;
  targetUser?: UserProfile;
}> {
  const item = lookupShopItem(itemQuery);
  if (!item) {
    return {
      success: false,
      error: `El ítem "${itemQuery}" no existe en el catálogo de la tienda.`,
    };
  }

  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    const existing = await (prisma as any).userInventoryItem.findUnique({
      where: {
        userJid_itemId: {
          userJid: user.jid,
          itemId: item.id,
        },
      },
    });

    if (!existing || existing.quantity <= 0) {
      return {
        success: false,
        error: `El usuario no posee ningún ejemplar de "${item.name}" en su mochila.`,
      };
    }

    const qtyToRemove = quantity !== undefined && quantity > 0 ? Math.min(quantity, existing.quantity) : existing.quantity;
    const remaining = existing.quantity - qtyToRemove;

    if (remaining <= 0) {
      await (prisma as any).userInventoryItem.delete({
        where: { id: existing.id },
      });
    } else {
      await (prisma as any).userInventoryItem.update({
        where: { id: existing.id },
        data: { quantity: remaining },
      });
    }

    return {
      success: true,
      item,
      quantityRemoved: qtyToRemove,
      newTotalQuantity: remaining,
      targetUser: user,
    };
  });
}

/**
 * Inspección profunda de la economía de un usuario.
 */
export async function inspectUserEconomy(
  targetJid: string
): Promise<{
  success: boolean;
  error?: string;
  user?: UserProfile;
  inventory?: Array<{ item: ShopItem | null; itemId: string; quantity: number }>;
  professionName?: string;
  professionIcon?: string;
  isFrozen?: boolean;
  frozenSeconds?: number;
  shieldActive?: boolean;
  shieldRemainingHours?: number;
}> {
  const user = await resolveOrRegisterUser(targetJid);
  const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

  const possibleJids = [current.jid];
  if (current.lid) possibleJids.push(current.lid);
  if (current.phone) possibleJids.push(current.phone);

  const inventoryRaw = await (prisma as any).userInventoryItem.findMany({
    where: {
      userJid: { in: possibleJids },
      quantity: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  const inventory = inventoryRaw.map((inv: any) => ({
    itemId: inv.itemId,
    quantity: inv.quantity,
    item: SHOP_ITEMS[inv.itemId] || null,
  }));

  let professionName = "Sin oficio (Desocupado)";
  let professionIcon = "💼";
  if (current.profession && PROFESSIONS[current.profession as ProfessionType]) {
    const prof = PROFESSIONS[current.profession as ProfessionType];
    professionName = prof.name;
    professionIcon = prof.icon;
  }

  const freezeState = isUserEconomyFrozen(current.jid);

  let shieldActive = false;
  let shieldRemainingHours = 0;
  if (current.robShieldUntil && current.robShieldUntil > new Date()) {
    shieldActive = true;
    shieldRemainingHours = Math.round(((current.robShieldUntil.getTime() - Date.now()) / (3600 * 1000)) * 10) / 10;
  }

  return {
    success: true,
    user: current,
    inventory,
    professionName,
    professionIcon,
    isFrozen: freezeState.frozen,
    frozenSeconds: freezeState.remainingSeconds,
    shieldActive,
    shieldRemainingHours,
  };
}

/**
 * Resetea completamente el estado de la economía de un usuario a valores de fábrica.
 */
export async function resetUserEconomy(
  targetJid: string
): Promise<{
  success: boolean;
  error?: string;
  targetUser?: UserProfile;
}> {
  const user = await resolveOrRegisterUser(targetJid);

  return await withWriteLock(async () => {
    // 1. Vaciar inventario
    const possibleJids = [user.jid];
    if (user.lid) possibleJids.push(user.lid);
    if (user.phone) possibleJids.push(user.phone);

    await (prisma as any).userInventoryItem.deleteMany({
      where: { userJid: { in: possibleJids } },
    });

    // 2. Limpiar congelamientos en memoria
    const cleanDigits = user.phone || user.jid.replace(/\D/g, "");
    frozenUsers.delete(user.jid);
    frozenUsers.delete(cleanDigits);

    // 3. Resetear perfil a valores de fábrica
    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        balance: 500,
        hunger: 85,
        hungerWarningSent: false,
        jobBuffTurns: 0,
        robShieldUntil: null,
        lastJob: null,
        lastRobAttempt: null,
        jobsCompleted: 0,
        robberiesWon: 0,
        foodEaten: 0,
      },
    });

    updateCachedUser(user.jid, {
      balance: 500,
      hunger: 85,
      hungerWarningSent: false,
      jobBuffTurns: 0,
      robShieldUntil: null,
      lastJob: null,
      lastRobAttempt: null,
      jobsCompleted: 0,
      robberiesWon: 0,
      foodEaten: 0,
    });

    return {
      success: true,
      targetUser: updated,
    };
  });
}
