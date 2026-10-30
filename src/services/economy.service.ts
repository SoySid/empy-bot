import type { WASocket } from "@whiskeysockets/baileys";
import { prisma, withWriteLock, withKeyLock } from "./db/prisma.js";
import { resolveOrRegisterUser, refreshSingleUserCache, getCachedUserProfile, formatUserName } from "./db/user.service.js";
import { getCachedGroupMetadata, findGroupParticipant } from "./whatsapp-identity.js";
import {
  ECONOMY_CONFIG,
  GLOBAL_WEATHERS,
  JobCategory,
  WeatherDefinition,
  generateMadLibsJob,
  ProfessionType,
  PROFESSIONS,
  ProfessionMetadata,
} from "../config/economy.config.js";
import { SHOP_ITEMS, ShopItem } from "../config/shop.config.js";
import { renderHungerBar } from "./hunger.service.js";
import { triggerSmartEmergency } from "./community.service.js";
import { getUserEducationBuffs } from "./education.service.js";
import { isUserEconomyFrozen } from "./admin-economy.service.js";



// Contador en memoria para mitigar escrituras excesivas a DB por cada mensaje
let memoryMessageCount = 0;
let nextDestinyThreshold = Math.floor(
  Math.random() * (ECONOMY_CONFIG.DESTINY_EVENTS.MAX_MESSAGES - ECONOMY_CONFIG.DESTINY_EVENTS.MIN_MESSAGES + 1)
) + ECONOMY_CONFIG.DESTINY_EVENTS.MIN_MESSAGES;

// Memoria reciente de usuarios activos en el grupo para eventos del destino
const recentActiveUsers = new Set<string>();

// Tracking en memoria para rate limits de casino (máx 5 por minuto)
const userCasinoTimestamps = new Map<string, number[]>();

// Caché en memoria de profesiones para bypass del DMMF estático de Prisma
const userProfessionCache = new Map<string, ProfessionType>();

export async function getUserProfession(userId: string): Promise<ProfessionType | null> {
  if (userProfessionCache.has(userId)) {
    return userProfessionCache.get(userId) || null;
  }
  try {
    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { profession: true },
    });
    if (user?.profession && PROFESSIONS[user.profession as ProfessionType]) {
      const p = user.profession as ProfessionType;
      userProfessionCache.set(userId, p);
      return p;
    }
  } catch (err) {
    console.error("[getUserProfession Error]:", err);
  }
  return null;
}

export interface UserProfessionBuffs {
  earningsBonusPercent: number;
  cooldownReductionSec: number;
  hungerReductionPercent: number;
  weatherResistancePercent: number;
  blooperResistancePercent: number;
  hasHq: boolean;
  ownedTools: ShopItem[];
  lowestDurability?: number;
  hasBrokenTool?: boolean;
  toolName?: string;
  primaryToolInvId?: string;
  primaryToolDurability?: number;
}

export async function getUserProfessionBuffs(
  userJid: string,
  profession?: ProfessionType | null
): Promise<UserProfessionBuffs> {
  if (!profession) {
    return {
      earningsBonusPercent: 0,
      cooldownReductionSec: 0,
      hungerReductionPercent: 0,
      weatherResistancePercent: 0,
      blooperResistancePercent: 0,
      hasHq: false,
      ownedTools: [],
    };
  }

  try {
    const user = await resolveOrRegisterUser(userJid);
    const possibleJids = [user.jid];
    if (user.lid) possibleJids.push(user.lid);
    if (user.phone) possibleJids.push(user.phone);

    const inventory = await prisma.$queryRaw<any[]>`
      SELECT "id", "userJid", "itemId", "quantity", COALESCE("durability", 100) AS "durability"
      FROM "UserInventoryItem"
      WHERE "userJid" = ANY(${possibleJids}) AND "quantity" > 0;
    `;

    let earningsBonusPercent = 0;
    let cooldownReductionSec = 0;
    let hungerReductionPercent = 0;
    let weatherResistancePercent = 0;
    let blooperResistancePercent = 0;
    let hasHq = false;
    const ownedTools: ShopItem[] = [];

    // Mapeo de herramientas de oficio que el usuario realmente posee en su inventario
    const userToolMap = new Map<string, { invId: string; durability: number }>();
    const ownedItemIds = new Set<string>();

    for (const inv of inventory) {
      ownedItemIds.add(inv.itemId);
      const it = SHOP_ITEMS[inv.itemId];
      if (it && it.category === "herramienta" && it.profession === profession) {
        userToolMap.set(inv.itemId, {
          invId: inv.id,
          durability: typeof inv.durability === "number" ? inv.durability : 100,
        });
      }
    }

    const profTools = Object.values(SHOP_ITEMS)
      .filter((it) => it.category === "herramienta" && it.profession === profession);

    // Herramientas poseídas ordenadas por tier descendente (la principal es la de mayor tier)
    const ownedProfTools = profTools
      .filter((t) => userToolMap.has(t.id))
      .sort((a, b) => (b.tier || 0) - (a.tier || 0));

    const primaryTool = ownedProfTools[0];
    const primaryToolData = primaryTool ? userToolMap.get(primaryTool.id) : undefined;
    const primaryToolName = primaryTool?.name;
    const primaryToolInvId = primaryToolData?.invId;
    const primaryToolDurability = primaryToolData?.durability ?? 100;

    let hasBrokenTool = false;
    let lowestDurability = 100;

    // Computar herramientas de la profesión: cada herramienta aporta sus buffs si su durabilidad es > 0
    for (const tool of ownedProfTools) {
      ownedTools.push(tool);
      const toolData = userToolMap.get(tool.id);
      const dur = toolData?.durability ?? 100;
      if (dur < lowestDurability) lowestDurability = dur;

      if (dur <= 0) {
        hasBrokenTool = true;
      } else {
        if (tool.buff?.earningsBonusPercent) {
          earningsBonusPercent += tool.buff.earningsBonusPercent;
        }
        if (tool.buff?.cooldownReductionSec) {
          cooldownReductionSec += tool.buff.cooldownReductionSec;
        }
        if (tool.buff?.hungerReductionPercent) {
          hungerReductionPercent += tool.buff.hungerReductionPercent;
        }
        if (tool.buff?.weatherResistancePercent) {
          weatherResistancePercent += tool.buff.weatherResistancePercent;
        }
        if (tool.buff?.blooperResistancePercent) {
          blooperResistancePercent += tool.buff.blooperResistancePercent;
        }
      }
    }

    // Computar reliquias únicas de profesión, sedes y coleccionables permanentes
    for (const inv of inventory) {
      const it = SHOP_ITEMS[inv.itemId];
      if (!it || !it.buff) continue;

      // Si es objeto único de su profesión
      if (it.uniqueProfessionItem && it.profession === profession) {
        if (it.buff.earningsBonusPercent) earningsBonusPercent += it.buff.earningsBonusPercent;
        if (it.buff.cooldownReductionSec) cooldownReductionSec += it.buff.cooldownReductionSec;
        if (it.buff.hungerReductionPercent) hungerReductionPercent += it.buff.hungerReductionPercent;
        if (it.buff.weatherResistancePercent) weatherResistancePercent += it.buff.weatherResistancePercent;
        if (it.buff.blooperResistancePercent) blooperResistancePercent += it.buff.blooperResistancePercent;
      }

      // Si es sede o taller propio de su profesión
      if (it.category === "negocio" && it.profession === profession) {
        hasHq = true;
        if (it.buff.earningsBonusPercent) earningsBonusPercent += it.buff.earningsBonusPercent;
        if (it.buff.cooldownReductionSec) cooldownReductionSec += it.buff.cooldownReductionSec;
        if (it.buff.hungerReductionPercent) hungerReductionPercent += it.buff.hungerReductionPercent;
        if (it.buff.weatherResistancePercent) weatherResistancePercent += it.buff.weatherResistancePercent;
        if (it.buff.blooperResistancePercent) blooperResistancePercent += it.buff.blooperResistancePercent;
      }

      // Si es coleccionable permanente (ej: Zanella, Peugeot 504, Hilux, Lamborghini, etc.)
      if (it.category === "coleccionable") {
        if (it.buff.earningsBonusPercent) earningsBonusPercent += it.buff.earningsBonusPercent;
        if (it.buff.cooldownReductionSec) cooldownReductionSec += it.buff.cooldownReductionSec;
        if (it.buff.hungerReductionPercent) hungerReductionPercent += it.buff.hungerReductionPercent;
        if (it.buff.weatherResistancePercent) weatherResistancePercent += it.buff.weatherResistancePercent;
        if (it.buff.blooperResistancePercent) blooperResistancePercent += it.buff.blooperResistancePercent;
      }
    }

    // Computar buffs de educación (Cursos Técnicos y Título Universitario)
    const eduBuffs = await getUserEducationBuffs(userJid, profession);
    earningsBonusPercent += eduBuffs.earningsBonusPercent;
    hungerReductionPercent += eduBuffs.hungerReductionPercent;

    // Cooldown reduction capped at 45 seconds max (giving 45s cooldown minimum)
    cooldownReductionSec = Math.min(45, cooldownReductionSec);
    weatherResistancePercent = Math.min(100, weatherResistancePercent);
    blooperResistancePercent = Math.min(90, blooperResistancePercent);

    return {
      earningsBonusPercent,
      cooldownReductionSec,
      hungerReductionPercent,
      weatherResistancePercent,
      blooperResistancePercent,
      hasHq,
      ownedTools,
      lowestDurability,
      hasBrokenTool,
      toolName: primaryToolName,
      primaryToolInvId,
      primaryToolDurability,
    };
  } catch (err) {
    console.error("[getUserProfessionBuffs Error]:", err);
    return {
      earningsBonusPercent: 0,
      cooldownReductionSec: 0,
      hungerReductionPercent: 0,
      weatherResistancePercent: 0,
      blooperResistancePercent: 0,
      hasHq: false,
      ownedTools: [],
    };
  }
}

