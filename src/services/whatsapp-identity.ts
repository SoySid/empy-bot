import type { proto, WASocket, GroupMetadata } from "@whiskeysockets/baileys";
import { prisma, withWriteLock } from "./db/prisma.js";

// Caché en RAM para mapeo rápido LID <-> Teléfono
export const ramLidToPhoneMap = new Map<string, string>();
export const ramPhoneToLidMap = new Map<string, string>();

/**
 * Limpia un JID eliminando sufijos de dispositivo (:12, etc.)
 */
export function cleanJid(rawJid?: string | null): string {
  if (!rawJid) return "";
  const parts = rawJid.split("@");
  const user = (parts[0] || "").split(":")[0];
  const server = parts[1] || "";
  return `${user}@${server}`.trim();
}

/**
 * Normaliza cualquier texto para comparación insensible a acentos, mayúsculas y símbolos
 */
export function normalizeEntityName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Determina si un JID o número corresponde a un LID interno de WhatsApp
 */
export function isLidIdentifier(jidOrNumber: string): boolean {
  if (!jidOrNumber) return false;
  if (jidOrNumber.endsWith("@lid")) return true;
  const digits = jidOrNumber.split("@")[0].replace(/\D/g, "");
  // Los números de teléfono reales tienen entre 10 y 13 dígitos; los LIDs típicamente >= 14
  return digits.length >= 14;
}

/**
 * Extrae los dígitos numéricos puros de un JID o teléfono
 */
export function extractDigits(jidOrNumber: string): string {
  if (!jidOrNumber) return "";
  return jidOrNumber.split("@")[0].replace(/\D/g, "");
}

/**
 * Carga los mapeos persistentes de LID en RAM al iniciar el bot
 */
export async function loadLidMappingsToRam(): Promise<number> {
  try {
    const mappings = await prisma.lidMapping.findMany();
    ramLidToPhoneMap.clear();
    ramPhoneToLidMap.clear();

    for (const m of mappings) {
      ramLidToPhoneMap.set(m.lid, m.phoneJid);
      ramLidToPhoneMap.set(extractDigits(m.lid), m.phoneJid);
      ramPhoneToLidMap.set(m.phoneJid, m.lid);
      ramPhoneToLidMap.set(m.phoneNumber, m.lid);
    }

    // Cargar también de perfiles que tengan LID y teléfono real
    const profiles = await prisma.userProfile.findMany({
      where: {
        lid: { not: null },
        phone: { not: { startsWith: "lid_" } },
      },
    });

    for (const p of profiles) {
      if (p.lid && p.phone && !isLidIdentifier(p.phone)) {
        const canonicalPhoneJid = `${p.phone}@s.whatsapp.net`;
        ramLidToPhoneMap.set(p.lid, canonicalPhoneJid);
        ramLidToPhoneMap.set(extractDigits(p.lid), canonicalPhoneJid);
        ramPhoneToLidMap.set(canonicalPhoneJid, p.lid);
        ramPhoneToLidMap.set(p.phone, p.lid);
      }
    }

    console.log(`[Identity] 📇 ${mappings.length} mappings en tabla + ${profiles.length} perfiles sincronizados en RAM.`);
    return ramLidToPhoneMap.size;
  } catch (error) {
    console.error("[Identity] Error cargando LidMappings:", error);
    return 0;
  }
}

/**
 * Registra o actualiza de forma persistente el vínculo entre un LID y un teléfono real
 */
export async function registerLidMapping(
  rawLid: string,
  rawPhoneJid: string
): Promise<void> {
  const cleanLid = cleanJid(rawLid);
  const cleanPhone = cleanJid(rawPhoneJid);
  const phoneDigits = extractDigits(cleanPhone);
  const lidDigits = extractDigits(cleanLid);

  if (!cleanLid.endsWith("@lid") && !isLidIdentifier(lidDigits)) return;
  if (!cleanPhone.endsWith("@s.whatsapp.net") && !phoneDigits) return;

  const canonicalLid = cleanLid.endsWith("@lid") ? cleanLid : `${lidDigits}@lid`;
  const canonicalPhoneJid = cleanPhone.endsWith("@s.whatsapp.net") ? cleanPhone : `${phoneDigits}@s.whatsapp.net`;

  ramLidToPhoneMap.set(canonicalLid, canonicalPhoneJid);
  ramLidToPhoneMap.set(lidDigits, canonicalPhoneJid);
  ramPhoneToLidMap.set(canonicalPhoneJid, canonicalLid);
  ramPhoneToLidMap.set(phoneDigits, canonicalLid);

  try {
    await withWriteLock(async () => {
      await prisma.lidMapping.upsert({
        where: { lid: canonicalLid },
        update: {
          phoneJid: canonicalPhoneJid,
          phoneNumber: phoneDigits,
        },
        create: {
          lid: canonicalLid,
          phoneJid: canonicalPhoneJid,
          phoneNumber: phoneDigits,
        },
      });
    });
  } catch (err) {
    console.warn(`[Identity] No se pudo persistir LidMapping (${canonicalLid} -> ${canonicalPhoneJid}):`, err);
  }
}

