import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Readable } from "stream";
import { prisma } from "./db/prisma.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Optimización estricta de memoria para Render Free Tier (Límite 512 MB de RAM)
sharp.cache(false);
sharp.concurrency(1);

const STICKERS_ROOT = path.resolve(process.cwd(), "stickers");
export const VALID_CATEGORIES = [
  "bardo",
  "burla",
  "risa",
  "triste",
  "wtf",
  "festejo",
  "afecto",
  "duda",
  "triggers",
];

export const CATEGORY_METADATA: Record<string, { icon: string; desc: string }> = {
  bardo: { icon: "🥊", desc: "Conflictos, discusiones y chicanas picantes" },
  burla: { icon: "🤡", desc: "Descansos, señalar errores y sobradas" },
  risa: { icon: "😂", desc: "Carcajadas, tentadas y remates de humor" },
  triste: { icon: "😭", desc: "Quejas, bajones, mala suerte y desahogo" },
  wtf: { icon: "🤨", desc: "Incredulidad, cosas turbias y desconcierto" },
  festejo: { icon: "🍻", desc: "Celebración, victorias, buenas noticias y hype" },
  afecto: { icon: "❤️", desc: "Abrazos, besos, cariño y ternura" },
  duda: { icon: "🧐", desc: "Sospecha, desconfianza y caras de juicio" },
  triggers: { icon: "⚡", desc: "Respuestas automáticas a palabras clave específicas" },
};

export function getStickerCategoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cat of VALID_CATEGORIES) {
    const catDir = path.join(STICKERS_ROOT, cat);
    if (fs.existsSync(catDir)) {
      try {
        const files = fs.readdirSync(catDir).filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
        counts[cat] = files.length;
      } catch {
        counts[cat] = 0;
      }
    } else {
      counts[cat] = 0;
    }
  }
  return counts;
}