export function checkCasinoRateLimit(userId: string): { allowed: boolean; remainingSec: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const timestamps = (userCasinoTimestamps.get(userId) || []).filter((t) => now - t < windowMs);
  userCasinoTimestamps.set(userId, timestamps);

  if (timestamps.length >= ECONOMY_CONFIG.CASINO_MAX_BETS_PER_MINUTE) {
    const oldest = timestamps[0];
    const remainingSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, remainingSec: Math.max(1, remainingSec) };
  }

  return { allowed: true, remainingSec: 0 };
}

export function recordCasinoBet(userId: string): void {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const timestamps = (userCasinoTimestamps.get(userId) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  userCasinoTimestamps.set(userId, timestamps);
}

// Cooldown para no abusar asaltando repetidamente a la misma víctima
const aggressorVictimCooldowns = new Map<string, number>();

let memoryCachedGlobalState: {
  weather: WeatherDefinition;
  state: {
    id: string;
    currentEvent: string;
    eventDescription: string;
    eventExpiresAt: Date;
    messageCounter: number;
  };
} | null = null;

/**
 * Obtiene o inicializa el estado climático global singleton con caché en memoria.
 */
export async function getOrInitGlobalState(): Promise<{
  weather: WeatherDefinition;
  state: {
    id: string;
    currentEvent: string;
    eventDescription: string;
    eventExpiresAt: Date;
    messageCounter: number;
  };
}> {
  const now = new Date();
  if (memoryCachedGlobalState && memoryCachedGlobalState.state.eventExpiresAt > now) {
    return memoryCachedGlobalState;
  }

  let state = await prisma.serverEconomyState.findUnique({
    where: { id: "global" },
  });

  if (
    !state ||
    state.eventExpiresAt <= now ||
    state.eventExpiresAt.getTime() - now.getTime() > ECONOMY_CONFIG.WEATHER_ROTATION_MS
  ) {
    const weatherKeys = Object.keys(GLOBAL_WEATHERS);
    const currentId = state?.currentEvent;
    const candidates = weatherKeys.filter((k) => k !== currentId);
    const chosenKey = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : "NORMAL";

    const weatherDef = GLOBAL_WEATHERS[chosenKey] || GLOBAL_WEATHERS.NORMAL;
    const expiresAt = new Date(Date.now() + ECONOMY_CONFIG.WEATHER_ROTATION_MS);

    state = await withWriteLock(async () => {
      return await prisma.serverEconomyState.upsert({
        where: { id: "global" },
        update: {
          currentEvent: weatherDef.id,
          eventDescription: weatherDef.description,
          eventExpiresAt: expiresAt,
        },
        create: {
          id: "global",
          currentEvent: weatherDef.id,
          eventDescription: weatherDef.description,
          eventExpiresAt: expiresAt,
          messageCounter: 0,
        },
      });
    });
  }

  const weather = GLOBAL_WEATHERS[state.currentEvent] || GLOBAL_WEATHERS.NORMAL;
  memoryCachedGlobalState = { weather, state };
  return memoryCachedGlobalState;
}

/**
 * Rota manualmente o por timer el clima global.
 */
export async function rotateGlobalWeather(forcedWeatherKey?: string): Promise<{
  oldWeather: WeatherDefinition;
  newWeather: WeatherDefinition;
  expiresAt: Date;
}> {
  const currentState = await prisma.serverEconomyState.findUnique({
    where: { id: "global" },
  });

  const oldWeather = GLOBAL_WEATHERS[currentState?.currentEvent || "NORMAL"] || GLOBAL_WEATHERS.NORMAL;

  let chosenKey = forcedWeatherKey;
  if (!chosenKey || !GLOBAL_WEATHERS[chosenKey]) {
    const weatherKeys = Object.keys(GLOBAL_WEATHERS);
    const candidates = weatherKeys.filter((k) => k !== oldWeather.id);
    chosenKey = candidates[Math.floor(Math.random() * candidates.length)] || "NORMAL";
  }

  const newWeather = GLOBAL_WEATHERS[chosenKey] || GLOBAL_WEATHERS.NORMAL;
  const expiresAt = new Date(Date.now() + ECONOMY_CONFIG.WEATHER_ROTATION_MS);

  const updatedState = await withWriteLock(async () => {
    return await prisma.serverEconomyState.upsert({
      where: { id: "global" },
      update: {
        currentEvent: newWeather.id,
        eventDescription: newWeather.description,
        eventExpiresAt: expiresAt,
      },
      create: {
        id: "global",
        currentEvent: newWeather.id,
        eventDescription: newWeather.description,
        eventExpiresAt: expiresAt,
        messageCounter: 0,
      },
    });
  });

  memoryCachedGlobalState = { weather: newWeather, state: updatedState };

  return { oldWeather, newWeather, expiresAt };
}

/**
 * Verifica y aplica cobro pasivo automático cada 20 horas.
 */
export async function checkAndApplyPassiveDaily(userJid: string): Promise<{
  credited: boolean;
  amount: number;
  baseAmount: number;
  businessBonus: number;
  newBalance: number;
  remainingMs: number;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const now = new Date();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const DAILY_INTERVAL_MS = ECONOMY_CONFIG.PASSIVE_DAILY_HOURS * ONE_HOUR_MS;

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({
      where: { id: user.id },
    })) || user;

    // Calcular renta pasiva de negocios del usuario
    const userInv = await (prisma as any).userInventoryItem.findMany({
      where: { userJid: user.jid, quantity: { gt: 0 } },
    });
    let businessBonus = 0;
    for (const inv of userInv) {
      const it = SHOP_ITEMS[inv.itemId];
      if (it && it.category === "negocio" && it.passiveDailyBonus) {
        businessBonus += it.passiveDailyBonus * inv.quantity;
      }
    }
    const totalAmount = ECONOMY_CONFIG.PASSIVE_DAILY_AMOUNT + businessBonus;

    const elapsed = now.getTime() - current.lastDaily.getTime();
    if (elapsed >= DAILY_INTERVAL_MS) {
      const updated = await prisma.userProfile.update({
        where: { id: current.id },
        data: {
          balance: { increment: totalAmount },
          lastDaily: now,
        },
      });

      return {
        credited: true,
        amount: totalAmount,
        baseAmount: ECONOMY_CONFIG.PASSIVE_DAILY_AMOUNT,
        businessBonus,
        newBalance: updated.balance,
        remainingMs: DAILY_INTERVAL_MS,
      };
    }

    return {
      credited: false,
      amount: totalAmount,
      baseAmount: ECONOMY_CONFIG.PASSIVE_DAILY_AMOUNT,
      businessBonus,
      newBalance: current.balance,
      remainingMs: Math.max(0, DAILY_INTERVAL_MS - elapsed),
    };
  });
}

