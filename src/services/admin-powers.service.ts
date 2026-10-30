import { WASocket } from "@whiskeysockets/baileys";
import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser } from "./db/user.service.js";
import {
  isBotJid,
  findGroupParticipant,
  getCachedGroupMetadata,
} from "./whatsapp-identity.js";
import { isBotOwner } from "./admin-economy.service.js";

// Estado en memoria de silencios activos por grupo con timestamp de expiración
interface ActiveMuteEntry {
  timer: NodeJS.Timeout;
  unmuteAt: number;
}
const activeMutes = new Map<string, ActiveMuteEntry>();

/**
 * Reabre de emergencia los chats silenciados (al apagar o reiniciar el bot).
 */
export async function restoreGroupMutes(sock: WASocket): Promise<void> {
  for (const [remoteJid, entry] of activeMutes.entries()) {
    try {
      if (entry.timer) clearTimeout(entry.timer);
      await sock.groupSettingUpdate(remoteJid, "not_announcement");
      console.log(`[Admin Powers] 🔓 Reabierto chat de emergencia ${remoteJid}`);
    } catch (err) {
      console.error(`[Admin Powers] Error reabriendo ${remoteJid}:`, err);
    }
  }
  activeMutes.clear();
}

/**
 * Comprueba si el bot tiene rol de Administrador en el grupo (reconoce tanto LID como teléfono).
 */
export async function isBotAdminInGroup(sock: WASocket, remoteJid: string): Promise<boolean> {
  try {
    const groupMeta = await getCachedGroupMetadata(sock, remoteJid);
    const botParticipant = groupMeta.participants.find((p) => isBotJid(sock, p.id));
    return (
      botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin"
    );
  } catch (err) {
    console.error("[isBotAdminInGroup Error]:", err);
    return false;
  }
}

/**
 * Silencia el grupo temporalmente durante X minutos por fichas (Solo Administradores o Creador).
 * Costo: $2,600 por 1 min (+$1,150 por min adicional, máx 5 min).
 */
export async function muteGroupForCash(
  sock: WASocket,
  remoteJid: string,
  requesterJid: string,
  requestedMinutes: number
): Promise<{
  success: boolean;
  error?: string;
  minutes?: number;
  cost?: number;
  newBalance?: number;
}> {
  if (!remoteJid.endsWith("@g.us")) {
    return { success: false, error: "Este comando solo funciona en grupos de WhatsApp." };
  }

  const groupMeta = await getCachedGroupMetadata(sock, remoteJid);
  const participant = findGroupParticipant(groupMeta.participants, requesterJid);
  const isRequesterAdmin =
    participant?.admin === "admin" ||
    participant?.admin === "superadmin" ||
    isBotOwner(null, requesterJid);

  if (!isRequesterAdmin) {
    return {
      success: false,
      error: "❌ Solo los Administradores del grupo (o el Creador) pueden silenciar el chat.",
    };
  }

  const minutes = Math.max(1, Math.min(5, Math.floor(requestedMinutes || 1)));
  const cost = 35000 + (minutes - 1) * 15000;

  const isBotAdmin = await isBotAdminInGroup(sock, remoteJid);
  if (!isBotAdmin) {
    return {
      success: false,
      error: "❌ El bot necesita ser Administrador del grupo para poder silenciar el chat. Asegurate de darle rango de admin.",
    };
  }

  const user = await resolveOrRegisterUser(requesterJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    if (current.balance < cost) {
      return {
        success: false,
        error: `Saldo insuficiente. Silenciar el grupo por *${minutes} minuto(s)* cuesta *$${cost}* fichas (tu saldo: *$${current.balance}*).`,
      };
    }

    // Descontar fichas
    const updated = await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: { decrement: cost } },
    });

    try {
      // Poner solo administradores
      await sock.groupSettingUpdate(remoteJid, "announcement");

      // Cancelar temporizador previo si existía
      const existingEntry = activeMutes.get(remoteJid);
      if (existingEntry?.timer) clearTimeout(existingEntry.timer);

      // Programar reapertura
      const timer = setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(remoteJid, "not_announcement");
          await sock.sendMessage(remoteJid, {
            text: "🔓 *¡CHAT REABIERTO!* Finalizó el tiempo de silencio comprado. Ya pueden escribir libremente de nuevo.",
          });
        } catch (unmuteErr) {
          console.error("[Unmute Execution Error]:", unmuteErr);
        } finally {
          activeMutes.delete(remoteJid);
        }
      }, minutes * 60 * 1000);

      activeMutes.set(remoteJid, { timer, unmuteAt: Date.now() + minutes * 60 * 1000 });

      return {
        success: true,
        minutes,
        cost,
        newBalance: updated.balance,
      };
    } catch (err: any) {
      // Revertir cobro en caso de error Baileys
      await prisma.userProfile.update({
        where: { id: user.id },
        data: { balance: { increment: cost } },
      });
      return {
        success: false,
        error: `Error al cambiar los ajustes del grupo: ${err.message || err}`,
      };
    }
  });
}



/**
 * Permite cambiar el nombre del grupo por $4,300 fichas (Solo Administradores o Creador).
 */
export async function changeGroupNameForCash(
  sock: WASocket,
  remoteJid: string,
  requesterJid: string,
  rawName: string
): Promise<{
  success: boolean;
  error?: string;
  cost?: number;
  newName?: string;
  newBalance?: number;
}> {
  if (!remoteJid.endsWith("@g.us")) {
    return { success: false, error: "Este comando solo funciona en grupos de WhatsApp." };
  }

  const groupMeta = await getCachedGroupMetadata(sock, remoteJid);
  const participant = findGroupParticipant(groupMeta.participants, requesterJid);
  const isRequesterAdmin =
    participant?.admin === "admin" ||
    participant?.admin === "superadmin" ||
    isBotOwner(null, requesterJid);

  if (!isRequesterAdmin) {
    return {
      success: false,
      error: "❌ Solo los Administradores del grupo (o el Creador) pueden cambiar el nombre del grupo.",
    };
  }

  const cleanName = rawName.trim().slice(0, 25);
  if (!cleanName || cleanName.length < 2) {
    return {
      success: false,
      error: "El nuevo nombre del grupo debe tener entre 2 y 25 caracteres.",
    };
  }

  const COST = 100000;
  const user = await resolveOrRegisterUser(requesterJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

    if (current.balance < COST) {
      return {
        success: false,
        error: `Renombrar el grupo cuesta *$${COST}* fichas (tu saldo: *$${current.balance}*).`,
      };
    }

    try {
      await sock.groupUpdateSubject(remoteJid, cleanName);

      const updated = await prisma.userProfile.update({
        where: { id: user.id },
        data: { balance: { decrement: COST } },
      });

      return {
        success: true,
        cost: COST,
        newName: cleanName,
        newBalance: updated.balance,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `No se pudo cambiar el nombre del grupo. Asegurate de que el bot sea Administrador o que los miembros tengan permiso para editar la info del grupo.`,
      };
    }
  });
}
