import { prisma, withWriteLock } from "./db/prisma.js";

interface ProviderStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  callsCount: number;
  costUsd: number;
}

interface DailyStats {
  date: string;
  gemini: ProviderStats;
  groq: ProviderStats;
  totalTokens: number;
  totalCalls: number;
  totalCostUsd: number;
}

// Límites reales de RPD (Requests Per Day) informados
export const MODEL_RPD_LIMITS: Record<string, number> = {
  // Modelos Gemma de alta cuota (14.4K RPD, 30 RPM)
  "gemma-4-31b-it": 14400,
  "gemma-4-26b-a4b-it": 14400,
  // Modelos Gemini oficiales dinámicos y rápidos
  "gemini-2.5-flash-lite": 1500,
  "gemini-2.0-flash-lite": 1500,
  "gemini-flash-lite-latest": 1500,
  "gemini-flash-latest": 1500,
  "gemini-3.1-flash-lite": 500,
  "gemini-3.5-flash-lite": 500,
  // Modelos Gemini con cuota CRÍTICA (20 RPD) - PROHIBIDOS para features nuevas
  "gemini-2.5-flash": 20,
  "gemini-3-flash": 20,
  "gemini-3.5-flash": 20,
  "gemini-3.6-flash": 20,
  "gemini-3.7-flash": 20,
  "gemini-3.8-flash": 20,
  // Modelos Groq
  "whisper-large-v3-turbo": 2000,
  "qwen/qwen3.8-27b": 1000,
  "openai/gpt-oss-120b": 300,
  "openai/gpt-oss-20b": 1000,
};

// Modelos restringidos a los que solo la feature 'conversation' directa puede acceder como fallback de emergencia
const RESTRICTED_RPD_20_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
]);

const GROQ_DAILY_TOKEN_LIMIT = 200000;

export function getArgentinaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function getTodayString(): string {
  return getArgentinaDateString();
}

function createEmptyProviderStats(): ProviderStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    callsCount: 0,
    costUsd: 0,
  };
}

let currentStats: DailyStats = {
  date: getTodayString(),
  gemini: createEmptyProviderStats(),
  groq: createEmptyProviderStats(),
  totalTokens: 0,
  totalCalls: 0,
  totalCostUsd: 0,
};

// Registro en memoria de llamadas diarias por modelo (para chequeo rápido O(1))
const modelDailyCalls = new Map<string, number>();

// Mapa de timestamps de llamadas por modelo (sliding window de 60 segundos para RPM)
const modelCallTimestamps = new Map<string, number[]>();

// Mapa de cooldowns activos por modelo (timestamp hasta el cual no se debe usar)
const modelCooldowns = new Map<string, number>();

let isTrackerInitialized = false;

/**
 * Inicializa el tracker cargando las estadísticas guardadas en la base de datos (PostgreSQL)
 * para persistir el consumo real entre reinicios del bot.
 */
export async function initQuotaTracker(): Promise<void> {
  if (isTrackerInitialized) return;
  const today = getTodayString();
  currentStats.date = today;

  try {
    const usages = await prisma.apiQuotaUsage.findMany({
      where: { date: today },
    });

    modelDailyCalls.clear();
    currentStats.gemini = createEmptyProviderStats();
    currentStats.groq = createEmptyProviderStats();
    currentStats.totalTokens = 0;
    currentStats.totalCalls = 0;
    currentStats.totalCostUsd = 0;

    for (const u of usages) {
      const currentCount = modelDailyCalls.get(u.model) || 0;
      modelDailyCalls.set(u.model, currentCount + u.callCount);

      const target = u.provider === "gemini" ? currentStats.gemini : currentStats.groq;
      target.callsCount += u.callCount;
      target.totalTokens += u.tokens;
      currentStats.totalCalls += u.callCount;
      currentStats.totalTokens += u.tokens;
    }

    isTrackerInitialized = true;
    console.log(
      `[Quota Tracker] 📊 Cuotas cargadas desde PostgreSQL: ${currentStats.totalCalls} llamadas acumuladas hoy (${today}).`
    );
  } catch (error) {
    console.error("[Quota Tracker] Error inicializando cuotas desde PostgreSQL:", error);
    isTrackerInitialized = true;
  }
}

function checkAndResetDaily(): void {
  const today = getTodayString();
  if (currentStats.date !== today) {
    console.log(`\n🔄 [Tokens] Reinicio diario (${today})\n`);
    currentStats = {
      date: today,
      gemini: createEmptyProviderStats(),
      groq: createEmptyProviderStats(),
      totalTokens: 0,
      totalCalls: 0,
      totalCostUsd: 0,
    };
    modelDailyCalls.clear();
    modelCallTimestamps.clear();
  }
}