/**
 * Consulta la billetera de un usuario con tiempos de cooldown formateados.
 */
export async function getWallet(userJid: string): Promise<{
  jid: string;
  primaryName: string;
  balance: number;
  dailyCreditedJustNow: boolean;
  dailyRemainingMs: number;
  dailyAmount: number;
  dailyBaseAmount: number;
  dailyBusinessBonus: number;
  canJob: boolean;
  jobRemainingMs: number;
  hasRobShield: boolean;
  robShieldRemainingMs: number;
  canRob: boolean;
  robRemainingMs: number;
  hunger: number;
  hungerBar: string;
  jobBuffTurns: number;
  title: string | null;
  profession: ProfessionType | null;
  professionName?: string;
  professionIcon?: string;
  professionBuffs?: UserProfessionBuffs;
  jobCooldownMs?: number;
  businesses: ShopItem[];
  collectibles: ShopItem[];
  relics: ShopItem[];
}> {
  const user = await resolveOrRegisterUser(userJid);
  const dailyCheck = await checkAndApplyPassiveDaily(user.jid);

  const current = (await prisma.userProfile.findUnique({
    where: { id: user.id },
  })) || user;

  const now = Date.now();
  const balance = current.balance;
  const primaryName = current.primaryName;

  const rawProfession = await getUserProfession(current.id);
  const profMeta = rawProfession && PROFESSIONS[rawProfession] ? PROFESSIONS[rawProfession] : null;
  const buffs = await getUserProfessionBuffs(current.jid, profMeta?.id);

  // Job cooldown (1m 30s base, reducible with tools down to 45s)
  const lastJobMs = current.lastJob ? current.lastJob.getTime() : 0;
  const baseCooldownMs = ECONOMY_CONFIG.JOB_COOLDOWN_MINUTES * 60 * 1000;
  const jobCooldownMs = Math.max(45000, baseCooldownMs - (buffs.cooldownReductionSec * 1000));
  const jobElapsed = now - lastJobMs;
  const canJob = jobElapsed >= jobCooldownMs;
  const jobRemainingMs = canJob ? 0 : jobCooldownMs - jobElapsed;

  // Rob shield (abolidos)
  const hasRobShield = false;
  const robShieldRemainingMs = 0;

  // Rob attempt cooldown (1 min)
  const lastRobMs = current.lastRobAttempt ? current.lastRobAttempt.getTime() : 0;
  const robCooldownMs = ECONOMY_CONFIG.ROB_COOLDOWN_MINUTES * 60 * 1000;
  const robElapsed = now - lastRobMs;
  const canRob = robElapsed >= robCooldownMs;
  const robRemainingMs = canRob ? 0 : robCooldownMs - robElapsed;
  const hunger = typeof (current as any).hunger === "number" ? (current as any).hunger : 85;
  const jobBuffTurns = typeof (current as any).jobBuffTurns === "number" ? (current as any).jobBuffTurns : 0;
  const title = (current as any).title || null;
  const hungerBar = renderHungerBar(hunger);

  // Negocios, coleccionables y reliquias del usuario
  const walletPossibleJids = [user.jid];
  if (user.lid) walletPossibleJids.push(user.lid);
  if (user.phone) walletPossibleJids.push(user.phone);

  const userInv = await (prisma as any).userInventoryItem.findMany({
    where: { userJid: { in: walletPossibleJids }, quantity: { gt: 0 } },
  });
  const businesses: ShopItem[] = [];
  const collectibles: ShopItem[] = [];
  const relics: ShopItem[] = [];
  for (const inv of userInv) {
    const it = SHOP_ITEMS[inv.itemId];
    if (it) {
      if (it.category === "negocio") businesses.push(it);
      if (it.category === "coleccionable") collectibles.push(it);
      if (it.uniqueProfessionItem) relics.push(it);
    }
  }

  return {
    jid: current.jid,
    primaryName,
    balance,
    dailyCreditedJustNow: dailyCheck.credited,
    dailyRemainingMs: dailyCheck.remainingMs,
    dailyAmount: dailyCheck.amount,
    dailyBaseAmount: dailyCheck.baseAmount,
    dailyBusinessBonus: dailyCheck.businessBonus,
    canJob,
    jobRemainingMs,
    hasRobShield,
    robShieldRemainingMs,
    canRob,
    robRemainingMs,
    hunger,
    hungerBar,
    jobBuffTurns,
    title,
    profession: profMeta ? profMeta.id : null,
    professionName: profMeta?.name,
    professionIcon: profMeta?.icon,
    professionBuffs: buffs,
    jobCooldownMs,
    businesses,
    collectibles,
    relics,
  };
}

/**
 * Modifica el saldo atómicamente asegurando saldo >= 0.
 */
export async function modifyBalance(
  userJid: string,
  delta: number,
  allowNegative = false
): Promise<{ success: boolean; oldBalance: number; newBalance: number; error?: string }> {
  const user = await resolveOrRegisterUser(userJid);

  return await withKeyLock(`user:${user.id}`, async () => {
    const current = (await prisma.userProfile.findUnique({
      where: { id: user.id },
    })) || user;

    const currentBalance = current.balance;
    const computedBalance = currentBalance + delta;
    if (!allowNegative && computedBalance < 0) {
      return {
        success: false,
        oldBalance: currentBalance,
        newBalance: currentBalance,
        error: "Fondos insuficientes.",
      };
    }

    const updated = await prisma.userProfile.update({
      where: { id: current.id },
      data: {
        balance: allowNegative && computedBalance < 0 ? 0 : { increment: delta },
      },
    });

    const cached = getCachedUserProfile(user.jid);
    if (cached) {
      cached.balance = updated.balance;
    }

    return {
      success: true,
      oldBalance: currentBalance,
      newBalance: updated.balance,
    };
  });
}

/**
 * Realiza una transferencia atómica entre dos usuarios.
 */
export async function transfer(
  senderJid: string,
  targetJid: string,
  amount: number
): Promise<{ success: boolean; error?: string; senderBalance?: number; targetBalance?: number }> {
  if (amount <= 0 || !Number.isInteger(amount)) {
    return { success: false, error: "El monto debe ser un número entero positivo." };
  }

  const sender = await resolveOrRegisterUser(senderJid);
  const target = await resolveOrRegisterUser(targetJid);

  if (sender.id === target.id) {
    return { success: false, error: "No podés transferirte dinero a vos mismo." };
  }

  const senderFreeze = isUserEconomyFrozen(sender.jid).frozen || (sender.lid && isUserEconomyFrozen(sender.lid).frozen) || isUserEconomyFrozen(sender.phone).frozen;
  if (senderFreeze) {
    return { success: false, error: "Tu cuenta se encuentra congelada por administración. No podés transferir fondos." };
  }

  const targetFreeze = isUserEconomyFrozen(target.jid).frozen || (target.lid && isUserEconomyFrozen(target.lid).frozen) || isUserEconomyFrozen(target.phone).frozen;
  if (targetFreeze) {
    return { success: false, error: "El destinatario se encuentra congelado por administración." };
  }

  return await withWriteLock(async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        const curSender = await tx.userProfile.findUnique({ where: { id: sender.id } });
        if (!curSender || curSender.balance < amount) {
          const bal = curSender ? curSender.balance : 0;
          throw new Error(`INSUFFICIENT_FUNDS:${bal}`);
        }

        const updatedSender = await tx.userProfile.update({
          where: { id: sender.id },
          data: { balance: { decrement: amount } },
        });

        const updatedTarget = await tx.userProfile.update({
          where: { id: target.id },
          data: { balance: { increment: amount } },
        });

        return {
          success: true,
          senderBalance: updatedSender.balance,
          targetBalance: updatedTarget.balance,
        };
      });
    } catch (err: any) {
      if (err.message && err.message.startsWith("INSUFFICIENT_FUNDS:")) {
        const bal = err.message.split(":")[1];
        return {
          success: false,
          error: `Saldo insuficiente. Tenés *$${bal}* fichas e intentaste transferir *$${amount}*.`,
        };
      }
      return {
        success: false,
        error: `Error al procesar la transferencia: ${err.message || err}`,
      };
    }
  });
}

