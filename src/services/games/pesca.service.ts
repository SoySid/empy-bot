import { prisma, withWriteLock } from "../db/prisma.js";
import { resolveOrRegisterUser } from "../db/user.service.js";
import {
  FISH_CATALOG,
  FISHING_SHOP,
  FishDefinition,
  FishingShopItem,
} from "../../config/fish.config.js";

export interface UserFishingState {
  charges: number;
  lastRegen: number;
  lastCast: number;
  collection: string[];
  maxWeightRecord: { fishId: string; weightKg: number; date: string } | null;
  activeBuffs: {
    tier2Uses?: number;
    tier3Uses?: number;
    antiBlooperUses?: number;
  };
  ownedItems: string[];
}

const fishingStateMemory = new Map<string, UserFishingState>();

const FACT_KEY = "fishing_state_v1";
const BASE_MAX_CHARGES = 5;
const FIBRA_MAX_CHARGES = 8;
const BASE_REGEN_MS = 3 * 60 * 1000; // 3 minutos
const FIBRA_REGEN_MS = 2.4 * 60 * 1000; // 2.4 minutos
const MIN_CAST_DELAY_MS = 20 * 1000; // 20 segundos

export async function getUserFishingState(userJid: string): Promise<UserFishingState> {
  if (fishingStateMemory.has(userJid)) {
    const mem = fishingStateMemory.get(userJid)!;
    applyStaminaRegeneration(mem);
    return mem;
  }

  try {
    const fact = await prisma.userFact.findUnique({
      where: { userJid_clave: { userJid, clave: FACT_KEY } },
    });

    if (fact?.valor) {
      const parsed: UserFishingState = JSON.parse(fact.valor);
      applyStaminaRegeneration(parsed);
      fishingStateMemory.set(userJid, parsed);
      return parsed;
    }
  } catch (err) {
    console.error("[FishingState DB Error]:", err);
  }

  const defaultState: UserFishingState = {
    charges: BASE_MAX_CHARGES,
    lastRegen: Date.now(),
    lastCast: 0,
    collection: [],
    maxWeightRecord: null,
    activeBuffs: {},
    ownedItems: [],
  };

  fishingStateMemory.set(userJid, defaultState);
  return defaultState;
}

function applyStaminaRegeneration(state: UserFishingState): void {
  const hasFibra = state.ownedItems.includes("cana_fibra");
  const maxCharges = hasFibra ? FIBRA_MAX_CHARGES : BASE_MAX_CHARGES;
  const regenTime = hasFibra ? FIBRA_REGEN_MS : BASE_REGEN_MS;

  if (state.charges >= maxCharges) {
    state.lastRegen = Date.now();
    return;
  }

  const now = Date.now();
  const elapsed = now - state.lastRegen;
  if (elapsed >= regenTime) {
    const regenerated = Math.floor(elapsed / regenTime);
    state.charges = Math.min(maxCharges, state.charges + regenerated);
    state.lastRegen = now - (elapsed % regenTime);
  }
}

export async function saveUserFishingState(userJid: string, state: UserFishingState): Promise<void> {
  fishingStateMemory.set(userJid, state);
  try {
    await prisma.userFact.upsert({
      where: { userJid_clave: { userJid, clave: FACT_KEY } },
      create: {
        userJid,
        clave: FACT_KEY,
        valor: JSON.stringify(state),
        tipo: "PERMANENTE",
      },
      update: {
        valor: JSON.stringify(state),
      },
    });
  } catch (err) {
    console.error("[FishingState Save Error]:", err);
  }
}

export interface FishResult {
  success: boolean;
  error?: string;
  cooldownRemainingSec?: number;
  chargesRemaining?: number;
  maxCharges?: number;
  fish?: FishDefinition;
  weightKg?: number;
  price?: number;
  priceBonus?: number;
  conservadoraBonus?: number;
  newBalance?: number;
  isNewSpecies?: boolean;
  isNewRecord?: boolean;
  totalCaught?: number;
  totalSpeciesDiscovered?: number;
  equippedRodName?: string;
  blooper?: {
    type: "mosquitos" | "bota" | "camalotes";
    message: string;
    savedByRepelente?: boolean;
    junkPrice?: number;
  };
}