/**
 * Resuelve un JID (sea LID o teléfono) a su JID canónico de WhatsApp (@s.whatsapp.net)
 */
export async function resolveToCanonicalJid(rawJid: string): Promise<string> {
  const cleaned = cleanJid(rawJid);
  if (!cleaned) return "";

  if (cleaned.endsWith("@s.whatsapp.net")) {
    return cleaned;
  }

  const digits = extractDigits(cleaned);

  // 1. Consultar caché en RAM
  if (ramLidToPhoneMap.has(cleaned)) {
    return ramLidToPhoneMap.get(cleaned)!;
  }
  if (ramLidToPhoneMap.has(digits)) {
    return ramLidToPhoneMap.get(digits)!;
  }

  // 2. Consultar base de datos
  try {
    const mapping = await prisma.lidMapping.findFirst({
      where: {
        OR: [{ lid: cleaned }, { lid: `${digits}@lid` }],
      },
    });

    if (mapping) {
      ramLidToPhoneMap.set(cleaned, mapping.phoneJid);
      ramLidToPhoneMap.set(digits, mapping.phoneJid);
      return mapping.phoneJid;
    }
  } catch (error) {
    console.error(`[Identity] Error resolviendo LID ${cleaned} en DB:`, error);
  }

  // Si no es un LID y tiene longitud de teléfono, asumir @s.whatsapp.net
  if (!isLidIdentifier(digits) && digits.length >= 10 && digits.length <= 13) {
    return `${digits}@s.whatsapp.net`;
  }

  return cleaned;
}

/**
 * Extrae el autor canónico de un mensaje de Baileys, normalizando LIDs hacia teléfono
 */
export async function extractMessageAuthor(msg: proto.IWebMessageInfo): Promise<{
  rawSender: string;
  canonicalJid: string;
  phoneDigits: string;
  isLid: boolean;
}> {
  const rawKey = msg.key;
  const rawSender = cleanJid(rawKey?.participant || rawKey?.remoteJid || "");
  const isLid = isLidIdentifier(rawSender);
  const canonicalJid = await resolveToCanonicalJid(rawSender);
  const phoneDigits = extractDigits(canonicalJid);

  return {
    rawSender,
    canonicalJid,
    phoneDigits,
    isLid,
  };
}

/**
 * Formatea una mención nativa para WhatsApp:
 * WhatsApp requiere que en el texto figure '@<numero>' (sin @s.whatsapp.net)
 * y que en el array 'mentions' viaje '<numero>@s.whatsapp.net'.
 */
export function formatNativeMention(phoneOrJid: string): {
  mentionText: string;
  mentionJid: string;
  mentionJids: string[];
} {
  const cleaned = cleanJid(phoneOrJid);
  const lidDigits = extractDigits(cleaned);
  const mappedPhoneJid =
    ramLidToPhoneMap.get(cleaned) ||
    ramLidToPhoneMap.get(lidDigits) ||
    ramLidToPhoneMap.get(`${lidDigits}@lid`) ||
    cleaned;

  const digits = extractDigits(mappedPhoneJid);
  const mentionJid = `${digits}@s.whatsapp.net`;
  const mentionText = `@${digits}`;

  const mentionsSet = new Set<string>();
  if (mentionJid) mentionsSet.add(mentionJid);

  // Variaciones para números de Argentina (con y sin prefijo móvil 9)
  if (digits.startsWith("549") && digits.length === 13) {
    const without9 = "54" + digits.slice(3);
    mentionsSet.add(`${without9}@s.whatsapp.net`);
  } else if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    const with9 = "549" + digits.slice(2);
    mentionsSet.add(`${with9}@s.whatsapp.net`);
  }

  // Si tiene LID mapeado en RAM, añadirlo también
  const lid = ramPhoneToLidMap.get(mappedPhoneJid) || ramPhoneToLidMap.get(digits);
  if (lid) mentionsSet.add(lid);
  if (cleaned.endsWith("@lid")) mentionsSet.add(cleaned);

  return { mentionText, mentionJid, mentionJids: Array.from(mentionsSet) };
}

/**
 * Normaliza un JID a su representación de teléfono o LID limpio
 */