/**
 * Ejecuta el comando de changa/laburo con el motor de 4 ramas (Normal, VIP, Turbio, Cagada),
 * mitigación matemática de bloopers y desgaste de herramientas principales.
 */
export async function executeJob(
  userJid: string,
  categoryChoice?: JobCategory,
  sock?: WASocket,
  remoteJid?: string
): Promise<{
  success: boolean;
  error?: string;
  isFrozen?: boolean;
  onCooldown?: boolean;
  isStarved?: boolean;
  remainingMs?: number;
  story?: string;
  category?: JobCategory;
  profession?: ProfessionType;
  professionName?: string;
  professionIcon?: string;
  isSuccess?: boolean;
  isVip?: boolean;
  isDilemma?: boolean;
  isCagada?: boolean;
  dilemmaPrompt?: string;
  splashMessage?: string;
  earnings?: number;
  baseReward?: number;
  multiplier?: number;
  weatherName?: string;
  weatherIcon?: string;
  newBalance?: number;
  hadFoodBuff?: boolean;
  hasJobNerf?: boolean;
  foodBuffRemaining?: number;
  jobNerfRemaining?: number;
  toolBonusPercent?: number;
  toolCooldownReduction?: number;
  hungerConsumed?: number;
  newHunger?: number;
  weatherResisted?: boolean;
  toolDurability?: number;
  toolName?: string;
  isToolBroken?: boolean;
  isBareHands?: boolean;
}> {
  const freezeCheck = isUserEconomyFrozen(userJid);
  if (freezeCheck.frozen) {
    const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
    return {
      success: false,
      isFrozen: true,
      error: `🧊 *¡ECONOMÍA CONGELADA!* Fuiste sancionado administrativamente por la patronal (@Sid). No podés laburar por los próximos *${mins} minuto(s)*.`,
    };
  }

  const user = await resolveOrRegisterUser(userJid);
  const now = new Date();

  return await withKeyLock(`user:${user.id}`, async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    // Verificar inanición (0% de energía): no puede laburar sin alimentarse
    const currentHunger = typeof (current as any).hunger === "number" ? (current as any).hunger : 85;
    if (currentHunger <= 0) {
      return {
        success: false,
        isStarved: true,
      };
    }

    const rawProfession = await getUserProfession(current.id);
    const hasValidProfession = rawProfession && PROFESSIONS[rawProfession];
    const profMeta = hasValidProfession ? PROFESSIONS[rawProfession] : null;

    const buffs = await getUserProfessionBuffs(current.jid, profMeta?.id);

    const baseJobCooldownMs = ECONOMY_CONFIG.JOB_COOLDOWN_MINUTES * 60 * 1000;
    const effectiveJobCooldownMs = Math.max(45000, baseJobCooldownMs - (buffs.cooldownReductionSec * 1000));

    if (current.lastJob) {
      const elapsed = now.getTime() - current.lastJob.getTime();
      if (elapsed < effectiveJobCooldownMs) {
        return {
          success: false,
          onCooldown: true,
          remainingMs: effectiveJobCooldownMs - elapsed,
        };
      }
    }

    const { weather } = await getOrInitGlobalState();

    let targetJobKey: JobCategory | ProfessionType;
    let multiplier = 1.0;

    if (profMeta) {
      targetJobKey = profMeta.id;
      multiplier = weather.professionMultipliers?.[profMeta.id] ?? 1.0;
    } else {
      const validCategories: JobCategory[] = ["calle", "pantalla", "comercio", "turbio"];
      targetJobKey = validCategories[Math.floor(Math.random() * validCategories.length)];
      multiplier = weather.multipliers[targetJobKey as JobCategory] || 1.0;
    }

    // Mitigación climática: si el multiplicador es desfavorable (< 1.0), se amortigua según weatherResistancePercent (tope 100%)
    let effectiveMultiplier = multiplier;
    if (multiplier < 1.0 && buffs.weatherResistancePercent > 0) {
      const resistanceRatio = Math.min(1.0, buffs.weatherResistancePercent / 100);
      effectiveMultiplier = multiplier + (1.0 - multiplier) * resistanceRatio;
    }

    // 2500 fichas base para todos
    const madLibs = generateMadLibsJob(targetJobKey, undefined, buffs.blooperResistancePercent);

    let baseReward = ECONOMY_CONFIG.BASE_JOB_REWARD || 2500;
    if (!madLibs.isSuccess) {
      // Recompensa de blooper o cagada cómica
      const baseBlooper = 500;
      baseReward = buffs.hasHq ? baseBlooper * 2 : baseBlooper;
    }

    let foodMultiplier = 1.0;
    const curBuffTurns = typeof (current as any).jobBuffTurns === "number" ? (current as any).jobBuffTurns : 0;
    const hasJobBuff = curBuffTurns > 0;
    const hasJobNerf = curBuffTurns < 0;
    if (hasJobBuff) {
      foodMultiplier = 1.30; // +30% por bendición/buff divino
    } else if (hasJobNerf) {
      foodMultiplier = 0.70; // -30% por castigo/nerf divino
    }

    let toolMultiplier = 1.0;
    if (buffs.earningsBonusPercent > 0) {
      toolMultiplier += buffs.earningsBonusPercent / 100;
    }

    const earnings = Math.max(1, Math.round(baseReward * effectiveMultiplier * foodMultiplier * toolMultiplier));

    const hungerCost = Math.max(1, Math.round(3 * (1 - (buffs.hungerReductionPercent / 100))));
    const newHunger = Math.max(0, currentHunger - hungerCost);

    const updated = await (prisma.userProfile as any).update({
      where: { id: current.id },
      data: {
        balance: { increment: earnings },
        lastJob: now,
        jobBuffTurns: hasJobBuff ? { decrement: 1 } : hasJobNerf ? { increment: 1 } : undefined,
        jobsCompleted: { increment: 1 },
        hunger: newHunger,
        hungerWarningSent: newHunger <= 15,
      },
    });

    // Desgaste de herramienta principal (4% por laburo hasta 0%)
    let toolDurability: number | undefined;
    let isToolBroken: boolean | undefined;
    let toolName: string | undefined;

    if (buffs.primaryToolInvId) {
      const currentToolDur = buffs.primaryToolDurability ?? 100;
      const newToolDur = Math.max(0, currentToolDur - 4);
      await prisma.$executeRaw`
        UPDATE "UserInventoryItem"
        SET "durability" = ${newToolDur}
        WHERE "id" = ${buffs.primaryToolInvId};
      `.catch((e) => console.error("[Durability Update Error]:", e));
      toolDurability = newToolDur;
      toolName = buffs.toolName;
      isToolBroken = newToolDur === 0;
    }

    return {
      success: true,
      story: madLibs.fullText,
      category: profMeta?.category,
      profession: profMeta ? profMeta.id : undefined,
      professionName: profMeta?.name,
      professionIcon: profMeta?.icon,
      isSuccess: madLibs.isSuccess,
      earnings,
      baseReward,
      multiplier: effectiveMultiplier,
      rawMultiplier: multiplier,
      weatherResisted: effectiveMultiplier > multiplier,
      hadFoodBuff: hasJobBuff,
      hasJobNerf,
      foodBuffRemaining: Math.max(0, Math.abs(curBuffTurns) - 1),
      toolBonusPercent: buffs.earningsBonusPercent > 0 ? buffs.earningsBonusPercent : undefined,
      toolCooldownReduction: buffs.cooldownReductionSec > 0 ? buffs.cooldownReductionSec : undefined,
      hungerConsumed: hungerCost,
      newHunger,
      weatherName: weather.name,
      weatherIcon: weather.icon,
      newBalance: updated.balance,
      toolDurability,
      toolName,
      isToolBroken,
    };
  });
}

/**
 * Ejecuta un intento de asalto asimétrico con escudos y multas de indemnización.
 */