export function isModelInCooldown(model: string): boolean {
  const until = modelCooldowns.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldowns.delete(model);
    return false;
  }
  return true;
}

export function setModelCooldown(model: string, cooldownMs: number): void {
  const until = Date.now() + cooldownMs;
  modelCooldowns.set(model, until);
  console.warn(`[Model Rate Limiter] ⏸️ Modelo '${model}' en cooldown por ${(cooldownMs / 1000).toFixed(0)}s`);
}

export function getRemainingRpd(model: string): number {
  checkAndResetDaily();
  const limit = MODEL_RPD_LIMITS[model] ?? 500;
  const used = modelDailyCalls.get(model) || 0;
  return Math.max(0, limit - used);
}

/**
 * Valida si un modelo puede ser invocado teniendo en cuenta:
 * 1. Cooldown activo por errores 429/quota/billing.
 * 2. RPM (sliding window de 60s).
 * 3. RPD acumulado contra el límite de la cuenta.
 * 4. BLINDAJE DE COSTOS Y ROLES PARA MUSE SPARK:
 *    - Muse solo se usa en respuestas al grupo (features: conversation, spontaneous, direct_call).
 *    - Si supera el límite diario de gasto (default $0.25 USD), se bloquea y pasa a modelos gratis.
 * 5. BLINDAJE DE RPD:20: Features que no sean 'conversation' directa tienen TERMINANTEMENTE PROHIBIDO
 *    usar modelos con 20 RPD.
 */
export function canUseModel(model: string, maxRpm = 15, feature = "conversation"): boolean {
  if (isModelInCooldown(model)) return false;

  // 1. Blindaje estricto para modelos con 20 RPD
  if (RESTRICTED_RPD_20_MODELS.has(model)) {
    // Si la llamada proviene de spontaneous, memory_synth, vision o classifier, RECHAZAR OBLIGATORIAMENTE
    if (feature !== "conversation") {
      return false;
    }
    // Si es conversation, solo permitir si aún le quedan al menos 3 llamadas de resguardo
    if (getRemainingRpd(model) <= 3) {
      return false;
    }
  }

  // 2. Chequeo de límite diario RPD del modelo
  const remainingRpd = getRemainingRpd(model);
  if (remainingRpd <= 0) {
    return false;
  }

  // 3. Chequeo de RPM (sliding window de 60s)
  const now = Date.now();
  const windowMs = 60 * 1000;
  const timestamps = (modelCallTimestamps.get(model) || []).filter((ts) => now - ts < windowMs);
  modelCallTimestamps.set(model, timestamps);

  const safetyThreshold = Math.max(1, Math.floor(maxRpm * 0.85));
  return timestamps.length < safetyThreshold;
}

export function recordModelCall(model: string): void {
  checkAndResetDaily();
  const now = Date.now();
  const timestamps = modelCallTimestamps.get(model) || [];
  timestamps.push(now);
  modelCallTimestamps.set(model, timestamps);

  const dailyCount = (modelDailyCalls.get(model) || 0) + 1;
  modelDailyCalls.set(model, dailyCount);
}

export function trackTokens(
  provider: "gemini" | "groq",
  model: string,
  inputTokens: number,
  outputTokens: number,
  feature = "conversation"
): void {
  checkAndResetDaily();
  recordModelCall(model);

  const totalCall = inputTokens + outputTokens;
  const targetProvider = provider === "gemini" ? currentStats.gemini : currentStats.groq;

  targetProvider.inputTokens += inputTokens;
  targetProvider.outputTokens += outputTokens;
  targetProvider.totalTokens += totalCall;
  targetProvider.callsCount += 1;

  currentStats.totalTokens += totalCall;
  currentStats.totalCalls += 1;

  const today = currentStats.date;
  const provTag = provider === "gemini" ? "🧠 GEMINI" : "⚡ GROQ  ";

  const totalIn = currentStats.gemini.inputTokens + currentStats.groq.inputTokens;
  const totalOut = currentStats.gemini.outputTokens + currentStats.groq.outputTokens;

  console.log(
    `[Token Track #${currentStats.totalCalls}] ${provTag} (${model} [${feature}]) -> +${totalCall} tok (📥 IN: ${inputTokens.toLocaleString()} | 📤 OUT: ${outputTokens.toLocaleString()}) | RPD rest: ${getRemainingRpd(model)} | Total Hoy: ${currentStats.totalTokens.toLocaleString()} (IN: ${totalIn.toLocaleString()} | OUT: ${totalOut.toLocaleString()})`
  );

  // Encolar persistencia en batch para no bombardear la base de datos con cada llamada individual
  const queueKey = `${today}_${provider}_${model}_${feature}`;
  const existing = pendingQuotaUsage.get(queueKey);
  if (existing) {
    existing.callCount += 1;
    existing.tokens += totalCall;
  } else {
    pendingQuotaUsage.set(queueKey, {
      date: today,
      provider,
      model,
      feature,
      callCount: 1,
      tokens: totalCall,
    });
  }
  scheduleQuotaFlush();
}

