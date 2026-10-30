import { WASocket } from "@whiskeysockets/baileys";
import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser, updateCachedUser } from "./db/user.service.js";
import { formatNativeMention, isBotJid, findGroupParticipant } from "./whatsapp-identity.js";
import { isBotAdminInGroup } from "./admin-powers.service.js";


/**
 * Renderiza una barra visual de energía/hambre (0 a 100%).
 * Ejemplo: [🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜] 60%
 */
export function renderHungerBar(hunger: number): string {
  const clamped = Math.max(0, Math.min(100, hunger));
  const totalBlocks = 10;
  const filledBlocks = Math.round((clamped / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;

  let fillChar = "🟩";
  if (clamped <= 15) {
    fillChar = "🟥";
  } else if (clamped <= 40) {
    fillChar = "🟨";
  }

  const bar = fillChar.repeat(filledBlocks) + "⬜".repeat(emptyBlocks);
  return `[${bar}] ${clamped}%`;
}

// Contador en memoria para espaciar el desgaste de energía por mensajes de chat
const userMessageCountsForHunger = new Map<string, number>();
const MESSAGES_PER_HUNGER_DRAIN = 4; // Cada 4 mensajes se descuenta solo 1 punto

/**
 * Consume energía/hambre cuando un usuario habla en el grupo.
 * Si la energía cae a <= 15%, envía una alerta pública de riesgo de desnutrición.
 * Si llega a 0%, intercepta y borra los mensajes hasta que el usuario coma.
 */
export async function consumeHungerOnMessage(
  sock: WASocket,
  remoteJid: string,
  userOrJid: any
): Promise<void> {
  // Solo aplica a grupos de WhatsApp
  if (!remoteJid.endsWith("@g.us")) return;

  const userJid = typeof userOrJid === "object" && userOrJid?.jid ? userOrJid.jid : userOrJid;

  // Desgaste moderado: 1 punto de energía cada 4 mensajes del usuario
  const currentCount = (userMessageCountsForHunger.get(userJid) || 0) + 1;
  if (currentCount < MESSAGES_PER_HUNGER_DRAIN) {
    userMessageCountsForHunger.set(userJid, currentCount);
    return;
  }
  userMessageCountsForHunger.set(userJid, 0);
  if (userMessageCountsForHunger.size > 2000) {
    userMessageCountsForHunger.clear();
  }

  try {
    const current = typeof userOrJid === "object" && userOrJid?.id
      ? userOrJid
      : await resolveOrRegisterUser(userJid);

    if (!current) return;

    // Reducción por lote de mensajes: 1 punto de energía (nerfeado a pedido)
    const currentHunger = typeof current.hunger === "number" ? current.hunger : 85;
    const newHunger = Math.max(0, currentHunger - 1);
    current.hunger = newHunger;
    updateCachedUser(current.jid, { hunger: newHunger });

    // Caso 1: Muerte e inanición (0%)
    if (newHunger <= 0) {
      await handleStarvationCollapse(sock, remoteJid, current);
      return;
    }

    // Caso 2: Alerta crítica (<= 15%) y no se había advertido aún
    if (newHunger <= 15 && !current.hungerWarningSent) {
      current.hungerWarningSent = true;
      updateCachedUser(current.jid, { hunger: newHunger, hungerWarningSent: true });

      await (prisma.userProfile as any).update({
        where: { id: current.id },
        data: {
          hunger: newHunger,
          hungerWarningSent: true,
        },
      });

      const userMention = formatNativeMention(current.jid);
      const bar = renderHungerBar(newHunger);

      const alertMsg =
        `⚠️ *¡ALERTA ROJA DE DESNUTRICIÓN!* ⚠️\n\n` +
        `Ojo ${userMention.mentionText}, tu barra de energía cayó al nivel crítico:\n` +
        `🔋 *Energía:* ${bar}\n\n` +
        `💀 *Peligro:* Si no comés algo urgente y llegás a *0%*, te vas a desmayar y el bot te va a borrar los mensajes hasta que comas.\n\n` +
        `👉 *¡Comé ya!* Tirá \`!comer\` o \`!tienda\` para recuperar vida.`;

      await sock.sendMessage(remoteJid, {
        text: alertMsg,
        mentions: [userMention.mentionJid],
      });
      return;
    }

    // Actualización regular silenciosa
    await (prisma.userProfile as any).update({
      where: { id: current.id },
      data: { hunger: newHunger },
    });
  } catch (err) {
    console.error("[Hunger System Error]:", err);
  }
}

// Cooldown en memoria para no spammear advertencias de borrado al mismo usuario
const lastStarvationDeleteWarning = new Map<string, number>();

/**
 * Notifica el colapso del usuario al llegar a 0% de energía sin expulsarlo de WhatsApp.
 */
async function handleStarvationCollapse(
  sock: WASocket,
  remoteJid: string,
  user: { id: string; jid: string; primaryName: string; hungerWarningSent?: boolean; hunger?: number }
): Promise<void> {
  const userMention = formatNativeMention(user.jid);
  user.hungerWarningSent = true;
  if (typeof user.hunger === "number") user.hunger = 0;
  updateCachedUser(user.jid, { hunger: 0, hungerWarningSent: true });

  try {
    await (prisma.userProfile as any).update({
      where: { id: user.id },
      data: {
        hunger: 0,
        hungerWarningSent: true,
      },
    });

    const collapseMsg =
      `💀 *¡COLAPSO TOTAL POR DESNUTRICIÓN!* 💀\n\n` +
      `${userMention.mentionText} llegó a *0%* de energía y se desplomó en el piso del grupo por no comer.\n\n` +
      `🤐 *Sanción de Desmayo:* ¡El bot te borrará todos los mensajes que intente enviar hasta que comas algo!\n\n` +
      `👉 Para revivir: el propio usuario puede usar \`!comer\` / \`!tomar\`, o alguien puede rescatarlo invitándole con \`!invitar ${userMention.mentionText} comida\`.`;

    await sock.sendMessage(remoteJid, {
      text: collapseMsg,
      mentions: [userMention.mentionJid],
    });
  } catch (err) {
    console.error("[Starvation Collapse Error]:", err);
  }
}

/**
 * Si el usuario está desmayado (0% de energía) y el bot es admin,
 * borra cualquier mensaje que envíe en el grupo, a menos que sea un comando de morfi (!comer, !tomar, !dar, etc.).
 * Retorna true si el mensaje fue borrado e interceptado.
 */
export async function interceptStarvedUserMessage(
  sock: WASocket,
  remoteJid: string,
  userOrJid: any,
  msgKey: any,
  rawText: string
): Promise<boolean> {
  if (!remoteJid.endsWith("@g.us")) return false;

  const trimmed = rawText.trim();
  const prefix = process.env.BOT_PREFIX || "!";
  const isCommand = trimmed.startsWith(prefix);

  const ALLOWED_REVIVE_COMMANDS = [
    "comer", "morfi", "tomar", "beber", "consumir",
    "comida", "invitar", "menu", "tienda", "comprar",
    "diario", "reclamar", "billetera", "saldo"
  ];

  if (isCommand) {
    const cmdName = trimmed.slice(prefix.length).split(/\s+/)[0].toLowerCase();
    if (ALLOWED_REVIVE_COMMANDS.includes(cmdName)) {
      return false; // Permitir comandos de recuperación
    }
  }

  try {
    const user = typeof userOrJid === "object" && userOrJid?.id
      ? userOrJid
      : await resolveOrRegisterUser(userOrJid);

    let currentHunger = typeof (user as any).hunger === "number" ? (user as any).hunger : 85;

    // Si en memoria figura desmayado (0%), consultar DB para confirmar que no haya comido recién
    if (currentHunger <= 0) {
      const dbCheck = await prisma.userProfile.findUnique({
        where: { id: user.id },
        select: { hunger: true },
      });
      if (dbCheck && typeof dbCheck.hunger === "number") {
        currentHunger = dbCheck.hunger;
        (user as any).hunger = dbCheck.hunger;
        updateCachedUser(user.jid, { hunger: dbCheck.hunger });
      }
    }

    if (currentHunger > 0) {
      return false; // Tiene energía, mensaje válido
    }

    // Si es un comando arbitrario no permitido mientras está desmayado, bloquear ejecución
    if (isCommand) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `💀 *¡ESTÁS DESMAYADO!* Tenés *0%* de energía por inanición. No tenés fuerzas para usar comandos. Usá \`!comer\` o \`!tienda\` para recuperarte.`,
        },
        { quoted: { key: msgKey } as any }
      );
      return true;
    }

    console.log(`[Hunger] 💀 Mensaje ordinario de ${user.primaryName} (${user.jid}) interceptado por inanición (0% energía).`);

    // ¡0% de energía! Borrar mensaje si el bot es admin
    try {
      const isAdmin = await isBotAdminInGroup(sock, remoteJid);
      if (isAdmin) {
        await sock.sendMessage(remoteJid, { delete: msgKey });
      }
    } catch (delErr) {
      console.warn("[Hunger Delete Message Error]:", delErr);
    }

    // Advertencia con cooldown de 60s
    const now = Date.now();
    const lastWarn = lastStarvationDeleteWarning.get(user.jid) || 0;
    if (now - lastWarn > 60000) {
      lastStarvationDeleteWarning.set(user.jid, now);
      const userMention = formatNativeMention(user.jid);
      await sock.sendMessage(remoteJid, {
        text:
          `💀 ${userMention.mentionText}, *¡estás desmayado de hambre (0%)!* Tu mensaje fue borrado.\n\n` +
          `No tenés fuerzas para hablar en el grupo. ¡Tirá \`!comer\` para revivir o pedí morfi con \`!invitar\`!`,
        mentions: [userMention.mentionJid],
      });
    }

    return true;
  } catch (err) {
    console.error("[interceptStarvedUserMessage Error]:", err);
    return false;
  }
}