export async function executeRobbery(
  aggressorJid: string,
  victimJid: string
): Promise<{
  success: boolean;
  error?: string;
  isSuccessfulRobbery?: boolean;
  stolenAmount?: number;
  finePaid?: number;
  aggressorBalance?: number;
  victimBalance?: number;
  shieldHours?: number;
}> {
  const freezeCheck = isUserEconomyFrozen(aggressorJid);
  if (freezeCheck.frozen) {
    const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
    return {
      success: false,
      error: `🧊 *¡ECONOMÍA CONGELADA!* No podés asaltar a nadie porque el Creador te aplicó una sanción de congelamiento (*${mins}m* restantes).`,
    };
  }

  const aggressor = await resolveOrRegisterUser(aggressorJid);
  const victim = await resolveOrRegisterUser(victimJid);

  if (aggressor.id === victim.id) {
    return { success: false, error: "No podés asaltarte a vos mismo, loco." };
  }

  const now = new Date();
  const robCooldownMs = ECONOMY_CONFIG.ROB_COOLDOWN_MINUTES * 60 * 1000;

  return await withWriteLock(async () => {
    const curAggressor = (await prisma.userProfile.findUnique({ where: { id: aggressor.id } })) || aggressor;
    const curVictim = (await prisma.userProfile.findUnique({ where: { id: victim.id } })) || victim;

    const aggressorBal = curAggressor.balance;
    const victimBal = curVictim.balance;

    if (aggressorBal < ECONOMY_CONFIG.MIN_ACTIVE_BALANCE) {
      return {
        success: false,
        error: `Necesitás al menos *$${ECONOMY_CONFIG.MIN_ACTIVE_BALANCE}* fichas para intentar asaltar (tu saldo: *$${aggressorBal}*).`,
      };
    }

    const curAggressorHunger = typeof (curAggressor as any).hunger === "number" ? (curAggressor as any).hunger : 85;
    if (curAggressorHunger <= 0) {
      return {
        success: false,
        error: "Estás desmayado de hambre (0% de energía). No tenés fuerzas para salir a correr ni asaltar a nadie. ¡Comé algo con `!comer`!",
      };
    }

    if (curAggressor.lastRobAttempt) {
      const elapsed = now.getTime() - curAggressor.lastRobAttempt.getTime();
      if (elapsed < robCooldownMs) {
        const remainingSec = Math.ceil((robCooldownMs - elapsed) / 1000);
        return {
          success: false,
          error: `Estás fichado por la cana. Debés esperar *${remainingSec} segundos* para volver a robar.`,
        };
      }
    }

    // Restricción para no abusar de la misma víctima repetidamente (4 min)
    const sameVictimKey = `${curAggressor.id}:${curVictim.id}`;
    const lastVictimRobMs = aggressorVictimCooldowns.get(sameVictimKey) || 0;
    const sameVictimCooldownMs = ECONOMY_CONFIG.ROB_SAME_VICTIM_COOLDOWN_MINUTES * 60 * 1000;
    if (now.getTime() - lastVictimRobMs < sameVictimCooldownMs) {
      const remainingMin = Math.ceil((sameVictimCooldownMs - (now.getTime() - lastVictimRobMs)) / (60 * 1000));
      return {
        success: false,
        error: `Ya asaltaste a esta víctima hace poco. Dejá respirar al pibe (esperá *${remainingMin} minutos* para volver a atacarlo).`,
      };
    }

    if (curVictim.robShieldUntil && curVictim.robShieldUntil.getTime() > now.getTime()) {
      const remainingHours = Math.ceil((curVictim.robShieldUntil.getTime() - now.getTime()) / (3600 * 1000));
      return {
        success: false,
        error: `🛡️ La víctima está bajo protección divina / escudo sagrado (*${remainingHours}h* restantes). ¡Tu intento de asalto rebotó contra el escudo!`,
      };
    }

    if (victimBal < ECONOMY_CONFIG.MIN_ACTIVE_BALANCE) {
      return {
        success: false,
        error: `La víctima tiene apenas *$${victimBal}* fichas. Tiene inmunidad por pobreza (mínimo *$${ECONOMY_CONFIG.MIN_ACTIVE_BALANCE}*).`,
      };
    }

    const roll = Math.random();
    const isSuccess = roll < ECONOMY_CONFIG.ROB_SUCCESS_RATE;

    if (isSuccess) {
      const percent =
        Math.random() * (ECONOMY_CONFIG.ROB_MAX_PERCENT - ECONOMY_CONFIG.ROB_MIN_PERCENT) +
        ECONOMY_CONFIG.ROB_MIN_PERCENT;
      const rawStolen = Math.round(victimBal * percent);
      const stolenAmount = Math.max(30, Math.min(rawStolen, ECONOMY_CONFIG.ROB_MAX_CAP));

      const [updatedAggressor, updatedVictim] = await prisma.$transaction([
        (prisma.userProfile as any).update({
          where: { id: curAggressor.id },
          data: {
            balance: { increment: stolenAmount },
            lastRobAttempt: now,
            robberiesWon: { increment: 1 },
          },
        }),
        prisma.userProfile.update({
          where: { id: curVictim.id },
          data: {
            balance: { decrement: stolenAmount },
            robShieldUntil: null,
          },
        }),
      ]);

      aggressorVictimCooldowns.set(sameVictimKey, now.getTime());
      if (aggressorVictimCooldowns.size > 500) {
        const sweepNow = now.getTime();
        for (const [k, ts] of aggressorVictimCooldowns.entries()) {
          if (sweepNow - ts > sameVictimCooldownMs) aggressorVictimCooldowns.delete(k);
        }
      }

      return {
        success: true,
        isSuccessfulRobbery: true,
        stolenAmount,
        aggressorBalance: updatedAggressor.balance,
        victimBalance: updatedVictim.balance,
        shieldHours: 0,
      };
    } else {
      const fine = Math.min(aggressorBal, ECONOMY_CONFIG.ROB_FAILURE_FINE);

      const [updatedAggressor, updatedVictim] = await prisma.$transaction([
        prisma.userProfile.update({
          where: { id: curAggressor.id },
          data: {
            balance: { decrement: fine },
            lastRobAttempt: now,
          },
        }),
        prisma.userProfile.update({
          where: { id: curVictim.id },
          data: {
            balance: { increment: fine },
          },
        }),
      ]);

      aggressorVictimCooldowns.set(sameVictimKey, now.getTime());
      if (aggressorVictimCooldowns.size > 500) {
        const sweepNow = now.getTime();
        for (const [k, ts] of aggressorVictimCooldowns.entries()) {
          if (sweepNow - ts > sameVictimCooldownMs) aggressorVictimCooldowns.delete(k);
        }
      }

      return {
        success: true,
        isSuccessfulRobbery: false,
        finePaid: fine,
        aggressorBalance: updatedAggressor.balance,
        victimBalance: updatedVictim.balance,
      };
    }
  });
}

/**
 * Minijuego de Ruleta con ventaja de la casa.
 */
export async function executeRoulette(
  userJid: string,
  color: "rojo" | "negro" | "verde",
  amount: number
): Promise<{
  success: boolean;
  error?: string;
  rollNumber?: number;
  rollColor?: "rojo" | "negro" | "verde";
  won?: boolean;
  amuletoSaved?: boolean;
  winAmount?: number;
  netProfit?: number;
  newBalance?: number;
}> {
  const freezeCheck = isUserEconomyFrozen(userJid);
  if (freezeCheck.frozen) {
    const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
    return {
      success: false,
      error: `🧊 *¡ECONOMÍA CONGELADA!* La patronal te clausuró el acceso a las apuestas por *${mins} minuto(s)* más.`,
    };
  }

  const { MIN_BET, MAX_BET } = ECONOMY_CONFIG.ROULETTE;
  if (amount < MIN_BET || amount > MAX_BET) {
    return { success: false, error: `La apuesta debe estar entre *$${MIN_BET}* y *$${MAX_BET}* fichas.` };
  }

  const user = await resolveOrRegisterUser(userJid);

  const limitCheck = checkCasinoRateLimit(user.id);
  if (!limitCheck.allowed) {
    return {
      success: false,
      error: `🛑 *Límite de apuestas:* Máximo 5 apuestas por minuto para evitar spam. Esperá *${limitCheck.remainingSec} segundos*.`,
    };
  }

  return await withKeyLock(`user:${user.id}`, async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const currentBalance = current.balance;

    if (currentBalance < amount) {
      return { success: false, error: `Saldo insuficiente. Tenés *$${currentBalance}* fichas.` };
    }

    recordCasinoBet(user.id);

    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const rollNumber = Math.floor(Math.random() * 37);

    let rollColor: "rojo" | "negro" | "verde" = "verde";
    if (rollNumber !== 0) {
      rollColor = redNumbers.includes(rollNumber) ? "rojo" : "negro";
    }

    const won = rollColor === color;
    let amuletoSaved = false;
    let netProfit = 0;
    let winAmount = 0;

    if (won) {
      if (color === "verde") {
        winAmount = amount * 14;
        netProfit = winAmount - amount;
      } else {
        winAmount = amount * 2;
        netProfit = amount;
      }
    } else {
      const amuletoItem = await prisma.userInventoryItem.findFirst({
        where: { userJid: current.jid, itemId: "amuleto", quantity: { gt: 0 } },
      });
      if (amuletoItem && Math.random() < 0.20) {
        amuletoSaved = true;
        netProfit = 0;
      } else {
        netProfit = -amount;
      }
    }

    const updated = await prisma.userProfile.update({
      where: { id: current.id },
      data: { balance: { increment: netProfit } },
    });

    return {
      success: true,
      rollNumber,
      rollColor,
      won,
      amuletoSaved,
      winAmount,
      netProfit,
      newBalance: updated.balance,
    };
  });
}

