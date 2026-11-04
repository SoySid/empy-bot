/**
 * Servicio centralizado de cooldowns para minijuegos arcade de Empy-Bot.
 * Evita el spam continuo de partidas consecutivas en los grupos.
 */

const groupGameCooldowns = new Map<string, number>();
const DEFAULT_GROUP_COOLDOWN_MS = Number(process.env.GAME_COOLDOWN_MS) || 120 * 1000; // 120 segundos de cooldown entre partidas (configurable)

export function checkGameCooldown(remoteJid: string): { canStart: boolean; remainingSeconds: number } {
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