/**
 * Alimenta a un usuario al consumir comida o bebida.
 * Restaura hambre, limpia la alerta roja, añade 3 turnos de buff de laburo (+30%) y suma al ranking de comilones.
 */
export async function feedUser(
  userJid: string,
  restoreAmount: number
): Promise<{
  oldHunger: number;
  newHunger: number;
  jobBuffTurns: number;
  hungerBar: string;
}> {
  const user = await resolveOrRegisterUser(userJid);

  return await withWriteLock(async () => {
    const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;
    const oldHunger = typeof (current as any).hunger === "number" ? (current as any).hunger : 85;
    const newHunger = Math.min(100, Math.max(0, oldHunger + restoreAmount));
    const currentBuffTurns = typeof (current as any).jobBuffTurns === "number" ? (current as any).jobBuffTurns : 0;
    const newBuffTurns = Math.min(9, currentBuffTurns + 3);

    await (prisma.userProfile as any).update({
      where: { id: user.id },
      data: {
        hunger: newHunger,
        hungerWarningSent: newHunger <= 15,
        jobBuffTurns: newBuffTurns,
        foodEaten: { increment: 1 },
      },
    });

    updateCachedUser(user.jid, {
      hunger: newHunger,
      hungerWarningSent: newHunger <= 15,
      jobBuffTurns: newBuffTurns,
    });

    return {
      oldHunger,
      newHunger,
      jobBuffTurns: newBuffTurns,
      hungerBar: renderHungerBar(newHunger),
    };
  });
}

/**
 * Consulta el estado actual de hambre y buff de un usuario.
 */
export async function getUserHungerState(userJid: string): Promise<{
  hunger: number;
  hungerBar: string;
  isCritical: boolean;
  jobBuffTurns: number;
  title: string | null;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const current = (await prisma.userProfile.findUnique({ where: { id: user.id } })) || user;

  const hunger = typeof (current as any).hunger === "number" ? (current as any).hunger : 85;
  const jobBuffTurns = typeof (current as any).jobBuffTurns === "number" ? (current as any).jobBuffTurns : 0;
  const title = (current as any).title || null;

  updateCachedUser(user.jid, { hunger, jobBuffTurns, title });

  return {
    hunger,
    hungerBar: renderHungerBar(hunger),
    isCritical: hunger <= 15,
    jobBuffTurns,
    title,
  };
}