/**
 * Minijuego de Tragamonedas / Slot con ventaja de la casa.
 */
export async function executeSlot(
  userJid: string,
  amount: number
): Promise<{
  success: boolean;
  error?: string;
  reels?: [string, string, string];
  won?: boolean;
  multiplier?: number;
  winAmount?: number;
  netProfit?: number;
  newBalance?: number;
}> {
  const freezeCheck = isUserEconomyFrozen(userJid);
  if (freezeCheck.frozen) {
    const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
    return {
      success: false,
      error: `🧊 *¡ECONOMÍA CONGELADA!* La patronal te clausuró el acceso a las apuestas por *${mins} minuto(s)* más.`,
    };
  }

  const { MIN_BET, MAX_BET } = ECONOMY_CONFIG.SLOT;
  if (amount < MIN_BET || amount > MAX_BET) {
    return { success: false, error: `La apuesta de tragamonedas debe ser entre *$${MIN_BET}* y *$${MAX_BET}* fichas.` };
  }

  const user = await resolveOrRegisterUser(userJid);

  const limitCheck = checkCasinoRateLimit(user.id);
  if (!limitCheck.allowed) {
    return {
      success: false,
      error: `🛑 *Límite de apuestas:* Máximo 5 apuestas por minuto para evitar spam. Esperá *${limitCheck.remainingSec} segundos*.`,
    };
  }

  return await withKeyLock(`user:${user.id}`, async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const currentBalance = current.balance;

    if (currentBalance < amount) {
      return { success: false, error: `Saldo insuficiente. Tenés *$${currentBalance}* fichas.` };
    }

    recordCasinoBet(user.id);

    const symbols = [
      { sym: "🍒", weight: 30 },
      { sym: "🍋", weight: 26 },
      { sym: "🍇", weight: 20 },
      { sym: "🔔", weight: 14 },
      { sym: "💎", weight: 7 },
      { sym: "7️⃣", weight: 3 },
    ];

    const pickSymbol = () => {
      const totalWeight = symbols.reduce((acc, s) => acc + s.weight, 0);
      let r = Math.random() * totalWeight;
      for (const s of symbols) {
        if (r < s.weight) return s.sym;
        r -= s.weight;
      }
      return "🍒";
    };

    const reels: [string, string, string] = [pickSymbol(), pickSymbol(), pickSymbol()];

    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      switch (reels[0]) {
        case "7️⃣": multiplier = 25; break;
        case "💎": multiplier = 15; break;
        case "🔔": multiplier = 10; break;
        case "🍇": multiplier = 6; break;
        case "🍋": multiplier = 4; break;
        case "🍒": multiplier = 3; break;
      }
    } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
      const matchSym = reels[0] === reels[1] ? reels[0] : (reels[1] === reels[2] ? reels[1] : reels[0]);
      if (matchSym === "7️⃣" || matchSym === "💎") {
        multiplier = 1.5;
      } else {
        multiplier = 1.1;
      }
    }

    const won = multiplier > 0;
    const winAmount = Math.round(amount * multiplier);
    const netProfit = winAmount - amount;

    const updated = await prisma.userProfile.update({
      where: { id: current.id },
      data: { balance: { increment: netProfit } },
    });

    return {
      success: true,
      reels,
      won,
      multiplier,
      winAmount,
      netProfit,
      newBalance: updated.balance,
    };
  });
}

export interface ActiveLootDrop {
  amount: number;
  expiresAt: number;
  claimed: boolean;
}

const activeLootDrops = new Map<string, ActiveLootDrop>();

export function getActiveLootDrop(remoteJid = "global"): ActiveLootDrop | null {
  const drop = activeLootDrops.get(remoteJid);
  if (drop && Date.now() <= drop.expiresAt && !drop.claimed) {
    return drop;
  }
  return null;
}

export function dropLoot(remoteJid = "global", amount = 60000, durationMs = 300000): ActiveLootDrop {
  const drop: ActiveLootDrop = {
    amount,
    expiresAt: Date.now() + durationMs,
    claimed: false,
  };
  activeLootDrops.set(remoteJid, drop);
  return drop;
}

export async function claimActiveLoot(
  userJid: string,
  remoteJid = "global"
): Promise<{
  success: boolean;
  amount?: number;
  newBalance?: number;
  error?: string;
}> {
  return await withKeyLock(`loot:${remoteJid}`, async () => {
    const drop = activeLootDrops.get(remoteJid);
    if (!drop || Date.now() > drop.expiresAt) {
      return {
        success: false,
        error: "💨 No hay ningún botín tirado en la calle (o ya expiró y se lo llevó el viento).",
      };
    }

    if (drop.claimed) {
      return {
        success: false,
        error: "🏃‍♂️ ¡Llegaste tarde! Alguien con manos más rápidas ya se manoteó el botín.",
      };
    }

    drop.claimed = true;
    const amount = drop.amount;
    const modRes = await modifyBalance(userJid, amount);

    return {
      success: true,
      amount,
      newBalance: modRes.newBalance,
    };
  });
}

/**
 * Despachador de Eventos del Destino espontáneos en el grupo.
 * Se evalúa cada 40 a 70 mensajes.
 */