export function initStickersDirectory(): void {
  for (const f of VALID_CATEGORIES) {
    const dir = path.join(STICKERS_ROOT, f);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export async function initStickersTable(): Promise<void> {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "CustomSticker" (
        "id" TEXT PRIMARY KEY,
        "category" TEXT NOT NULL,
        "filename" TEXT NOT NULL UNIQUE,
        "data" TEXT NOT NULL,
        "isAnimated" BOOLEAN NOT NULL DEFAULT false,
        "addedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "CustomSticker_category_idx" ON "CustomSticker"("category")
    `;
  } catch (err: any) {
    console.warn("[Sticker Service] No se pudo verificar la tabla CustomSticker:", err?.message || err);
  }
}

export async function syncStickersFromDb(): Promise<void> {
  try {
    initStickersDirectory();
    await initStickersTable();

    const rows = await prisma.customSticker.findMany({
      select: { category: true, filename: true, data: true, isAnimated: true },
    });

    if (!rows || rows.length === 0) {
      return;
    }

    let syncedCount = 0;
    for (const row of rows) {
      const cat = row.category.toLowerCase().trim();
      if (!VALID_CATEGORIES.includes(cat)) continue;
      const safeFilename = path.basename(row.filename);
      if (!safeFilename || safeFilename.includes("..")) continue;

      const dir = path.join(STICKERS_ROOT, cat);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const filePath = path.join(dir, safeFilename);
      if (!fs.existsSync(filePath)) {
        const buffer = Buffer.from(row.data, "base64");
        await fs.promises.writeFile(filePath, buffer);
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      console.log(`[Sticker Service] 📦 Sincronizados ${syncedCount} stickers desde la base de datos a disco.`);
      invalidateTriggerPrefixesCache();
    }
  } catch (err: any) {
    console.error("[Sticker Service] Error sincronizando stickers desde PostgreSQL:", err?.message || err);
  }
}

let cachedTriggerPrefixes: string[] | null = null;
let lastPrefixesFetch = 0;
const CACHE_TTL_MS = 15000;
let hasAttemptedOnDemandSync = false;

export async function ensureStickersPopulated(): Promise<void> {
  if (hasAttemptedOnDemandSync) return;
  const dir = path.join(STICKERS_ROOT, "triggers");
  let fileCount = 0;
  if (fs.existsSync(dir)) {
    try {
      const files = await fs.promises.readdir(dir);
      fileCount = files.length;
    } catch {}
  }
  if (fileCount === 0) {
    hasAttemptedOnDemandSync = true;
    console.log("[Sticker Service] 📦 Carpeta de stickers vacía o incompleta. Sincronizando on-demand desde PostgreSQL...");
    await syncStickersFromDb();
  }
}

export function invalidateTriggerPrefixesCache(): void {
  cachedTriggerPrefixes = null;
}

export async function getAvailableTriggerPrefixes(): Promise<string[]> {
  const now = Date.now();
  if (cachedTriggerPrefixes && now - lastPrefixesFetch < CACHE_TTL_MS) {
    return cachedTriggerPrefixes;
  }

  try {
    await ensureStickersPopulated();
    const dir = path.join(STICKERS_ROOT, "triggers");
    if (!fs.existsSync(dir)) return [];

    const files = await fs.promises.readdir(dir);
    const prefixes = new Set<string>();

    for (const f of files) {
      if (!/\.(webp|png|jpg|jpeg)$/i.test(f)) continue;
      const withoutExt = f.replace(/\.(webp|png|jpg|jpeg)$/i, "").toLowerCase();
      // Quitar sufijos numéricos o de hash: custom2 -> custom, saludo_2 -> saludo
      const basePrefix = withoutExt.replace(/[_\-0-9]+$/, "").trim();
      if (basePrefix.length >= 2) {
        prefixes.add(basePrefix);
      }
    }

    cachedTriggerPrefixes = Array.from(prefixes).sort((a, b) => b.length - a.length);
    lastPrefixesFetch = now;
    return cachedTriggerPrefixes;
  } catch (err) {
    console.error("[Sticker Service] Error leyendo prefijos de triggers:", err);
    return [];
  }
}

export async function saveCustomSticker(params: {
  category: string;
  buffer: Buffer;
  isAnimated: boolean;
  customName?: string;
  addedBy?: string;
}): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const cleanCat = params.category.trim().toLowerCase();
    if (!VALID_CATEGORIES.includes(cleanCat)) {
      return {
        success: false,
        error: `Categoría inválida. Las disponibles son: ${VALID_CATEGORIES.join(", ")}`,
      };
    }

    let baseName = "";
    if (params.customName) {
      baseName = params.customName
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    }

    if (!baseName) {
      const randomHash = crypto.randomBytes(3).toString("hex");
      baseName = `${cleanCat}_${Date.now()}_${randomHash}`;
    }

    let filename = `${baseName}.webp`;
    const dir = path.join(STICKERS_ROOT, cleanCat);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      if (params.customName) {
        let counter = 2;
        while (fs.existsSync(path.join(dir, `${baseName}${counter}.webp`))) {
          counter++;
        }
        filename = `${baseName}${counter}.webp`;
      } else {
        filename = `${baseName}_${crypto.randomBytes(2).toString("hex")}.webp`;
      }
      filePath = path.join(dir, filename);
    }

    // 1. Guardar en disco local para disponibilidad inmediata
    await fs.promises.writeFile(filePath, params.buffer);

    // 2. Persistir en Neon PostgreSQL para Render
    const base64Data = params.buffer.toString("base64");
    const id = crypto.randomUUID();

    await prisma.customSticker.upsert({
      where: { filename },
      create: {
        id,
        category: cleanCat,
        filename,
        data: base64Data,
        isAnimated: params.isAnimated,
        addedBy: params.addedBy || "usuario",
      },
      update: {
        data: base64Data,
        isAnimated: params.isAnimated,
        addedBy: params.addedBy || "usuario",
      },
    });

    if (cleanCat === "triggers") {
      invalidateTriggerPrefixesCache();
    }

    return { success: true, filename };
  } catch (error: any) {
    console.error("[Sticker Service] Error guardando custom sticker:", error);
    return { success: false, error: error?.message || "Error al guardar el sticker" };
  }
}

export async function isAnimatedWebp(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return Boolean(metadata.pages && metadata.pages > 1);
  } catch {
    return false;
  }
}

export async function ensureValidStickerBuffer(rawBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(rawBuffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("[Sticker Sanitizer] Error procesando buffer:", error);
    return rawBuffer;
  }
}

// Historial de stickers recientes por categoría para evitar repetir exactamente el mismo archivo
const recentStickerHistory = new Map<string, string[]>();
const MAX_RECENT_HISTORY = 4;

// Historial de categorías recientes para rotar equitativamente entre todas
let recentCategoryHistory: string[] = [];
const MAX_RECENT_CAT_HISTORY = 4;

/**
 * Retorna una categoría aleatoria de las disponibles (con stickers > 0, excluyendo triggers)
 * rotando equitativamente para no repetir la misma categoría de forma consecutiva.
 */
export function getRandomStickerCategory(): string {
  const counts = getStickerCategoryCounts();
  const availableCats = VALID_CATEGORIES.filter(
    (c) => c !== "triggers" && (counts[c] ?? 0) > 0
  );

  if (availableCats.length === 0) return "burla";

  // Intentar elegir una categoría no usada en las últimas rotaciones
  let pool = availableCats.filter((c) => !recentCategoryHistory.includes(c));
  if (pool.length === 0) {
    pool = availableCats;
    recentCategoryHistory = [];
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  recentCategoryHistory = [...recentCategoryHistory, chosen].slice(-MAX_RECENT_CAT_HISTORY);
  return chosen;
}

export async function getRandomLocalSticker(category?: string): Promise<{ buffer: Buffer; isAnimated: boolean } | null> {
  try {
    await ensureStickersPopulated();
    const cleanCat = category?.trim().toLowerCase();
    
    // Si no se especificó categoría o es "random"/"azar" o no está en la lista: selección aleatoria
    let targetCat: string;
    if (!cleanCat || cleanCat === "random" || cleanCat === "azar" || !VALID_CATEGORIES.includes(cleanCat) || cleanCat === "triggers") {
      targetCat = getRandomStickerCategory();
    } else {
      targetCat = cleanCat;
    }

    let dir = path.join(STICKERS_ROOT, targetCat);
    let files: string[] = [];
    if (fs.existsSync(dir)) {
      files = (await fs.promises.readdir(dir)).filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
    }

    // Si la categoría pedida no tiene stickers cargados, recurrir a otra categoría disponible al azar
    if (files.length === 0) {
      targetCat = getRandomStickerCategory();
      dir = path.join(STICKERS_ROOT, targetCat);
      if (fs.existsSync(dir)) {
        files = (await fs.promises.readdir(dir)).filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
      }
    }

    if (files.length === 0) {
      return null;
    }

    // Filtrar los que ya se usaron recientemente para no repetir el mismo archivo
    const recent = recentStickerHistory.get(targetCat) || [];
    let candidates = files.filter((f) => !recent.includes(f));
    if (candidates.length === 0) {
      // Si ya usamos todos los disponibles, reseteamos el historial de esa categoría
      candidates = files;
      recentStickerHistory.set(targetCat, []);
    }

    const randomFile = candidates[Math.floor(Math.random() * candidates.length)];

    // Registrar en el historial de recientes
    const updatedHistory = [...(recentStickerHistory.get(targetCat) || []), randomFile].slice(-MAX_RECENT_HISTORY);
    recentStickerHistory.set(targetCat, updatedHistory);

    const filePath = path.join(dir, randomFile);
    const raw = await fs.promises.readFile(filePath);
    const isAnimated = await isAnimatedWebp(raw);

    const buffer = randomFile.toLowerCase().endsWith(".webp") ? raw : await ensureValidStickerBuffer(raw);
    return { buffer, isAnimated };
  } catch (err) {
    console.error("[Sticker Service] Error leyendo sticker:", err);
    return null;
  }
}

// Historial de stickers recientes para triggers para evitar repetición
const recentTriggerHistory = new Map<string, string[]>();
const MAX_RECENT_TRIGGER_HISTORY = 4;

/**
 * Busca todos los stickers en triggers que inicien con el prefijo
 * y selecciona uno aleatorio sin repetir inmediatamente (soporta item, item2, saludo1, etc.)
 */
export async function getTriggerSticker(triggerPrefix: string): Promise<{ buffer: Buffer; isAnimated: boolean } | null> {
  try {
    await ensureStickersPopulated();
    const cleanPrefix = triggerPrefix.trim().toLowerCase();
    const dir = path.join(STICKERS_ROOT, "triggers");
    if (!fs.existsSync(dir)) return null;

    const files = (await fs.promises.readdir(dir)).filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
    const matchingFiles = files.filter((f) => {
      const lower = f.toLowerCase();
      if (!lower.startsWith(cleanPrefix)) return false;
      const rest = lower.slice(cleanPrefix.length).replace(/\.(webp|png|jpg|jpeg)$/i, "");
      return rest === "" || /^[_\-0-9]/.test(rest);
    });

    if (matchingFiles.length === 0) return null;

    // Evitar repetición inmediata si hay múltiples stickers disponibles para este trigger
    const recent = recentTriggerHistory.get(cleanPrefix) || [];
    let candidates = matchingFiles.filter((f) => !recent.includes(f));
    if (candidates.length === 0) {
      candidates = matchingFiles;
      recentTriggerHistory.set(cleanPrefix, []);
    }

    const chosenFile = candidates[Math.floor(Math.random() * candidates.length)];
    const updatedHistory = [...(recentTriggerHistory.get(cleanPrefix) || []), chosenFile].slice(-MAX_RECENT_TRIGGER_HISTORY);
    recentTriggerHistory.set(cleanPrefix, updatedHistory);

    const filePath = path.join(dir, chosenFile);
    const raw = await fs.promises.readFile(filePath);
    const isAnimated = await isAnimatedWebp(raw);

    const buffer = chosenFile.toLowerCase().endsWith(".webp") ? raw : await ensureValidStickerBuffer(raw);
    return { buffer, isAnimated };
  } catch (err) {
    console.error("[Sticker Service] Error leyendo trigger sticker:", err);
    return null;
  }
}

export async function createSticker(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer, { limitInputPixels: 16777216 })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function createAnimatedSticker(videoBuffer: Buffer): Promise<Buffer> {
  const tempId = crypto.randomBytes(6).toString("hex");
  const inputPath = path.join(os.tmpdir(), `in_${tempId}.mp4`);
  const outputPath = path.join(os.tmpdir(), `out_${tempId}.webp`);

  fs.writeFileSync(inputPath, videoBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-ss 00:00:00", "-t 6"])
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=12",
        "-loop 0",
        "-compression_level 3",
        "-an",
        "-q:v 50",
      ])
      .toFormat("webp")
      .save(outputPath)
      .on("end", () => {
        try {
          const buffer = fs.readFileSync(outputPath);
          resolve(buffer);
        } catch (e) {
          reject(e);
        } finally {
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch {}
        }
      })
      .on("error", (err) => {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {}
        reject(err);
      });
  });
}

async function fastAnimatedStickerToVideo(stickerBuffer: Buffer, outputPath: string): Promise<Buffer> {
  const image = sharp(stickerBuffer, { animated: true, limitInputPixels: 268402689 });
  const metadata = await image.metadata();

  const width = metadata.width;
  const pageHeight = metadata.pageHeight || metadata.height;

  if (!width || !pageHeight) {
    throw new Error("Dimensiones no válidas");
  }

  if (width > 1024 || pageHeight > 1024) {
    throw new Error("Dimensiones de sticker exceden el límite de seguridad (máx 1024px)");
  }

  const delays = metadata.delay as number[] | undefined;
  let fps = 12;
  if (delays && delays.length > 0) {
    const avgDelayMs = delays.reduce((a, b) => a + b, 0) / delays.length;
    if (avgDelayMs > 0) {
      fps = Math.min(30, Math.max(1, Math.round(1000 / avgDelayMs)));
    }
  }

  const { data: rawFrames } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const frameSize = width * pageHeight * 4;
  if (frameSize <= 0 || rawFrames.length < frameSize) {
    throw new Error("Buffer corrupto");
  }

  const maxAllowedFrames = 60;
  const usableFrames = Math.min(maxAllowedFrames, Math.floor(rawFrames.length / frameSize));
  const trimmedFrames = rawFrames.subarray(0, usableFrames * frameSize);

  return await new Promise((resolve, reject) => {
    const rawStream = Readable.from(trimmedFrames);

    ffmpeg(rawStream)
      .inputFormat("rawvideo")
      .inputOptions([
        "-pixel_format rgba",
        `-video_size ${width}x${pageHeight}`,
        `-framerate ${fps}`,
      ])
      .outputOptions([
        "-pix_fmt yuv420p",
        "-c:v libx264",
        "-preset ultrafast",
        "-movflags +faststart",
        "-vf scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=black,fps=12",
        "-an",
      ])
      .toFormat("mp4")
      .save(outputPath)
      .on("end", async () => {
        try {
          const data = await fs.promises.readFile(outputPath);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      })
      .on("error", (err: any) => reject(err));
  });
}

export async function animatedStickerToVideo(stickerBuffer: Buffer): Promise<Buffer> {
  const tempId = crypto.randomBytes(6).toString("hex");
  const outputPath = path.join(os.tmpdir(), `out_${tempId}.mp4`);

  const cleanup = () => {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  };

  try {
    const result = await fastAnimatedStickerToVideo(stickerBuffer, outputPath);
    cleanup();
    return result;
  } catch {
    cleanup();
    const tempGifPath = `${outputPath}.fallback.gif`;
    try {
      const cleanGifBuffer = await sharp(stickerBuffer, { animated: true }).gif().toBuffer();
      fs.writeFileSync(tempGifPath, cleanGifBuffer);

      return await new Promise((resolve, reject) => {
        ffmpeg(tempGifPath)
          .outputOptions([
            "-pix_fmt yuv420p",
            "-c:v libx264",
            "-preset ultrafast",
            "-movflags +faststart",
            "-vf scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=black,fps=12",
            "-an",
          ])
          .toFormat("mp4")
          .save(outputPath)
          .on("end", () => {
            try {
              const buffer = fs.readFileSync(outputPath);
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              resolve(buffer);
            } catch (e) {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              reject(e);
            }
          })
          .on("error", (err: any) => {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            reject(err);
          });
      });
    } finally {
      if (fs.existsSync(tempGifPath)) fs.unlinkSync(tempGifPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }
}