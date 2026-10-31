import "dotenv/config";
import fs from "fs";
import path from "path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { prisma } from "./prisma.js";

const AUTH_DIR = path.resolve(process.cwd(), "auth_info");
const SESSION_BUNDLE_KEY = "auth_bundle_v1";
let syncDebounceTimer: NodeJS.Timeout | null = null;
let isSyncing = false;
let pendingSync = false;

function getEncryptionKey(): Buffer | null {
  const secret = process.env.SESSION_ENCRYPTION_KEY || process.env.RESET_AUTH_SECRET;
  if (!secret || secret.trim().length === 0) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptPayload(plainBuffer: Buffer): string {
  const key = getEncryptionKey();
  if (!key) {
    return plainBuffer.toString("base64");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptPayload(storedValue: string): Buffer {
  if (!storedValue.startsWith("enc:v1:")) {
    // Retrocompatibilidad con valores comprimidos sin cifrar
    return Buffer.from(storedValue, "base64");
  }

  const parts = storedValue.split(":");
  if (parts.length !== 5) {
    throw new Error("Formato de sesión cifrada corrupto.");
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("No se puede descifrar la sesión: falta SESSION_ENCRYPTION_KEY o RESET_AUTH_SECRET.");
  }

  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const ciphertext = Buffer.from(parts[4], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Restaura los archivos de autenticación desde PostgreSQL a la carpeta auth_info/.
 */
export async function restoreAuthFromDb(): Promise<boolean> {
  try {
    const row = await prisma.baileysSession.findUnique({
      where: { key: SESSION_BUNDLE_KEY },
    });

    if (!row?.value) {
      console.log("[Auth Sync] No se encontró bundle de sesión previo en PostgreSQL (se requerirá escanear QR).");
      return false;
    }

    const compressedBuffer = decryptPayload(row.value);
    const decompressedJson = zlib.gunzipSync(compressedBuffer).toString("utf8");
    const bundle: Record<string, string> = JSON.parse(decompressedJson);

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const filenames = Object.keys(bundle);
    let restoredCount = 0;
    for (const rawFilename of filenames) {
      const safeFilename = path.basename(rawFilename);
      if (safeFilename.startsWith("sender-key-") || !safeFilename.endsWith(".json")) continue;
      const filePath = path.join(AUTH_DIR, safeFilename);
      fs.writeFileSync(filePath, bundle[rawFilename], "utf8");
      restoredCount++;
    }

    // Purgar cualquier archivo residual de sender-key en disco para renovación de claves de grupo
    try {
      const diskFiles = fs.readdirSync(AUTH_DIR);
      for (const df of diskFiles) {
        if (df.startsWith("sender-key-")) {
          fs.unlinkSync(path.join(AUTH_DIR, df));
        }
      }
    } catch {}

    console.log(`[Auth Sync] ✅ ${restoredCount} archivos de sesión restaurados desde PostgreSQL.`);
    return true;
  } catch (err: any) {
    console.error("[Auth Sync] Error restaurando sesión desde PostgreSQL:", err?.message || err);
    return false;
  }
}

/**
 * Empaqueta archivos de auth_info/, los comprime con gzip, los cifra y los persiste en PostgreSQL vía Prisma.
 */
export async function syncAuthToDb(): Promise<void> {
  if (isSyncing) {
    pendingSync = true;
    return;
  }
  isSyncing = true;
  try {
    if (!fs.existsSync(AUTH_DIR)) return;

    const files = fs
      .readdirSync(AUTH_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("sender-key-"));
    if (files.length === 0) return;

    const bundle: Record<string, string> = {};
    for (const filename of files) {
      const safeFilename = path.basename(filename);
      try {
        const filePath = path.join(AUTH_DIR, safeFilename);
        const content = fs.readFileSync(filePath, "utf8");
        if (content && content.trim().length > 0) {
          bundle[safeFilename] = content;
        }
      } catch {}
    }

    const jsonString = JSON.stringify(bundle);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf8"));
    const storedValue = encryptPayload(compressed);

    await prisma.baileysSession.upsert({
      where: { key: SESSION_BUNDLE_KEY },
      update: { value: storedValue },
      create: { key: SESSION_BUNDLE_KEY, value: storedValue },
    });

    console.log(`[Auth Sync] 💾 ${files.length} archivos empaquetados y respaldados en PostgreSQL (${Math.round(compressed.length / 1024)} KB).`);
  } catch (err: any) {
    console.error("[Auth Sync] Error sincronizando credenciales a PostgreSQL:", err?.message || err);
  } finally {
    isSyncing = false;
    if (pendingSync) {
      pendingSync = false;
      syncAuthToDb().catch(() => {});
    }
  }
}

/**
 * Sincronización debounced para respaldar cambios de sesión sin saturar la base de datos.
 */
export function queueAuthSync(delayMs = 4000): void {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncAuthToDb().catch(() => {});
  }, delayMs);
}

/**
 * Elimina el bundle de sesión de PostgreSQL para reiniciar credenciales.
 */
export async function clearAuthFromDb(): Promise<void> {
  try {
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    await prisma.baileysSession.deleteMany({
      where: { key: SESSION_BUNDLE_KEY },
    });
    console.log("[Auth Sync] 🗑️ Sesión anterior eliminada exitosamente de PostgreSQL.");
  } catch (err: any) {
    console.error("[Auth Sync] Error eliminando sesión de PostgreSQL:", err?.message || err);
  }
}