export async function handleDestinyEvents(
  sock: WASocket,
  remoteJid: string,
  currentSenderJid: string
): Promise<void> {
  recentActiveUsers.add(currentSenderJid);
  if (recentActiveUsers.size > 20) {
    const first = recentActiveUsers.values().next().value;
    if (first) recentActiveUsers.delete(first);
  }

  memoryMessageCount++;

  if (memoryMessageCount < nextDestinyThreshold) {
    return;
  }

  // Reiniciar contador
  memoryMessageCount = 0;
  nextDestinyThreshold = Math.floor(
    Math.random() * (ECONOMY_CONFIG.DESTINY_EVENTS.MAX_MESSAGES - ECONOMY_CONFIG.DESTINY_EVENTS.MIN_MESSAGES + 1)
  ) + ECONOMY_CONFIG.DESTINY_EVENTS.MIN_MESSAGES;

  if (Math.random() > ECONOMY_CONFIG.DESTINY_EVENTS.TRIGGER_PROBABILITY) {
    return;
  }

  const activeArray = Array.from(recentActiveUsers);
  if (activeArray.length === 0) return;

  const targetJid = activeArray[Math.floor(Math.random() * activeArray.length)];
  const targetName = formatUserName(targetJid);

  const eventTypeRoll = Math.random();

  try {
    if (eventTypeRoll < 0.45) {
      // 1. Botín en la calle ($60,000 para !reclamar o !agarrar) — 45% de probabilidad
      dropLoot(remoteJid, 60000, 5 * 60 * 1000);
      const dropTexts = [
        `💰 *¡BOTÍN DE $60,000 EN LA CALLE!* 💰\n\nAlguien pasó corriendo y se le cayó un fajo con *$60,000 fichas* en plena vereda.\n¡El primero que escriba *!reclamar* (o !agarrar) se lo lleva todo! 🏃‍♂️💨`,
        `💰 *¡BOTÍN EN LA CALLE!* 💰\n\nUn cobrador de la mafia tiró un sobre con *$60,000 fichas* en la esquina.\n¡Escribí *!reclamar* o *!agarrar* ya antes de que otro vecino se avive! 💸`,
        `💰 *¡GUITA TIRADA EN LA VEREDA!* 💰\n\nUn borracho saliendo del boliche perdió *$60,000 fichas* al tropezar con el cordón.\n¡Tirá *!reclamar* o *!agarrar* para manotearlo antes de que vuele! 🍃`,
      ];
      const text = dropTexts[Math.floor(Math.random() * dropTexts.length)];
      await sock.sendMessage(remoteJid, { text });

    } else if (eventTypeRoll < 0.80) {
      // 2. Urgencia Comunitaria Inteligente (!asistir) — 35% de probabilidad (sumando 80% total)
      const triggered = await triggerSmartEmergency(sock, remoteJid, activeArray);
      if (!triggered) {
        // Fallback si no hay profesión compatible activa: Drop de botín en la calle
        dropLoot(remoteJid, 60000, 5 * 60 * 1000);
        await sock.sendMessage(remoteJid, {
          text: `💰 *¡BOTÍN DE $60,000 EN LA CALLE!* 💰\n\nSe cayó un fajo con *$60,000 fichas* en el cordón.\n¡El primero que escriba *!reclamar* o *!agarrar* se lo queda! 🏃‍♂️💨`,
        });
      }

    } else if (eventTypeRoll < 0.88) {
      // 3. Golpe de suerte (+15,000 a +40,000 fichas) — 8%
      const bonus = Math.floor(Math.random() * 25001) + 15000;
      await modifyBalance(targetJid, bonus);

      const luckTexts = [
        `🍀 *¡GOLPE DE SUERTE!* Un vecino le dijo a ${targetName}: _"Tomá pibe, comprate algo"_: te regaló *$${bonus}* fichas.`,
        `🍀 *¡GOLPE DE SUERTE!* ${targetName} raspó una raspadita tirada y gritó: _"¡Cobro vieja!"_: ganás *$${bonus}* fichas limpias.`,
        `🍀 *¡GOLPE DE SUERTE!* Una tía le transfirió a ${targetName} por error: _"Dejalo mijo, para vos"_: +*$${bonus}* fichas.`,
        `🍀 *¡GOLPE DE SUERTE!* ${targetName} encontró un fajo en un sobre de panadería: te guardás *$${bonus}* fichas sin mirar atrás.`,
      ];
      const text = luckTexts[Math.floor(Math.random() * luckTexts.length)];
      await sock.sendMessage(remoteJid, { text });

    } else if (eventTypeRoll < 0.94 && activeArray.length >= 2) {
      // 4. Solidaridad Forzada entre dos miembros ($15,000 a $30,000 fichas) — 6%
      const otherCandidates = activeArray.filter((j) => j !== targetJid);
      const receiverJid = otherCandidates[Math.floor(Math.random() * otherCandidates.length)];

      const senderName = formatUserName(targetJid);
      const receiverName = formatUserName(receiverJid);
      const giftAmount = Math.floor(Math.random() * 15001) + 15000;

      const transferRes = await transfer(targetJid, receiverJid, giftAmount);

      if (transferRes.success) {
        const text = `🤝 *SOLIDARIDAD:* ${senderName} le dijo a ${receiverName}: _"Te veo muerto de hambre, tomá para el guiso"_: le transfirió *$${giftAmount}* fichas de prepo.`;
        await sock.sendMessage(remoteJid, { text });
      }

    } else {
      // 5. Chorro NPC o Gasto inesperado — 12%
      const isTheft = Math.random() < 0.5;
      const amount = Math.floor(Math.random() * 20001) + 15000;
      const curTarget = await prisma.userProfile.findUnique({ where: { jid: targetJid } });
      const currentBal = curTarget?.balance || 0;
      const actualDeduction = Math.min(amount, Math.max(0, currentBal));
      if (actualDeduction > 0) {
        await modifyBalance(targetJid, -actualDeduction, false);
      }

      if (isTheft) {
        const npcTexts = [
          `🦹 *¡PUNGA EN EL BONDI!* Un chabón empujó a ${targetName}: _"Permiso, permiso..."_ y le voló *$${actualDeduction}* fichas del bolsillo.`,
          `🦹 *¡ASALTO AL PASO!* Dos en moto arrinconaron a ${targetName}: _"¡Dame la billetera ya!"_: perdiste *$${actualDeduction}* fichas.`,
        ];
        const text = npcTexts[Math.floor(Math.random() * npcTexts.length)];
        await sock.sendMessage(remoteJid, { text });
      } else {
        const accidentTexts = [
          `💥 *¡QUÉ MALA LECHE!* El kioskero le gritó a ${targetName}: _"¡Rompiste el frasco, garpá!"_: perdiste *$${actualDeduction}* fichas.`,
          `💥 *¡QUÉ MALA LECHE!* A ${targetName} se le cayó el celular en una alcantarilla: *$${actualDeduction}* fichas en el service.`,
        ];
        const text = accidentTexts[Math.floor(Math.random() * accidentTexts.length)];
        await sock.sendMessage(remoteJid, { text });
      }
    }
  } catch (destinyErr) {
    console.error("[Destiny Events] Error emitiendo evento:", destinyErr);
  }
}

const groupBusinessMessageCount = new Map<string, number>();

/**
 * Liquidación de renta pasiva de negocios cada 50 mensajes en el grupo.
 * Distribuye micro-dividendos a miembros activos dueños de comercios o sedes.
 */
export async function handleBusinessPassiveIncome(
  sock: WASocket,
  remoteJid: string,
  _currentSenderJid: string
): Promise<void> {
  if (!remoteJid.endsWith("@g.us")) return;

  const count = (groupBusinessMessageCount.get(remoteJid) || 0) + 1;
  if (count < 50) {
    groupBusinessMessageCount.set(remoteJid, count);
    return;
  }

  groupBusinessMessageCount.set(remoteJid, 0);

  try {
    const businessItemIds = Object.values(SHOP_ITEMS)
      .filter((it) => it.category === "negocio")
      .map((it) => it.id);

    if (businessItemIds.length === 0) return;

    const groupMeta = await getCachedGroupMetadata(sock, remoteJid).catch(() => null);
    const participants = groupMeta?.participants || [];
    if (participants.length === 0) return;

    const userInventories = await (prisma as any).userInventoryItem.findMany({
      where: {
        itemId: { in: businessItemIds },
        quantity: { gt: 0 },
      },
    });

    const userBusinessMap = new Map<string, number>();

    for (const inv of userInventories) {
      if (!findGroupParticipant(participants, inv.userJid)) continue;
      const it = SHOP_ITEMS[inv.itemId];
      if (it && it.category === "negocio") {
        const payout = it.passiveMessageBonus || it.passiveDailyBonus || 500;
        const currentTotal = userBusinessMap.get(inv.userJid) || 0;
        userBusinessMap.set(inv.userJid, currentTotal + payout * inv.quantity);
      }
    }

    if (userBusinessMap.size === 0) return;

    const lines: string[] = [];

    for (const [jid, total] of userBusinessMap.entries()) {
      await modifyBalance(jid, total);
      const name = formatUserName(jid);
      lines.push(`• ${name} cobró *$${total}* fichas`);
    }

    const text =
      `🏢 *RENTA DE NEGOCIOS* (Cada 50 msgs)\n\n` +
      `${lines.join("\n")}`;

    await sock.sendMessage(remoteJid, { text });
  } catch (err) {
    console.error("[handleBusinessPassiveIncome Error]:", err);
  }
}

/**
 * Compra de escudos deshabilitada (abolida).
 */
export async function buyShield(_userJid: string): Promise<{
  success: boolean;
  error?: string;
  newBalance?: number;
  shieldUntil?: Date;
  durationHours?: number;
}> {
  return {
    success: false,
    error: "🛡️ *Los escudos han sido abolidos* en la ciudad por ley marcial. ¡Ahora nadie se salva de los asaltos!",
  };
}

/**
 * Paga una coima a la cana ($15,000 fichas) para borrar el cooldown de asaltos inmediatamente.
 */
