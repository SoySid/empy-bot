import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "./db/prisma.js";

export const SEASON_BACKUP_S1_KEY = "season:backup:S1";
export const SEASON_CURRENT_KEY = "season:current";
export const FISHING_FACT_KEY = "fishing_state_v1";
export const S1_PESCA_MEDAL = "S1_PESCA";
export const S1_PESCA_SPECIES_TARGET = 30;
export const DEFAULT_BACKUP_FILE = path.resolve(process.cwd(), "backups", "season-s1-backup.json");

export const ProfileBackupSchema = z
  .object({
    id: z.string(),
    jid: z.string(),
    lid: z.string().nullable(),
    phone: z.string(),
    pushName: z.string().nullable(),
    realName: z.string().nullable(),
    primaryName: z.string(),
    role: z.string(),
    sensitiveTopics: z.string(),
    balance: z.number().int(),
    lastDaily: z.string().datetime(),
    lastRobAttempt: z.string().datetime().nullable(),
    robShieldUntil: z.string().datetime().nullable(),
    lastJob: z.string().datetime().nullable(),
    hunger: z.number().int(),
    hungerWarningSent: z.boolean(),
    jobBuffTurns: z.number().int(),
    title: z.string().nullable(),
    profession: z.string().nullable(),
    jobsCompleted: z.number().int(),
    robberiesWon: z.number().int(),
    foodEaten: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const InventoryItemBackupSchema = z
  .object({
    id: z.string(),
    userJid: z.string(),
    itemId: z.string(),
    quantity: z.number().int(),
    durability: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const FishingFactBackupSchema = z
  .object({
    id: z.string(),
    userJid: z.string(),
    tipo: z.string(),
    clave: z.literal(FISHING_FACT_KEY),
    valor: z.string(),
    confidence: z.number(),
    weight: z.number().int(),
    lastConfirmedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const SeasonS1BackupSchema = z
  .object({
    createdAt: z.string().datetime(),
    profiles: z.array(ProfileBackupSchema),
    inventoryItems: z.array(InventoryItemBackupSchema),
    fishingFacts: z.array(FishingFactBackupSchema),
  })
  .strict();

export type SeasonS1Backup = z.infer<typeof SeasonS1BackupSchema>;

const SeasonCurrentStateSchema = z.object({
  season: z.enum(["S1", "S2"]),
  migratedAt: z.string().datetime().optional(),
  restoredAt: z.string().datetime().optional(),
});

const ParsedFishingValueSchema = z
  .object({
    collection: z.array(z.string()).optional(),
    medals: z.array(z.string()).optional(),
    season: z.string().optional(),
    s1Completed: z.boolean().optional(),
    s1SpeciesCount: z.number().int().optional(),
  })
  .passthrough();

export interface BackupS1Result {
  created: boolean;
  alreadyExisted: boolean;
  createdAt: string;
  profilesCount: number;
  inventoryItemsCount: number;
  fishingFactsCount: number;
  backupFilePath: string;
}

export interface FishingMedalRecipient {
  userJid: string;
  s1SpeciesCount: number;
  s1Completed: boolean;
}

export interface MigrateS2Result {
  alreadyMigrated: boolean;
  season: "S2";
  migratedAt: string;
  backup: BackupS1Result;
  profilesResetCount: number;
  inventoryDeletedCount: number;
  fishingFactsResetCount: number;
  s1MedalsAwardedCount: number;
  medalRecipients: FishingMedalRecipient[];
}

export interface RestoreS1Result {
  season: "S1";
  restoredAt: string;
  source: "database" | "file";
  profilesRestoredCount: number;
  inventoryItemsRestoredCount: number;
  fishingFactsRestoredCount: number;
}

export interface SeasonVerificationReport {
  currentSeason: string | null;
  hasS1BackupInDb: boolean;
  profilesCount: number;
  profilesNonDefaultBalanceCount: number;
  profilesWithProfessionCount: number;
  profilesWithTitleCount: number;
  inventoryItemsCount: number;
  fishingFactsCount: number;
  fishingS1MedalCount: number;
  fishingMedalRecipients: FishingMedalRecipient[];
  preservedFacts: {
    pokedexCount: number;
    superheroesCount: number;
    mlbbCount: number;
    otherFactsCount: number;
    totalFactsCount: number;
  };
}

/**
 * Lee el estado actual de temporada guardado en `BaileysSession`.
 */
export async function getCurrentSeasonState(): Promise<{ season: string; migratedAt?: string; restoredAt?: string } | null> {
  const row = await prisma.baileysSession.findUnique({
    where: { key: SEASON_CURRENT_KEY },
  });
  if (!row?.value) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(row.value);
    const validated = SeasonCurrentStateSchema.safeParse(parsedJson);
    if (validated.success) {
      return validated.data;
    }
  } catch {
    // Fallback por si alguien escribió un string literal simple
  }

  const trimmed = row.value.trim();
  if (trimmed === "S1" || trimmed === "S2") {
    return { season: trimmed };
  }
  return null;
}

async function writeBackupFile(backup: SeasonS1Backup, filePath = DEFAULT_BACKUP_FILE): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), "utf8");
}

function summarizeBackup(
  backup: SeasonS1Backup,
  flags: { created: boolean; alreadyExisted: boolean },
  backupFilePath = DEFAULT_BACKUP_FILE
): BackupS1Result {
  return {
    created: flags.created,
    alreadyExisted: flags.alreadyExisted,
    createdAt: backup.createdAt,
    profilesCount: backup.profiles.length,
    inventoryItemsCount: backup.inventoryItems.length,
    fishingFactsCount: backup.fishingFacts.length,
    backupFilePath,
  };
}

/**
 * Construye, valida con Zod y persiste el snapshot completo de la Temporada S1
 * tanto en `BaileysSession` (`season:backup:S1`) como en `backups/season-s1-backup.json`.
 * Si ya existe en DB y `force` es false, retorna el resumen existente sin sobrescribirlo.
 */
export async function backupSeasonS1(force = false): Promise<BackupS1Result> {
  if (!force) {
    const existing = await prisma.baileysSession.findUnique({
      where: { key: SEASON_BACKUP_S1_KEY },
    });

    if (existing?.value) {
      const parsed = SeasonS1BackupSchema.parse(JSON.parse(existing.value));
      try {
        await fs.access(DEFAULT_BACKUP_FILE);
      } catch {
        await writeBackupFile(parsed);
      }
      return summarizeBackup(parsed, { created: false, alreadyExisted: true });
    }
  }

  const [profiles, inventoryItems, fishingFacts] = await Promise.all([
    prisma.userProfile.findMany({ orderBy: { jid: "asc" } }),
    prisma.userInventoryItem.findMany({ orderBy: [{ userJid: "asc" }, { itemId: "asc" }] }),
    prisma.userFact.findMany({
      where: { clave: FISHING_FACT_KEY },
      orderBy: { userJid: "asc" },
    }),
  ]);

  const rawBackup: SeasonS1Backup = {
    createdAt: new Date().toISOString(),
    profiles: profiles.map((p) => ({
      id: p.id,
      jid: p.jid,
      lid: p.lid,
      phone: p.phone,
      pushName: p.pushName,
      realName: p.realName,
      primaryName: p.primaryName,
      role: p.role,
      sensitiveTopics: p.sensitiveTopics,
      balance: p.balance,
      lastDaily: p.lastDaily.toISOString(),
      lastRobAttempt: p.lastRobAttempt ? p.lastRobAttempt.toISOString() : null,
      robShieldUntil: p.robShieldUntil ? p.robShieldUntil.toISOString() : null,
      lastJob: p.lastJob ? p.lastJob.toISOString() : null,
      hunger: p.hunger,
      hungerWarningSent: p.hungerWarningSent,
      jobBuffTurns: p.jobBuffTurns,
      title: p.title,
      profession: p.profession,
      jobsCompleted: p.jobsCompleted,
      robberiesWon: p.robberiesWon,
      foodEaten: p.foodEaten,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    inventoryItems: inventoryItems.map((item) => ({
      id: item.id,
      userJid: item.userJid,
      itemId: item.itemId,
      quantity: item.quantity,
      durability: item.durability,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    fishingFacts: fishingFacts.map((fact) => ({
      id: fact.id,
      userJid: fact.userJid,
      tipo: fact.tipo,
      clave: FISHING_FACT_KEY,
      valor: fact.valor,
      confidence: fact.confidence,
      weight: fact.weight,
      lastConfirmedAt: fact.lastConfirmedAt.toISOString(),
      expiresAt: fact.expiresAt ? fact.expiresAt.toISOString() : null,
      createdAt: fact.createdAt.toISOString(),
      updatedAt: fact.updatedAt.toISOString(),
    })),
  };

  const validated = SeasonS1BackupSchema.parse(rawBackup);
  const serialized = JSON.stringify(validated);

  await prisma.baileysSession.upsert({
    where: { key: SEASON_BACKUP_S1_KEY },
    create: { key: SEASON_BACKUP_S1_KEY, value: serialized },
    update: { value: serialized },
  });

  await writeBackupFile(validated);

  return summarizeBackup(validated, { created: true, alreadyExisted: false });
}

function buildSeasonS2FishingPayload(rawValor: string, nowMs: number): {
  nextValor: string;
  s1SpeciesCount: number;
  s1Completed: boolean;
} {
  let collection: string[] = [];
  try {
    const parsedJson = JSON.parse(rawValor);
    const parsed = ParsedFishingValueSchema.safeParse(parsedJson);
    if (parsed.success && Array.isArray(parsed.data.collection)) {
      collection = parsed.data.collection;
    }
  } catch {
    collection = [];
  }

  const s1SpeciesCount = new Set(collection).size;
  const s1Completed = s1SpeciesCount >= S1_PESCA_SPECIES_TARGET;
  const medals = s1Completed ? [S1_PESCA_MEDAL] : [];

  const nextState = {
    charges: 5,
    lastRegen: nowMs,
    lastCast: 0,
    collection: [] as string[],
    maxWeightRecord: null,
    activeBuffs: {},
    ownedItems: [] as string[],
    medals,
    season: "S2",
    s1Completed,
    s1SpeciesCount,
  };

  return {
    nextValor: JSON.stringify(nextState),
    s1SpeciesCount,
    s1Completed,
  };
}

/**
 * Ejecuta el reinicio atómico e idempotente de Temporada S1 a Temporada S2.
 * Garantiza respaldo S1 previo y nunca modifica `pokedex_*`, `superheroes_*` ni `mlbb_heroes_v1`.
 */
export async function migrateToSeasonS2(): Promise<MigrateS2Result> {
  const existingSeason = await getCurrentSeasonState();
  if (existingSeason?.season === "S2") {
    const backupSummary = await backupSeasonS1(false);
    return {
      alreadyMigrated: true,
      season: "S2",
      migratedAt: existingSeason.migratedAt ?? new Date().toISOString(),
      backup: backupSummary,
      profilesResetCount: 0,
      inventoryDeletedCount: 0,
      fishingFactsResetCount: 0,
      s1MedalsAwardedCount: 0,
      medalRecipients: [],
    };
  }

  const backupSummary = await backupSeasonS1(false);

  const txResult = await prisma.$transaction(
    async (tx) => {
      const currentInTx = await tx.baileysSession.findUnique({
        where: { key: SEASON_CURRENT_KEY },
      });
      if (currentInTx?.value) {
        try {
          const parsed = SeasonCurrentStateSchema.safeParse(JSON.parse(currentInTx.value));
          if (parsed.success && parsed.data.season === "S2") {
            return {
              alreadyMigrated: true as const,
              migratedAt: parsed.data.migratedAt ?? new Date().toISOString(),
              profilesResetCount: 0,
              inventoryDeletedCount: 0,
              fishingFactsResetCount: 0,
              medalRecipients: [] as FishingMedalRecipient[],
            };
          }
        } catch {
          // Continuar si el valor no es JSON S2 válido
        }
      }

      const now = new Date();
      const nowMs = now.getTime();

      // a) Resetear todos los UserProfile a valores iniciales de S2
      const profilesReset = await tx.userProfile.updateMany({
        data: {
          balance: 500,
          profession: null,
          title: null,
          hunger: 85,
          hungerWarningSent: false,
          jobBuffTurns: 0,
          lastDaily: now,
          lastJob: null,
          lastRobAttempt: null,
          robShieldUntil: null,
          jobsCompleted: 0,
          robberiesWon: 0,
          foodEaten: 0,
        },
      });

      // b) Eliminar todo el inventario (negocios, herramientas, lujo, comidas, !uni)
      const inventoryDeleted = await tx.userInventoryItem.deleteMany({});

      // c) Procesar exclusivamente fishing_state_v1 y otorgar medalla S1_PESCA si >= 30 especies
      const fishingFacts = await tx.userFact.findMany({
        where: { clave: FISHING_FACT_KEY },
        orderBy: { userJid: "asc" },
      });

      const medalRecipients: FishingMedalRecipient[] = [];
      for (const fact of fishingFacts) {
        const { nextValor, s1SpeciesCount, s1Completed } = buildSeasonS2FishingPayload(fact.valor, nowMs);
        await tx.userFact.update({
          where: { id: fact.id },
          data: { valor: nextValor },
        });
        if (s1Completed) {
          medalRecipients.push({
            userJid: fact.userJid,
            s1SpeciesCount,
            s1Completed,
          });
        }
      }

      // d) Registrar estado actual de temporada = "S2"
      const migratedAt = now.toISOString();
      await tx.baileysSession.upsert({
        where: { key: SEASON_CURRENT_KEY },
        create: {
          key: SEASON_CURRENT_KEY,
          value: JSON.stringify({ season: "S2", migratedAt }),
        },
        update: {
          value: JSON.stringify({ season: "S2", migratedAt }),
        },
      });

      return {
        alreadyMigrated: false as const,
        migratedAt,
        profilesResetCount: profilesReset.count,
        inventoryDeletedCount: inventoryDeleted.count,
        fishingFactsResetCount: fishingFacts.length,
        medalRecipients,
      };
    },
    { timeout: 60000 }
  );

  return {
    alreadyMigrated: txResult.alreadyMigrated,
    season: "S2",
    migratedAt: txResult.migratedAt,
    backup: backupSummary,
    profilesResetCount: txResult.profilesResetCount,
    inventoryDeletedCount: txResult.inventoryDeletedCount,
    fishingFactsResetCount: txResult.fishingFactsResetCount,
    s1MedalsAwardedCount: txResult.medalRecipients.length,
    medalRecipients: txResult.medalRecipients,
  };
}

async function loadValidatedS1Backup(): Promise<{ backup: SeasonS1Backup; source: "database" | "file" }> {
  const dbRow = await prisma.baileysSession.findUnique({
    where: { key: SEASON_BACKUP_S1_KEY },
  });

  if (dbRow?.value) {
    return {
      backup: SeasonS1BackupSchema.parse(JSON.parse(dbRow.value)),
      source: "database",
    };
  }

  const fileRaw = await fs.readFile(DEFAULT_BACKUP_FILE, "utf8");
  return {
    backup: SeasonS1BackupSchema.parse(JSON.parse(fileRaw)),
    source: "file",
  };
}

/**
 * Restaura de forma atómica perfiles, inventario y estado de pesca de Temporada S1
 * a partir del snapshot validado con Zod y vuelve `season:current` a `"S1"`.
 */
export async function restoreSeasonS1(): Promise<RestoreS1Result> {
  const { backup, source } = await loadValidatedS1Backup();
  const restoredAt = new Date().toISOString();

  await prisma.$transaction(
    async (tx) => {
      for (const p of backup.profiles) {
        const commonFields = {
          lid: p.lid,
          phone: p.phone,
          pushName: p.pushName,
          realName: p.realName,
          primaryName: p.primaryName,
          role: p.role,
          sensitiveTopics: p.sensitiveTopics,
          balance: p.balance,
          lastDaily: new Date(p.lastDaily),
          lastRobAttempt: p.lastRobAttempt ? new Date(p.lastRobAttempt) : null,
          robShieldUntil: p.robShieldUntil ? new Date(p.robShieldUntil) : null,
          lastJob: p.lastJob ? new Date(p.lastJob) : null,
          hunger: p.hunger,
          hungerWarningSent: p.hungerWarningSent,
          jobBuffTurns: p.jobBuffTurns,
          title: p.title,
          profession: p.profession,
          jobsCompleted: p.jobsCompleted,
          robberiesWon: p.robberiesWon,
          foodEaten: p.foodEaten,
        };

        await tx.userProfile.upsert({
          where: { jid: p.jid },
          update: commonFields,
          create: {
            id: p.id,
            jid: p.jid,
            ...commonFields,
            createdAt: new Date(p.createdAt),
          },
        });
      }

      await tx.userInventoryItem.deleteMany({});
      if (backup.inventoryItems.length > 0) {
        await tx.userInventoryItem.createMany({
          data: backup.inventoryItems.map((item) => ({
            id: item.id,
            userJid: item.userJid,
            itemId: item.itemId,
            quantity: item.quantity,
            durability: item.durability,
            createdAt: new Date(item.createdAt),
          })),
        });
      }

      await tx.userFact.deleteMany({
        where: { clave: FISHING_FACT_KEY },
      });
      if (backup.fishingFacts.length > 0) {
        await tx.userFact.createMany({
          data: backup.fishingFacts.map((fact) => ({
            id: fact.id,
            userJid: fact.userJid,
            tipo: fact.tipo,
            clave: fact.clave,
            valor: fact.valor,
            confidence: fact.confidence,
            weight: fact.weight,
            lastConfirmedAt: new Date(fact.lastConfirmedAt),
            expiresAt: fact.expiresAt ? new Date(fact.expiresAt) : null,
            createdAt: new Date(fact.createdAt),
          })),
        });
      }

      await tx.baileysSession.upsert({
        where: { key: SEASON_CURRENT_KEY },
        create: {
          key: SEASON_CURRENT_KEY,
          value: JSON.stringify({ season: "S1", restoredAt }),
        },
        update: {
          value: JSON.stringify({ season: "S1", restoredAt }),
        },
      });
    },
    { timeout: 60000 }
  );

  return {
    season: "S1",
    restoredAt,
    source,
    profilesRestoredCount: backup.profiles.length,
    inventoryItemsRestoredCount: backup.inventoryItems.length,
    fishingFactsRestoredCount: backup.fishingFacts.length,
  };
}

/**
 * Consulta los conteos actuales en PostgreSQL para auditoría post-migración o post-restauración.
 */
export async function verifySeasonDatabaseState(): Promise<SeasonVerificationReport> {
  const [
    currentSeasonState,
    backupRow,
    profilesCount,
    profilesNonDefaultBalanceCount,
    profilesWithProfessionCount,
    profilesWithTitleCount,
    inventoryItemsCount,
    fishingFacts,
    pokedexCount,
    superheroesCount,
    mlbbCount,
    totalFactsCount,
  ] = await Promise.all([
    getCurrentSeasonState(),
    prisma.baileysSession.findUnique({ where: { key: SEASON_BACKUP_S1_KEY }, select: { key: true } }),
    prisma.userProfile.count(),
    prisma.userProfile.count({ where: { balance: { not: 500 } } }),
    prisma.userProfile.count({ where: { profession: { not: null } } }),
    prisma.userProfile.count({ where: { title: { not: null } } }),
    prisma.userInventoryItem.count(),
    prisma.userFact.findMany({ where: { clave: FISHING_FACT_KEY }, orderBy: { userJid: "asc" } }),
    prisma.userFact.count({ where: { clave: { startsWith: "pokedex_" } } }),
    prisma.userFact.count({ where: { clave: { startsWith: "superheroes_" } } }),
    prisma.userFact.count({ where: { clave: "mlbb_heroes_v1" } }),
    prisma.userFact.count(),
  ]);

  const fishingMedalRecipients: FishingMedalRecipient[] = [];
  for (const fact of fishingFacts) {
    try {
      const parsed = ParsedFishingValueSchema.safeParse(JSON.parse(fact.valor));
      if (parsed.success && parsed.data.medals?.includes(S1_PESCA_MEDAL)) {
        fishingMedalRecipients.push({
          userJid: fact.userJid,
          s1SpeciesCount: parsed.data.s1SpeciesCount ?? 0,
          s1Completed: parsed.data.s1Completed ?? true,
        });
      }
    } catch {
      // Ignorar JSON inválido en auditoría
    }
  }

  const otherFactsCount = totalFactsCount - fishingFacts.length - pokedexCount - superheroesCount - mlbbCount;

  return {
    currentSeason: currentSeasonState?.season ?? null,
    hasS1BackupInDb: Boolean(backupRow),
    profilesCount,
    profilesNonDefaultBalanceCount,
    profilesWithProfessionCount,
    profilesWithTitleCount,
    inventoryItemsCount,
    fishingFactsCount: fishingFacts.length,
    fishingS1MedalCount: fishingMedalRecipients.length,
    fishingMedalRecipients,
    preservedFacts: {
      pokedexCount,
      superheroesCount,
      mlbbCount,
      otherFactsCount,
      totalFactsCount,
    },
  };
}
