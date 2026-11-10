import { isBotOwner } from "../admin-economy.service.js";

/**
 * Servicio centralizado de cooldowns para minijuegos arcade de Empy-Bot.
 * Evita el spam continuo de partidas consecutivas en los grupos.
 * El creador/owner del bot cuenta con bypass total de enfriamiento.
 */

const groupGameCooldowns = new Map<string, number>();
const DEFAULT_GROUP_COOLDOWN_MS = Number(process.env.GAME_COOLDOWN_MS) || 120 * 1000; // 120 segundos de cooldown entre partidas (configurable)

export function checkGameCooldown(
  remoteJid: string,
  senderProfile?: { role?: string; phone?: string | null; jid?: string; lid?: string | null } | null,
  senderJid?: string
): { canStart: boolean; remainingSeconds: number } {
  const effectiveJid = senderJid || senderProfile?.jid;
  if (isBotOwner(senderProfile, effectiveJid)) {
    return { canStart: true, remainingSeconds: 0 };
  }

  const now = Date.now();
  const endsAt = groupGameCooldowns.get(remoteJid) || 0;
  if (now < endsAt) {
    return {
      canStart: false,
      remainingSeconds: Math.ceil((endsAt - now) / 1000),
    };
  }
  return { canStart: true, remainingSeconds: 0 };
}

export function setGameCooldown(remoteJid: string, durationMs: number = DEFAULT_GROUP_COOLDOWN_MS): void {
  groupGameCooldowns.set(remoteJid, Date.now() + durationMs);
}

export function clearGameCooldown(remoteJid: string): void {
  groupGameCooldowns.delete(remoteJid);
}