export async function payBribe(userJid: string): Promise<{
  success: boolean;
  error?: string;
  newBalance?: number;
}> {
  const BRIBE_COST = 15000;
  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    if (current.balance < BRIBE_COST) {
      return {
        success: false,
        error: `No te alcanza para la coima. El comisario te pide *$${BRIBE_COST}* fichas bajo la mesa (tu saldo: *$${current.balance}*).`,
      };
    }

    const updated = await (prisma.userProfile as any).update({
      where: { id: user.id },
      data: {
        balance: { decrement: BRIBE_COST },
        lastRobAttempt: null,
      },
    });

    return {
      success: true,
      newBalance: updated.balance,
    };
  });
}

/**
 * Permite a un usuario comprar un título social de honor por $50,000 fichas.
 */
export async function buyCustomTitle(
  userJid: string,
  rawTitle: string
): Promise<{
  success: boolean;
  error?: string;
  newBalance?: number;
  title?: string;
}> {
  const TITLE_PRICE = 50000;
  const cleanTitle = rawTitle.trim().slice(0, 30);

  if (!cleanTitle || cleanTitle.length < 3) {
    return {
      success: false,
      error: "El título debe tener entre 3 y 30 caracteres. Ej: `!titulo Papá de Empy`",
    };
  }

  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    if (current.balance < TITLE_PRICE) {
      return {
        success: false,
        error: `Comprar un título de honor cuesta *$${TITLE_PRICE}* fichas. Tu saldo actual es de *$${current.balance}*. ¡A laburar o jugar fuerte en el casino!`,
      };
    }

    const updated = await (prisma.userProfile as any).update({
      where: { id: user.id },
      data: {
        balance: { decrement: TITLE_PRICE },
        title: cleanTitle,
      },
    });

    return {
      success: true,
      newBalance: updated.balance,
      title: cleanTitle,
    };
  });
}

/**
 * Permite a un usuario elegir o consultar su profesión para !laburar.
 */
export async function setUserProfession(
  userJid: string,
  professionInput?: string | null
): Promise<{
  success: boolean;
  error?: string;
  cleared?: boolean;
  profession?: ProfessionType | null;
  professionMetadata?: ProfessionMetadata | null;
}> {
  const user = await resolveOrRegisterUser(userJid);

  const currentProf = await getUserProfession(user.id);
  const currentMeta = currentProf && PROFESSIONS[currentProf] ? PROFESSIONS[currentProf] : null;

  // Si no pasó argumento o pide consultar
  if (professionInput === undefined) {
    return {
      success: true,
      profession: currentProf,
      professionMetadata: currentMeta,
    };
  }

  // Si ya tiene un oficio asignado, la elección es permanente e inmutable
  if (currentProf && currentMeta) {
    return {
      success: false,
      error: `🔒 *OFICIO DEFINITIVO E INMUTABLE*\n\nYa tenés asignado el oficio de ${currentMeta.icon} *${currentMeta.name.toUpperCase()}*.\nEn la ciudad de Empyreal, tu profesión es para toda la vida y no se puede cambiar ni resetear.`,
      profession: currentProf,
      professionMetadata: currentMeta,
    };
  }

  const clean = (professionInput || "").trim().toLowerCase();

  // La opción de oficio aleatorio ha sido deshabilitada
  if (clean === "aleatorio" || clean === "ninguno" || clean === "libre" || clean === "borrar" || clean === "reset") {
    return {
      success: false,
      error: `❌ La opción de oficio aleatorio o libre ha sido deshabilitada. Debés elegir un oficio oficial definitivo de la lista con \`!profesion <nombre>\`.`,
    };
  }

  // Buscar en el catálogo
  const match = Object.values(PROFESSIONS).find(
    (p) => p.id === clean || p.aliases.includes(clean)
  );

  if (!match) {
    const validList = Object.values(PROFESSIONS)
      .map((p) => `• ${p.icon} *${p.name}:* \`!profesion ${p.id}\``)
      .join("\n");

    return {
      success: false,
      error:
        `Oficio no reconocido. Elegí tu oficio oficial permanente de la lista:\n\n` +
        validList,
    };
  }

  userProfessionCache.set(user.id, match.id);
  await prisma.userProfile.update({
    where: { id: user.id },
    data: { profession: match.id },
  });

  return {
    success: true,
    profession: match.id,
    professionMetadata: match,
  };
}

/**
 * Deja a un usuario sin oficio para que pueda elegir libremente otro con !profesion.
 */
export async function clearUserProfession(userJid: string): Promise<{
  success: boolean;
  error?: string;
  previousProfession?: ProfessionMetadata | null;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const currentProf = (await getUserProfession(user.id)) || (user.profession as ProfessionType | null);
  const currentMeta = currentProf && PROFESSIONS[currentProf] ? PROFESSIONS[currentProf] : null;

  if (!currentProf) {
    return {
      success: false,
      error: "No tiene ningún oficio asignado (actualmente está desempleado).",
    };
  }

  userProfessionCache.delete(user.id);
  userProfessionCache.delete(user.jid);
  userProfessionCache.delete(userJid);

  await withWriteLock(async () => {
    await prisma.userProfile.update({
      where: { id: user.id },
      data: { profession: null },
    });
  });

  userProfessionCache.delete(user.id);
  userProfessionCache.delete(user.jid);
  userProfessionCache.delete(userJid);
  await refreshSingleUserCache(user.jid);

  return {
    success: true,
    previousProfession: currentMeta,
  };
}

/**
 * Afila y repara las herramientas de oficio del usuario al 100% de durabilidad.
 */
export async function repairTool(userJid: string): Promise<{
  success: boolean;
  error?: string;
  toolName?: string;
  cost?: number;
  newBalance?: number;
  durability?: number;
  repairedCount?: number;
}> {
  const REPAIR_COST = 5000;
  const user = await resolveOrRegisterUser(userJid);
  const possibleJids = [user.jid];
  if (user.lid) possibleJids.push(user.lid);
  if (user.phone) possibleJids.push(user.phone);

  const rawProfession = await getUserProfession(user.id);
  if (!rawProfession) {
    return { success: false, error: "No tenés ningún oficio elegido todavía. Elegí uno con `!profesion`." };
  }

  const userInvItems = await prisma.$queryRaw<any[]>`
    SELECT "id", "userJid", "itemId", "quantity", COALESCE("durability", 100) AS "durability"
    FROM "UserInventoryItem"
    WHERE "userJid" = ANY(${possibleJids}) AND "quantity" > 0;
  `;

  const profTools = userInvItems.filter((inv: any) => {
    const it = SHOP_ITEMS[inv.itemId];
    return it && it.category === "herramienta" && it.profession === rawProfession;
  });

  if (profTools.length === 0) {
    return {
      success: false,
      error: `No tenés ninguna herramienta de tu oficio (${rawProfession}) en el inventario. Comprate una en la \`!tienda\`.`,
    };
  }

  const wornTools = profTools.filter((inv: any) => {
    const dur = typeof inv.durability === "number" ? inv.durability : 100;
    return dur < 100;
  });

  if (wornTools.length === 0) {
    return {
      success: false,
      error: `Todas tus herramientas de tu oficio están al 100% de filo y durabilidad. ¡No hace falta afilar nada!`,
    };
  }

  return await withWriteLock(async () => {
    const cur = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    if (cur.balance < REPAIR_COST) {
      return {
        success: false,
        error: `No te alcanza para el service de tus herramientas. Cuesta *$${REPAIR_COST}* fichas (tu saldo: *$${cur.balance}*).`,
      };
    }

    const updatedUser = await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: { decrement: REPAIR_COST } },
    });

    const wornIds = wornTools.map((inv: any) => inv.id);
    if (wornIds.length > 0) {
      await prisma.$executeRaw`
        UPDATE "UserInventoryItem"
        SET "durability" = 100
        WHERE "id" = ANY(${wornIds});
      `.catch((e) => console.error("[Sharpen Tools Error]:", e));
    }

    const toolNames = wornTools.map((inv: any) => SHOP_ITEMS[inv.itemId]?.name || inv.itemId).join(", ");

    return {
      success: true,
      toolName: toolNames,
      cost: REPAIR_COST,
      durability: 100,
      repairedCount: wornIds.length,
      newBalance: updatedUser.balance,
    };
  });
}


