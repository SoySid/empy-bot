import crypto from "crypto";
import { prisma } from "./db/prisma.js";

// Cache en memoria de voces personalizadas (nombre -> referenceId)
const customVoicesCache = new Map<string, string>();

export function getCustomVoicesMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of customVoicesCache.entries()) {
    result[k] = v;
  }
  return result;
}

export async function initCustomVoicesTable(): Promise<void> {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "CustomVoice" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "referenceId" TEXT NOT NULL,
        "addedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "CustomVoice_name_idx" ON "CustomVoice"("name")
    `;
  } catch (err: any) {
    console.warn("[Voice Service] No se pudo verificar la tabla CustomVoice:", err?.message || err);
  }
}

export async function syncCustomVoicesFromDb(
  onVoiceLoaded?: (name: string, referenceId: string) => void
): Promise<void> {
  try {
    await initCustomVoicesTable();
    const rows = await prisma.customVoice.findMany({
      select: { name: true, referenceId: true },
    });

    if (!rows || rows.length === 0) return;

    for (const row of rows) {
      const cleanName = row.name.toLowerCase().trim();
      const refId = row.referenceId?.trim();
      if (cleanName && refId) {
        customVoicesCache.set(cleanName, refId);
        if (onVoiceLoaded) {
          onVoiceLoaded(cleanName, refId);
        }
      }
    }
    console.log(`[Voice Service] 🎙️ Sincronizadas ${rows.length} voces personalizadas desde la base de datos.`);
  } catch (err: any) {
    console.error("[Voice Service] Error sincronizando voces desde PostgreSQL:", err?.message || err);
  }
}

export async function saveCustomVoice(params: {
  name: string;
  referenceId: string;
  addedBy?: string;
}): Promise<{ success: boolean; voiceName?: string; error?: string }> {
  try {
    const cleanName = params.name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]/g, "");

    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "El nombre de la voz debe tener al menos 2 caracteres alfanuméricos." };
    }

    const cleanRefId = params.referenceId
      .trim()
      .replace(/^[(\[<"']+|[)\]>"']+$/g, "")
      .trim();

    if (!cleanRefId) {
      return { success: false, error: "El código / ID de Fish Audio no puede estar vacío." };
    }

    const id = crypto.randomUUID();
    await prisma.customVoice.upsert({
      where: { name: cleanName },
      create: {
        id,
        name: cleanName,
        referenceId: cleanRefId,
        addedBy: params.addedBy || "creador",
      },
      update: {
        referenceId: cleanRefId,
        addedBy: params.addedBy || "creador",
        updatedAt: new Date(),
      },
    });

    customVoicesCache.set(cleanName, cleanRefId);
    return { success: true, voiceName: cleanName };
  } catch (err: any) {
    console.error("[Voice Service] Error guardando voz:", err);
    return { success: false, error: err?.message || "Error al persistir la voz" };
  }
}

export async function deleteCustomVoice(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanName = name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]/g, "");

    const result = await prisma.customVoice.deleteMany({
      where: { name: cleanName },
    });

    customVoicesCache.delete(cleanName);

    if (result.count === 0) {
      return { success: false, error: `No se encontró ninguna voz personalizada llamada "${cleanName}".` };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Voice Service] Error eliminando voz:", err);
    return { success: false, error: err?.message || "Error al eliminar la voz" };
  }
}

export async function getAllCustomVoices(): Promise<Array<{ name: string; referenceId: string; addedBy?: string | null }>> {
  try {
    const rows = await prisma.customVoice.findMany({
      select: { name: true, referenceId: true, addedBy: true },
      orderBy: { name: "asc" },
    });
    return rows || [];
  } catch (err: any) {
    return Array.from(customVoicesCache.entries()).map(([name, referenceId]) => ({ name, referenceId }));
  }
}
