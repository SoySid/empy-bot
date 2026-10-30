import fs from "fs";
import path from "path";
import { prisma } from "./db/prisma.js";
import {
  cleanJid,
  extractDigits,
  ramLidToPhoneMap,
  ramPhoneToLidMap,
} from "./whatsapp-identity.js";

// Memoria RAM: JID/Teléfono/LID -> Set<comando en minúsculas>
const bansByTarget = new Map<string, Set<string>>();
const FALLBACK_FILE_PATH = path.resolve(process.cwd(), "temp", "command-bans.json");

/**
 * Normaliza el nombre del comando removiendo prefijos, tildes y símbolos.
 */
export function normalizeBanCommandName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/^!+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

/**
 * Obtiene todas las claves identificadoras asociadas al usuario (JID canónico, dígitos y LID).
 */
function getUserIdentifierKeys(rawJid: string): string[] {
  if (!rawJid) return [];
  const clean = cleanJid(rawJid);
  const digits = extractDigits(clean);

  const keys = new Set<string>();
  if (clean) keys.add(clean);
  if (digits) keys.add(digits);

  const mappedPhone = ramLidToPhoneMap.get(clean) || (digits ? ramLidToPhoneMap.get(digits) : undefined);
  if (mappedPhone) {
    keys.add(mappedPhone);
    const pDigits = extractDigits(mappedPhone);
    if (pDigits) keys.add(pDigits);
  }

  const mappedLid = ramPhoneToLidMap.get(clean) || (digits ? ramPhoneToLidMap.get(digits) : undefined);
  if (mappedLid) {
    keys.add(mappedLid);
    const lDigits = extractDigits(mappedLid);
    if (lDigits) keys.add(lDigits);
  }

  return Array.from(keys);
}

/**
 * Persiste los bans en el archivo de respaldo local.
 */
function saveFallbackFile(): void {
  try {
    const serialized: Record<string, string[]> = {};
    for (const [key, set] of bansByTarget.entries()) {
      serialized[key] = Array.from(set);
    }
    const dir = path.dirname(FALLBACK_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_FILE_PATH, JSON.stringify(serialized, null, 2), "utf-8");
  } catch (err: any) {
    console.warn("[Command Ban] Error guardando fallback local:", err?.message || err);
  }
}

/**
 * Carga los bans desde el archivo de respaldo local si existiese.
 */
function loadFallbackFile(): void {
  try {
    if (!fs.existsSync(FALLBACK_FILE_PATH)) return;
    const raw = fs.readFileSync(FALLBACK_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      for (const [key, list] of Object.entries(parsed)) {
        if (Array.isArray(list)) {
          bansByTarget.set(key, new Set(list.map((c) => normalizeBanCommandName(String(c)))));
        }
      }
    }
  } catch (err: any) {
    console.warn("[Command Ban] Error leyendo fallback local:", err?.message || err);
  }
}

/**
 * Inicializa la tabla en la base de datos y carga los registros en memoria.
 */
export async function initCommandBanService(): Promise<void> {
  // Carga previa desde fallback local
  loadFallbackFile();

  try {
    // Creación de tabla e índice si no existen
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS user_command_bans (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_jid TEXT NOT NULL,
        command TEXT NOT NULL,
        banned_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT user_command_bans_user_jid_command_unique UNIQUE (user_jid, command)
      );
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_user_command_bans_user_jid ON user_command_bans (user_jid);
    `;

    const records = await prisma.$queryRaw<Array<{ user_jid: string; command: string }>>`
      SELECT user_jid, command FROM user_command_bans
    `;

    for (const record of records) {
      const keys = getUserIdentifierKeys(record.user_jid);
      const normalizedCmd = normalizeBanCommandName(record.command);

      for (const key of keys) {
        let set = bansByTarget.get(key);
        if (!set) {
          set = new Set<string>();
          bansByTarget.set(key, set);
        }
        set.add(normalizedCmd);
      }
    }

    saveFallbackFile();
    console.log(`[Command Ban] 🛡️ ${records.length} restricciones de comandos cargadas en RAM.`);
  } catch (err: any) {
    console.warn("[Command Ban] No se pudo sincronizar con PostgreSQL, usando almacenamiento local:", err?.message || err);
  }
}

/**
 * Bloquea un comando para un usuario.
 */
export async function banCommandForUser(
  targetJid: string,
  rawCommand: string,
  bannedBy?: string
): Promise<{ added: boolean; normalizedCommand: string }> {
  const normalizedCommand = normalizeBanCommandName(rawCommand);
  if (!normalizedCommand) return { added: false, normalizedCommand: "" };

  const keys = getUserIdentifierKeys(targetJid);
  const canonicalKey = cleanJid(targetJid);

  // Registrar en memoria RAM
  for (const key of keys) {
    let set = bansByTarget.get(key);
    if (!set) {
      set = new Set<string>();
      bansByTarget.set(key, set);
    }
    set.add(normalizedCommand);
  }

  saveFallbackFile();

  // Persistir en base de datos
  try {
    const bannedByVal = bannedBy || null;
    await prisma.$executeRaw`
      INSERT INTO user_command_bans (user_jid, command, banned_by)
      VALUES (${canonicalKey}, ${normalizedCommand}, ${bannedByVal})
      ON CONFLICT (user_jid, command) DO NOTHING
    `;
  } catch (err: any) {
    console.warn("[Command Ban] Error persistiendo ban en base de datos:", err?.message || err);
  }

  return { added: true, normalizedCommand };
}

/**
 * Desbloquea un comando para un usuario.
 */
export async function unbanCommandForUser(
  targetJid: string,
  rawCommand: string
): Promise<{ removed: boolean; normalizedCommand: string }> {
  const normalizedCommand = normalizeBanCommandName(rawCommand);
  if (!normalizedCommand) return { removed: false, normalizedCommand: "" };

  const keys = getUserIdentifierKeys(targetJid);
  const canonicalKey = cleanJid(targetJid);

  let removed = false;
  for (const key of keys) {
    const set = bansByTarget.get(key);
    if (set && set.has(normalizedCommand)) {
      set.delete(normalizedCommand);
      removed = true;
    }
  }

  saveFallbackFile();

  try {
    await prisma.$executeRaw`
      DELETE FROM user_command_bans
      WHERE user_jid = ${canonicalKey} AND command = ${normalizedCommand}
    `;
  } catch (err: any) {
    console.warn("[Command Ban] Error eliminando ban de la base de datos:", err?.message || err);
  }

  return { removed, normalizedCommand };
}

/**
 * Comprueba si un usuario tiene restringido algún comando de la lista proporcionada.
 */
export function isUserCommandBanned(userJid: string, ...commands: (string | undefined | null)[]): boolean {
  if (!userJid) return false;
  const keys = getUserIdentifierKeys(userJid);

  for (const rawCmd of commands) {
    if (!rawCmd) continue;
    const norm = normalizeBanCommandName(rawCmd);
    if (!norm) continue;

    for (const key of keys) {
      const set = bansByTarget.get(key);
      if (set && set.has(norm)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Retorna la lista de comandos baneados para un usuario.
 */
export function getUserBannedCommands(userJid: string): string[] {
  if (!userJid) return [];
  const keys = getUserIdentifierKeys(userJid);
  const allBanned = new Set<string>();

  for (const key of keys) {
    const set = bansByTarget.get(key);
    if (set) {
      for (const cmd of set) {
        allBanned.add(cmd);
      }
    }
  }

  return Array.from(allBanned);
}