export function normalizeToPhoneJid(rawJid?: string | null): string {
  if (!rawJid) return "";
  const cleaned = cleanJid(rawJid);
  if (cleaned.endsWith("@g.us")) return cleaned;
  if (cleaned.endsWith("@s.whatsapp.net")) return cleaned;
  if (cleaned.endsWith("@lid")) {
    const digits = extractDigits(cleaned);
    const mapped = ramLidToPhoneMap.get(cleaned) || (digits ? ramLidToPhoneMap.get(digits) : undefined);
    if (mapped) return mapped;
    return cleaned;
  }
  const digits = extractDigits(cleaned);
  return digits ? `${digits}@s.whatsapp.net` : cleaned;
}

/**
 * Convierte un array de JIDs o teléfonos en una cadena formateada de menciones (@123 @456)
 */
export function formatMentionTags(jids: string[]): string {
  return jids
    .filter(Boolean)
    .map((jid) => {
      const { mentionText } = formatNativeMention(jid);
      return mentionText;
    })
    .join(" ");
}

/**
 * Comprueba si un JID de participante corresponde al bot (compara teléfono, LID y mappings)
 */
export function isBotJid(sock: any, participantJid: string): boolean {
  if (!participantJid || !sock?.user) return false;
  const pClean = cleanJid(participantJid);
  const pDigits = extractDigits(pClean);

  const botPhone = cleanJid(sock.user?.id);
  const botPhoneDigits = extractDigits(botPhone);
  const botLid = cleanJid(sock.user?.lid);
  const botLidDigits = extractDigits(botLid);

  if (botPhoneDigits && pDigits === botPhoneDigits) return true;
  if (botLidDigits && pDigits === botLidDigits) return true;
  if (botPhone && pClean === botPhone) return true;
  if (botLid && pClean === botLid) return true;

  const mapped = ramLidToPhoneMap.get(pClean) || ramLidToPhoneMap.get(pDigits);
  if (mapped && extractDigits(mapped) === botPhoneDigits) return true;

  return false;
}

/**
 * Busca un participante en la lista de groupMetadata tolerando formatos LID o Teléfono
 */
export function findGroupParticipant(
  participants: Array<{ id: string; admin?: string | null }>,
  userJidOrPhone: string
): { id: string; admin?: string | null } | undefined {
  if (!userJidOrPhone || !participants || !participants.length) return undefined;
  const targetClean = cleanJid(userJidOrPhone);
  const targetDigits = extractDigits(targetClean);

  return participants.find((p) => {
    const pClean = cleanJid(p.id);
    const pDigits = extractDigits(pClean);
    if (pDigits && pDigits === targetDigits) return true;
    if (pClean && pClean === targetClean) return true;

    const mapped = ramLidToPhoneMap.get(pClean) || ramLidToPhoneMap.get(pDigits);
    if (mapped && extractDigits(mapped) === targetDigits) return true;

    const mappedTarget = ramLidToPhoneMap.get(targetClean) || ramLidToPhoneMap.get(targetDigits);
    if (mappedTarget && extractDigits(mappedTarget) === pDigits) return true;

    return false;
  });
}

export const GROUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de validez en memoria
export const groupMetadataCache = new Map<string, { data: GroupMetadata; timestamp: number }>();

export function invalidateGroupMetadataCache(jid?: string): void {
  if (jid) {
    groupMetadataCache.delete(jid);
  } else {
    groupMetadataCache.clear();
  }
}

export async function getCachedGroupMetadata(sock: WASocket, jid: string): Promise<GroupMetadata> {
  const entry = groupMetadataCache.get(jid);
  const now = Date.now();
  if (entry && now - entry.timestamp < GROUP_CACHE_TTL_MS) {
    return entry.data;
  }
  const data = await sock.groupMetadata(jid);
  groupMetadataCache.set(jid, { data, timestamp: now });
  return data;
}

/**
 * Obtiene el conjunto de JIDs válidos (LIDs y números canónicos) de los participantes de un grupo.
 */
export async function getGroupParticipantJidSet(sock: WASocket, remoteJid: string): Promise<string[] | undefined> {
  if (!remoteJid.endsWith("@g.us")) return undefined;
  const groupMeta = await getCachedGroupMetadata(sock, remoteJid).catch(() => null);
  if (!groupMeta?.participants) return undefined;

  const jidsSet = new Set<string>();
  for (const p of groupMeta.participants) {
    jidsSet.add(p.id);
    const digits = extractDigits(p.id);
    if (digits) jidsSet.add(`${digits}@s.whatsapp.net`);
    const mappedPhone = ramLidToPhoneMap.get(p.id);
    if (mappedPhone) jidsSet.add(mappedPhone);
    const mappedLid = ramPhoneToLidMap.get(p.id);
    if (mappedLid) jidsSet.add(mappedLid);
  }
  return Array.from(jidsSet);
}

