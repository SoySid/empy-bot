import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

import { AsyncLocalStorage } from "node:async_hooks";

class AsyncLock {
  private queue: Promise<unknown> = Promise.resolve();
  public activeCount = 0;

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCount++;
    const runOp = async () => {
      try {
        return await operation();
      } finally {
        this.activeCount--;
      }
    };
    const next = this.queue.then(runOp, runOp);
    this.queue = next;
    return next as Promise<T>;
  }
}

const writeLockStorage = new AsyncLocalStorage<boolean>();
const keyLockStorage = new AsyncLocalStorage<Set<string>>();

const globalWriteLock = new AsyncLock();
const keyedLocks = new Map<string, AsyncLock>();

/**
 * Ejecuta una operación asegurando exclusión mutua secuencial (Mutex reentrante).
 */
export async function withWriteLock<T>(operation: () => Promise<T>, _timeoutMs?: number): Promise<T> {
  if (writeLockStorage.getStore()) {
    return await operation();
  }
  return await globalWriteLock.run(async () => {
    return await writeLockStorage.run(true, operation);
  });
}

/**
 * Ejecuta una operación asegurando exclusión mutua por clave específica (ej: userId o chatJid).
 */
export async function withKeyLock<T>(key: string, operation: () => Promise<T>, _timeoutMs?: number): Promise<T> {
  const heldKeys = keyLockStorage.getStore();
  if (heldKeys?.has(key)) {
    return await operation();
  }

  let lock = keyedLocks.get(key);
  if (!lock) {
    lock = new AsyncLock();
    keyedLocks.set(key, lock);
  }

  try {
    return await lock.run(async () => {
      const nextKeys = new Set(heldKeys || []);
      nextKeys.add(key);
      return await keyLockStorage.run(nextKeys, operation);
    });
  } finally {
    if (lock.activeCount === 0) {
      keyedLocks.delete(key);
    }
  }
}

// Inicializa y verifica la conexión activa con PostgreSQL (Supabase) con blindaje RLS
export async function initPrisma(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1;`;
    console.log("[Prisma] 🚀 Conexión con PostgreSQL (Supabase) inicializada con éxito.");

    // Blindaje de seguridad Supabase: Activar Row Level Security (RLS) en todas las tablas públicas
    const tablesToShield = [
      "UserProfile",
      "UserAlias",
      "LidMapping",
      "UserFact",
      "MessageEmbedding",
      "RawMessage",
      "SocialPromise",
      "BotLesson",
      "BurnedJoke",
      "Reminder",
      "ServerEconomyState",
      "UserInventoryItem",
      "GroupLexicon",
      "ToneSnapshot",
      "InterventionStats",
      "ApiQuotaUsage",
      "BaileysSession",
      "CustomSticker",
      "CustomVoice",
      "user_command_bans",
    ];

    for (const tableName of tablesToShield) {
      try {
        await prisma.$executeRawUnsafe(
          `DO $$ BEGIN
             IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}') THEN
               EXECUTE 'ALTER TABLE public."' || '${tableName}' || '" ENABLE ROW LEVEL SECURITY';
             END IF;
           END $$;`
        );
      } catch {}
    }
    console.log("[Prisma] 🛡️ Row Level Security (RLS) asegurado en tablas públicas de Supabase.");
  } catch (error) {
    console.error("[Prisma] Error conectando con la base de datos:", error);
  }
}