export async function castFishingLine(userJid: string): Promise<FishResult> {
  const now = Date.now();
  const state = await getUserFishingState(userJid);

  // 1. Validar delay de 20s anti-spam
  const elapsedSinceCast = now - state.lastCast;
  if (elapsedSinceCast < MIN_CAST_DELAY_MS) {
    const remaining = Math.ceil((MIN_CAST_DELAY_MS - elapsedSinceCast) / 1000);
    return {
      success: false,
      error: `🌊 *Calma pescador:* Acabás de tirar la línea. Esperá *${remaining}s* para no espantar el pique en el río.`,
      cooldownRemainingSec: remaining,
    };
  }

  // 2. Validar carnadas/cargas
  const hasFibra = state.ownedItems.includes("cana_fibra");
  const maxCharges = hasFibra ? FIBRA_MAX_CHARGES : BASE_MAX_CHARGES;

  if (state.charges <= 0) {
    return {
      success: false,
      error:
        `🪱 *¡Te quedaste sin carnada!*\n` +
        `Tu caja de pesca está vacía (*0/${maxCharges}* carnadas).\n\n` +
        `• Se recarga *1 carnada* cada ${hasFibra ? "2.4" : "3"} minutos de forma pasiva.\n` +
        `• O comprá un pote en la tienda con \`!tiendapesca pote_lombrices\`.`,
      chargesRemaining: 0,
      maxCharges,
    };
  }

  // Consumir 1 carnada y registrar tiempo
  state.charges -= 1;
  state.lastCast = now;

  const equippedRodName = state.ownedItems.includes("cana_grafito")
    ? "Caña de Grafito & Riel Rotativo 🏆"
    : state.ownedItems.includes("cana_fibra")
    ? "Caña de Fibra de Vidrio 🎣"
    : "Mojarrera de Tacuara";

  // 3. Sistema de Bloopers / Piques Fallidos (~8% de probabilidad)
  let savedByRepelente = false;
  const rollBlooper = Math.random();
  if (rollBlooper < 0.08) {
    const blooperTypeRoll = Math.random();
    if (blooperTypeRoll < 0.50) {
      // Mosquitos
      if (state.activeBuffs.antiBlooperUses && state.activeBuffs.antiBlooperUses > 0) {
        state.activeBuffs.antiBlooperUses -= 1;
        savedByRepelente = true;
      } else {
        await saveUserFishingState(userJid, state);
        return {
          success: true,
          blooper: {
            type: "mosquitos",
            message: "🦟 *¡Ataque de mosquitos!* Un enjambre te picó los brazos justo al clavar y se te escapó el pique. Perdiste la carnada.",
            junkPrice: 0,
          },
          chargesRemaining: state.charges,
          maxCharges,
          totalSpeciesDiscovered: state.collection.length,
          equippedRodName,
        };
      }
    } else if (blooperTypeRoll < 0.75) {
      // Bota vieja o chatarra
      let newBalance = 0;
      await withWriteLock(async () => {
        await resolveOrRegisterUser(userJid);
        const updated = await prisma.userProfile.update({
          where: { jid: userJid },
          data: { balance: { increment: 100 } },
          select: { balance: true },
        });
        newBalance = updated.balance;
      });

      await saveUserFishingState(userJid, state);
      return {
        success: true,
        blooper: {
          type: "bota",
          message: "🥾 *¡Enganche en el fondo!* Sacaste una bota vieja llena de barro. Un chatarrero de la costa te da *$100* fichas de consuelo.",
          junkPrice: 100,
        },
        newBalance,
        chargesRemaining: state.charges,
        maxCharges,
        totalSpeciesDiscovered: state.collection.length,
        equippedRodName,
      };
    } else {
      // Camalotes
      await saveUserFishingState(userJid, state);
      return {
        success: true,
        blooper: {
          type: "camalotes",
          message: "🌿 *¡Enganche en los camalotes!* La línea se enredó en la vegetación flotante y tuviste que cortar. Perdiste la carnada.",
          junkPrice: 0,
        },
        chargesRemaining: state.charges,
        maxCharges,
        totalSpeciesDiscovered: state.collection.length,
        equippedRodName,
      };
    }
  }

  // 4. Probabilidades por Tier (Míticos triplicados a 3%)
  let t1Prob = 43;
  let t2Prob = 30;
  let t3Prob = 18;
  let t4Prob = 6;
  let t5Prob = 3;

  if (state.activeBuffs.tier2Uses && state.activeBuffs.tier2Uses > 0) {
    t2Prob += 15;
    t1Prob -= 15;
    state.activeBuffs.tier2Uses -= 1;
  }
  if (state.activeBuffs.tier3Uses && state.activeBuffs.tier3Uses > 0) {
    t3Prob += 10;
    t1Prob -= 10;
    state.activeBuffs.tier3Uses -= 1;
  }
  if (state.ownedItems.includes("permiso_pesca")) {
    t4Prob += 2.5;
    t1Prob -= 2.5;
  }

  t1Prob = Math.max(5, t1Prob);

  const roll = Math.random() * 100;
  let chosenTier: 1 | 2 | 3 | 4 | 5 = 1;

  if (roll < t5Prob) {
    chosenTier = 5;
  } else if (roll < t5Prob + t4Prob) {
    chosenTier = 4;
  } else if (roll < t5Prob + t4Prob + t3Prob) {
    chosenTier = 3;
  } else if (roll < t5Prob + t4Prob + t3Prob + t2Prob) {
    chosenTier = 2;
  } else {
    chosenTier = 1;
  }

  const fishesInTier = Object.values(FISH_CATALOG).filter((f) => f.tier === chosenTier);
  const fish = fishesInTier[Math.floor(Math.random() * fishesInTier.length)];

  // 5. Calcular Peso con bonificación de Caña de Grafito
  const rawWeight = fish.minWeightKg + Math.random() * (fish.maxWeightKg - fish.minWeightKg);
  const weightMultiplier = state.ownedItems.includes("cana_grafito") ? 1.15 : 1.0;
  const finalWeight = parseFloat((rawWeight * weightMultiplier).toFixed(2));

  // 6. Calcular Precio y Bonos (Peso proporcional hasta 20% + Conservadora +10%)
  const weightRatio = Math.max(0, Math.min(1.5, (finalWeight - fish.minWeightKg) / (fish.maxWeightKg - fish.minWeightKg || 1)));
  const priceBonus = Math.round(weightRatio * (fish.basePrice * 0.20));
  let finalPrice = fish.basePrice + priceBonus;

  let conservadoraBonus = 0;
  if (state.ownedItems.includes("conservadora")) {
    conservadoraBonus = Math.round(finalPrice * 0.10);
    finalPrice += conservadoraBonus;
  }

  // 7. Actualizar balance en DB con resolución segura del usuario
  let newBalance = 0;
  await withWriteLock(async () => {
    await resolveOrRegisterUser(userJid);
    const updated = await prisma.userProfile.update({
      where: { jid: userJid },
      data: {
        balance: { increment: finalPrice },
      },
      select: { balance: true },
    });
    newBalance = updated.balance;
  });

  // 8. Álbum y Récords
  const isNewSpecies = !state.collection.includes(fish.id);
  if (isNewSpecies) {
    state.collection.push(fish.id);
  }

  let isNewRecord = false;
  if (!state.maxWeightRecord || finalWeight > state.maxWeightRecord.weightKg) {
    isNewRecord = true;
    state.maxWeightRecord = {
      fishId: fish.id,
      weightKg: finalWeight,
      date: new Date().toISOString(),
    };
  }

  await saveUserFishingState(userJid, state);

  return {
    success: true,
    fish,
    weightKg: finalWeight,
    price: finalPrice,
    priceBonus,
    conservadoraBonus,
    newBalance,
    isNewSpecies,
    isNewRecord,
    chargesRemaining: state.charges,
    maxCharges,
    totalSpeciesDiscovered: state.collection.length,
    equippedRodName,
    blooper: savedByRepelente
      ? {
          type: "mosquitos",
          message: "🧴 *¡Tu Repelente Off! te salvó!* Ahuyentaste a los mosquitos a tiempo y aseguraste el pique.",
          savedByRepelente: true,
        }
      : undefined,
  };
}