interface PendingQuotaRecord {
  date: string;
  provider: string;
  model: string;
  feature: string;
  callCount: number;
  tokens: number;
}

const pendingQuotaUsage = new Map<string, PendingQuotaRecord>();
let flushTimeout: NodeJS.Timeout | null = null;
let isFlushing = false;

export async function flushApiQuotaUsage(): Promise<void> {
  if (pendingQuotaUsage.size === 0 || isFlushing) return;
  isFlushing = true;

  const items = Array.from(pendingQuotaUsage.values());
  pendingQuotaUsage.clear();

  try {
    for (const item of items) {
      await prisma.apiQuotaUsage.upsert({
        where: {
          date_provider_model_feature: {
            date: item.date,
            provider: item.provider,
            model: item.model,
            feature: item.feature,
          },
        },
        update: {
          callCount: { increment: item.callCount },
          tokens: { increment: item.tokens },
        },
        create: {
          date: item.date,
          provider: item.provider,
          model: item.model,
          feature: item.feature,
          callCount: item.callCount,
          tokens: item.tokens,
        },
      });
    }
  } catch (err: any) {
    console.warn("[Quota Tracker] Error persistiendo uso en base de datos:", err?.message || err);
    for (const item of items) {
      const key = `${item.date}:${item.provider}:${item.model}:${item.feature}`;
      const existing = pendingQuotaUsage.get(key);
      if (existing) {
        existing.callCount += item.callCount;
        existing.tokens += item.tokens;
      } else {
        pendingQuotaUsage.set(key, { ...item });
      }
    }
  } finally {
    isFlushing = false;
  }
}

function scheduleQuotaFlush(): void {
  if (flushTimeout) return;
  flushTimeout = setTimeout(async () => {
    flushTimeout = null;
    await flushApiQuotaUsage();
  }, 5000);
}

export function isNearGroqLimit(): boolean {
  checkAndResetDaily();
  return currentStats.groq.totalTokens >= GROQ_DAILY_TOKEN_LIMIT * 0.85;
}

export function getTokenStatsString(): string {
  checkAndResetDaily();
  const groqPercent = ((currentStats.groq.totalTokens / GROQ_DAILY_TOKEN_LIMIT) * 100).toFixed(1);
  const totalIn = currentStats.gemini.inputTokens + currentStats.groq.inputTokens;
  const totalOut = currentStats.gemini.outputTokens + currentStats.groq.outputTokens;

  const topModels = Array.from(modelDailyCalls.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, count]) => `• \`${m}\`: *${count}* calls (quedan: ${getRemainingRpd(m)} RPD)`)
    .join("\n");

  return (
    `📊 *CONSUMO DE IA (HOY - REINICIA 00:00 ARG)*\n\n` +
    `🧠 *Gemini:* *${currentStats.gemini.totalTokens.toLocaleString()}* tok (📥 ${currentStats.gemini.inputTokens.toLocaleString()} in / 📤 ${currentStats.gemini.outputTokens.toLocaleString()} out) [${currentStats.gemini.callsCount} calls]\n` +
    `⚡ *Groq:* *${currentStats.groq.totalTokens.toLocaleString()}* tok (📥 ${currentStats.groq.inputTokens.toLocaleString()} in / 📤 ${currentStats.groq.outputTokens.toLocaleString()} out) [${groqPercent}% de cuota diaria]\n\n` +
    `🔢 *Total acumulado:* *${currentStats.totalTokens.toLocaleString()}* tok\n` +
    `📥 *Total Entrada (IN):* *${totalIn.toLocaleString()}* tok\n` +
    `📤 *Total Salida (OUT):* *${totalOut.toLocaleString()}* tok\n` +
    `🔄 *Llamadas totales:* ${currentStats.totalCalls}\n\n` +
    `📈 *Uso por modelo hoy:*\n${topModels || "• Sin llamadas registradas"}`
  );
}