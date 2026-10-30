import { prisma, withWriteLock } from "../db/prisma.js";
import { modifyBalance } from "../economy.service.js";

export interface BossDefinition {
  id: string;
  name: string;
  icon: string;
  maxHp: number;
  description: string;
}

export const BOSS_ROSTER: BossDefinition[] = [
  {
    id: "pombero",
    name: "El Pombero Enfurecido",
    icon: "👹",
    maxHp: 3500,
    description: "Espíritu de la siesta armado con una rama de timbó y silbidos ensordecedores.",
  },
  {
    id: "dragon_conurbano",
    name: "El Dragón del Conurbano",
    icon: "🐉",
    maxHp: 4500,
    description: "Bestia con alas de chapa acanalada que escupe llamaradas de nafta súper.",
  },
  {
    id: "afip_cosmico",
    name: "El Inspector de AFIP Cósmico",
    icon: "👽",
    maxHp: 5000,
    description: "Ente burocrático interdimensional que te quiere embargar hasta el alma.",
  },
  {
    id: "llorona_zanja",
    name: "La Llorona de la Zanja",
    icon: "👻",
    maxHp: 3000,
    description: "Alma en pena del zanjón municipal que aturde con sus lamentos desgarradores.",
  },
  {
    id: "piquetero_intergalactico",
    name: "El Piquetero Intergaláctico",
    icon: "🚩",
    maxHp: 4200,
    description: "Cortó la órbita terrestre con cubiertas espaciales humeantes y redoblantes.",
  },
];

export interface PlayerDamage {
  jid: string;
  name: string;
  damage: number;
  lastAttack: number;
}

export interface ActiveBossRaid {
  remoteJid: string;
  boss: BossDefinition;
  currentHp: number;
  poolReward: number;
  players: Map<string, PlayerDamage>;
  startedAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeBossRaids = new Map<string, ActiveBossRaid>();
const PLAYER_ATTACK_COOLDOWN_MS = 10 * 1000; // 10 segundos entre golpes por jugador

export function renderHpBar(current: number, max: number): string {
  const percent = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  const totalBlocks = 10;
  const filledBlocks = Math.round((percent / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return `[${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)}] ${percent}% (${Math.max(0, current)}/${max} HP)`;
}

export function isBossRaidActive(remoteJid: string): boolean {
  return activeBossRaids.has(remoteJid);
}

export function getActiveBoss(remoteJid: string): ActiveBossRaid | undefined {
  return activeBossRaids.get(remoteJid);
}

export async function startBossRaid(
  remoteJid: string,
  onTimeout: (raid: ActiveBossRaid) => Promise<void>
): Promise<{ success: boolean; error?: string; raid?: ActiveBossRaid }> {
  if (activeBossRaids.has(remoteJid)) {
    const existing = activeBossRaids.get(remoteJid)!;
    return {
      success: false,
      error: `⚠️ Ya hay un combate activo contra *${existing.boss.name}*!\n${renderHpBar(existing.currentHp, existing.boss.maxHp)}\n¡Usen \`!atacar\` para bajarlo!`,
    };
  }

  const boss = BOSS_ROSTER[Math.floor(Math.random() * BOSS_ROSTER.length)];
  const poolReward = Math.floor(Math.random() * 5001) + 15000; // $15.000 a $20.000 fichas

  const raid: ActiveBossRaid = {
    remoteJid,
    boss,
    currentHp: boss.maxHp,
    poolReward,
    players: new Map(),
    startedAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos de combate
    timer: setTimeout(() => {
      const current = activeBossRaids.get(remoteJid);
      if (current) {
        activeBossRaids.delete(remoteJid);
        onTimeout(current).catch(() => {});
      }
    }, 5 * 60 * 1000),
  };

  activeBossRaids.set(remoteJid, raid);

  return { success: true, raid };
}

export interface AttackResult {
  success: boolean;
  error?: string;
  damageDealt?: number;
  isCrit?: boolean;
  bossDefeated?: boolean;
  bossName?: string;
  hpBar?: string;
  payouts?: { jid: string; name: string; amount: number; isFinisher?: boolean }[];
  totalPool?: number;
}

export async function attackBoss(
  remoteJid: string,
  userJid: string,
  userName: string
): Promise<AttackResult> {
  const raid = activeBossRaids.get(remoteJid);
  if (!raid) {
    return {
      success: false,
      error: "❌ No hay ningún Boss activo en este grupo. Podés invocar uno con `!boss`.",
    };
  }

  const now = Date.now();
  let player = raid.players.get(userJid);
  if (!player) {
    player = { jid: userJid, name: userName, damage: 0, lastAttack: 0 };
    raid.players.set(userJid, player);
  }

  const elapsed = now - player.lastAttack;
  if (elapsed < PLAYER_ATTACK_COOLDOWN_MS) {
    const remaining = Math.ceil((PLAYER_ATTACK_COOLDOWN_MS - elapsed) / 1000);
    return {
      success: false,
      error: `⏳ *Esperá el aliento:* Estás recuperando energía. Podés volver a golpear en *${remaining}s*.`,
    };
  }

  player.lastAttack = now;

  // Calcular daño: base 180 a 420. Chance de crítico (20%): x1.8
  const baseDamage = Math.floor(Math.random() * 241) + 180;
  const isCrit = Math.random() < 0.2;
  const finalDamage = isCrit ? Math.round(baseDamage * 1.8) : baseDamage;

  player.damage += finalDamage;
  raid.currentHp -= finalDamage;

  // Si el boss sigue con vida
  if (raid.currentHp > 0) {
    return {
      success: true,
      damageDealt: finalDamage,
      isCrit,
      bossDefeated: false,
      bossName: raid.boss.name,
      hpBar: renderHpBar(raid.currentHp, raid.boss.maxHp),
    };
  }

  // ¡Boss derrotado!
  clearTimeout(raid.timer);
  activeBossRaids.delete(remoteJid);

  // Calcular repartija de botín ($15.000 a $20.000):
  // 25% para el golpe de gracia (finisher)
  // 75% proporcional al daño causado por cada participante
  const totalDamageDealt = Array.from(raid.players.values()).reduce((acc, p) => acc + p.damage, 0);
  const finisherBonus = Math.round(raid.poolReward * 0.25);
  const sharedPool = raid.poolReward - finisherBonus;

  const payouts: { jid: string; name: string; amount: number; isFinisher?: boolean }[] = [];

  for (const p of raid.players.values()) {
    const share = totalDamageDealt > 0 ? Math.round((p.damage / totalDamageDealt) * sharedPool) : 0;
    const isFinisher = p.jid === userJid;
    const totalAward = isFinisher ? share + finisherBonus : share;

    if (totalAward > 0) {
      payouts.push({
        jid: p.jid,
        name: p.name,
        amount: totalAward,
        isFinisher,
      });

      // Acreditar fichas
      await modifyBalance(p.jid, totalAward).catch((e) => console.error(`[Boss Payout Error for ${p.jid}]:`, e));
    }
  }

  // Ordenar por premio descendente
  payouts.sort((a, b) => b.amount - a.amount);

  return {
    success: true,
    damageDealt: finalDamage,
    isCrit,
    bossDefeated: true,
    bossName: raid.boss.name,
    payouts,
    totalPool: raid.poolReward,
  };
}