export async function buyFishingShopItem(
  userJid: string,
  itemId: string
): Promise<{ success: boolean; error?: string; item?: FishingShopItem; newBalance?: number }> {
  const cleanId = itemId.toLowerCase().trim();
  const shopItem = FISHING_SHOP[cleanId];

  if (!shopItem) {
    return {
      success: false,
      error: `❌ No se encontró el artículo \`${itemId}\` en la tienda de pesca. Escribí \`!tiendapesca\` para ver el catálogo.`,
    };
  }

  const state = await getUserFishingState(userJid);

  // Cañas y accesorios permanentes solo se compran una vez
  if (shopItem.category === "cana" || shopItem.id === "conservadora" || shopItem.id === "permiso_pesca") {
    if (state.ownedItems.includes(shopItem.id)) {
      return {
        success: false,
        error: `⚠️ Ya contás con *${shopItem.name}* en tu equipo de pesca. ¡No hace falta comprarlo dos veces!`,
      };
    }
  }

  // No permitir comprar carnada si la caja ya está llena
  if (shopItem.id === "pote_lombrices") {
    const hasFibra = state.ownedItems.includes("cana_fibra");
    const maxCharges = hasFibra ? FIBRA_MAX_CHARGES : BASE_MAX_CHARGES;
    if (state.charges >= maxCharges) {
      return {
        success: false,
        error: `⚠️ Tu caja de pesca ya está llena (*${state.charges}/${maxCharges}* carnadas). ¡Usalas en el río antes de comprar más!`,
      };
    }
  }

  let newBalance = 0;
  let purchaseSuccess = false;

  await withWriteLock(async () => {
    const user = await resolveOrRegisterUser(userJid);
    if (user.balance < shopItem.price) {
      throw new Error(`Saldo insuficiente: necesitás $${shopItem.price} fichas (tenés $${user.balance}).`);
    }

    const updated = await prisma.userProfile.update({
      where: { jid: userJid },
      data: {
        balance: { decrement: shopItem.price },
      },
      select: { balance: true },
    });
    newBalance = updated.balance;
    purchaseSuccess = true;
  }).catch((err) => {
    purchaseSuccess = false;
  });

  if (!purchaseSuccess) {
    return {
      success: false,
      error: `❌ *Saldo insuficiente:* Este equipo cuesta *$${shopItem.price.toLocaleString("es-AR")}* fichas.`,
    };
  }

  // Aplicar efecto en el estado
  if (shopItem.id === "pote_lombrices") {
    const hasFibra = state.ownedItems.includes("cana_fibra");
    const maxCharges = hasFibra ? FIBRA_MAX_CHARGES : BASE_MAX_CHARGES;
    state.charges = maxCharges;
  } else if (shopItem.id === "masa_vainilla") {
    state.activeBuffs.tier2Uses = (state.activeBuffs.tier2Uses || 0) + (shopItem.buffDurationUses || 3);
  } else if (shopItem.id === "mojarra_viva") {
    state.activeBuffs.tier3Uses = (state.activeBuffs.tier3Uses || 0) + (shopItem.buffDurationUses || 2);
  } else if (shopItem.id === "repelente_pesca") {
    state.activeBuffs.antiBlooperUses = (state.activeBuffs.antiBlooperUses || 0) + (shopItem.buffDurationUses || 10);
  } else {
    state.ownedItems.push(shopItem.id);
  }

  await saveUserFishingState(userJid, state);

  return {
    success: true,
    item: shopItem,
    newBalance,
  };
}
