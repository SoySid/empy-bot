import { Command, CommandContext } from "../types.js";
import {
  isBotOwner,
  BOT_OWNER_JID,
  grantCash,
  seizeCash,
  clearCash,
  setHunger,
  modifyBuffTurns,
  setBuffTurns,
  clearBuffTurns,
  setRobShield,
  removeRobShield,
  giveItem,
  confiscateItem,
  freezeUserEconomy,
  unfreezeUserEconomy,
  inspectUserEconomy,
  resetUserEconomy,
} from "../../services/admin-economy.service.js";
import type { WASocket } from "@whiskeysockets/baileys";
import { findUserByNameOrAlias, formatUserName } from "../../services/db/user.service.js";

/**
 * Respuesta sarcástica ante intentos de miembros no autorizados de usar poderes del Creador.
 */
async function rejectUnauthorized(sock: WASocket, remoteJid: string, msg: any) {
  const text =
    `🚫 *¡ACCESO DENEGADO!* 🚫\n\n` +
    `¿Quién te creés que sos fantasma? 🤨\n` +
    `Solo el Creador tiene la llave maestra del banco y los poderes divinos de la economía.`;

  await sock.sendMessage(
    remoteJid,
    { text },
    { quoted: msg }
  );
}

/**
 * Parsea montos amigables estilo '5k', '2.5k', '1m', o '5000'.
 */
function parseFriendlyNumber(val?: string): number | null {
  if (!val) return null;
  const clean = val.trim().toLowerCase().replace(/\$/g, "").replace(/,/g, ".");
  if (/^\d+(\.\d+)?k$/.test(clean)) {
    return Math.round(parseFloat(clean.replace("k", "")) * 1000);
  }
  if (/^\d+(\.\d+)?m$/.test(clean)) {
    return Math.round(parseFloat(clean.replace("m", "")) * 1000000);
  }
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Formatea cifras con puntos de mil.
 */
function formatNumber(num: number): string {
  return num.toLocaleString("es-AR");
}

/**
 * Extrae de forma robusta el JID objetivo y los argumentos limpios restantes.
 * Soporta:
 * 1. Mención nativa en contextInfo (@549...)
 * 2. Mensaje respondido / citado (quotedParticipant)
 * 3. Mención por texto (@Miembro, @Usuario, @Usuario2) o nombre directo (Usuario, Miembro)
 * 4. Teléfono numérico directo
 */
function parseTargetAndArgs(ctx: CommandContext): {
  targetJid: string | null;
  remainingArgs: string[];
} {
  let targetJid: string | null = null;
  let remainingArgs = [...ctx.args];

  // Prioridad 1: Mención nativa en contextInfo (@549...)
  if (ctx.contextInfo?.mentionedJid && ctx.contextInfo.mentionedJid.length > 0) {
    targetJid = ctx.contextInfo.mentionedJid[0];
    if (remainingArgs.length > 0 && remainingArgs[0].startsWith("@")) {
      remainingArgs = remainingArgs.slice(1);
    }
  }

  // Prioridad 2: Mensaje respondido / citado (incluyendo citarse a uno mismo)
  if (!targetJid) {
    if (ctx.quotedSenderProfile?.jid) {
      targetJid = ctx.quotedSenderProfile.jid;
    } else if (ctx.contextInfo?.participant) {
      targetJid = ctx.contextInfo.participant;
    }
  }

  // Prioridad 3: Primer argumento como teléfono o nombre/alias (@Miembro, Leo, 54911...)
  if (!targetJid && ctx.args.length > 0) {
    const rawFirst = ctx.args[0].trim();
    const cleanFirst = rawFirst.replace(/^@/, "");

    const digits = cleanFirst.replace(/\D/g, "");
    if (digits.length >= 8 && /^\d+$/.test(digits)) {
      targetJid = `${digits}@s.whatsapp.net`;
      remainingArgs = ctx.args.slice(1);
    } else {
      const matchedUser = findUserByNameOrAlias(cleanFirst);
      if (matchedUser) {
        targetJid = matchedUser.jid;
        remainingArgs = ctx.args.slice(1);
      }
    }
  }

  // Prioridad 4: Si no hay objetivo explícito, el emisor actual (autorizado)
  if (!targetJid && ctx.senderProfile?.jid) {
    targetJid = ctx.senderProfile.jid;
  }

  return { targetJid, remainingArgs };
}

// ==========================================
// 🎁 COMANDOS DE BENEFICIOS DIVINOS
// ==========================================

export const darFichaCommand: Command = {
  name: "darficha",
  aliases: ["darfichas", "inyectar", "subsidio", "premiar"],
  description: "Emite fichas y las acredita a un miembro (!darficha <monto> citando o @usuario <monto>).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const amount = parseFriendlyNumber(remainingArgs[0]);

    if (!targetJid || !amount || amount <= 0) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *DAR FICHAS (PODER DIVINO)*\n\n` +
            `Uso: \`!darficha <monto>\` (respondiendo a un mensaje) o \`!darficha @usuario <monto>\`\n` +
            `_Ejemplos:_\n` +
            `• \`!darficha 5000\` (respondiendo al usuario o a vos mismo)\n` +
            `• \`!darficha @Usuario 5000\`\n` +
            `• \`!darficha @Miembro 25k\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await grantCash(targetJid, amount);
    if (!res.success) {
      await ctx.sock.sendMessage(ctx.remoteJid, { text: `❌ ${res.error}` }, { quoted: ctx.msg as any });
      return;
    }

    const targetName = formatUserName(targetJid);
    const text =
      `💸 *¡INYECCIÓN DE FICHAS DIVINA!* 💸\n\n` +
      `Por decreto supremo de la patronal, se acreditaron fichas a la billetera de ${targetName}.\n\n` +
      `💰 *Monto emitido:* +$${formatNumber(res.amount!)} fichas\n` +
      `💳 *Nuevo saldo:* *$${formatNumber(res.newBalance!)}* fichas`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const buffCommand: Command = {
  name: "buff",
  aliases: ["darbuff", "bendicion"],
  description: "Otorga turnos de buff de laburo (+30% por changa) a un usuario (!buff [turnos]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const turns = parseFriendlyNumber(remainingArgs[0]) || 3;

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *DAR BUFF DE LABURO (+30%)*\n\n` +
            `Uso: \`!buff [turnos]\` (respondiendo al mensaje o a vos mismo) o \`!buff @usuario [turnos]\` (por defecto: 3 turnos)\n` +
            `_Ejemplo:_ \`!buff 5\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await setBuffTurns(targetJid, turns);
    const targetName = formatUserName(targetJid);

    const text =
      `✨ *¡BENDICIÓN LABORAL CONCEDIDA!* ✨\n\n` +
      `${targetName} recibió la gracia divina para sus changas (+30% de cobro por turno).\n\n` +
      `⭐ *Turnos añadidos:* ${turns}\n` +
      `📈 *Turnos de buff activos:* ${res.newTurns} turnos (+30% de paga)`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const saciarCommand: Command = {
  name: "saciar",
  aliases: ["curarhambre", "alimentartodo", "llenarpanza"],
  description: "Restaura la energía/hambre al 100% de inmediato (!saciar [usuario]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `👑 *SACIAR ENERGÍA / HAMBRE*\n\nUso: \`!saciar\` respondiendo al mensaje o \`!saciar @usuario\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await setHunger(targetJid, 100);
    const targetName = formatUserName(targetJid);

    const text =
      `🍖 *¡BANQUETE CELESTIAL!* 🍖\n\n` +
      `La patronal sació por completo el hambre y agotamiento de ${targetName}.\n\n` +
      `🔋 *Energía restablecida:* ${res.hungerBar} 100%\n` +
      `💪 Listo para volver a las changas a pleno rendimiento.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const darEscudoCommand: Command = {
  name: "darescudo",
  aliases: ["proteger", "escudodivino", "escudo"],
  description: "Otorga un escudo anti-robo temporal a un miembro (!darescudo [horas]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const hours = parseFriendlyNumber(remainingArgs[0]) || 6;

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *ESCUDO SAGRADO ANTI-ROBOS*\n\n` +
            `Uso: \`!darescudo [horas]\` (respondiendo al mensaje o a vos mismo) o \`!darescudo @usuario [horas]\` (por defecto: 6 horas)\n` +
            `_Ejemplo:_ \`!darescudo 12\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await setRobShield(targetJid, hours);
    const targetName = formatUserName(targetJid);

    const text =
      `🛡️ *¡MANTO SAGRADO ANTI-ROBOS!* 🛡️\n\n` +
      `${targetName} ha sido puesto bajo protección divina exclusiva.\n\n` +
      `⏳ *Vigencia:* ${res.hours} hora(s)\n` +
      `🔒 Ningún rastrero del grupo podrá asaltar su billetera.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const quitarEscudoCommand: Command = {
  name: "quitarescudo",
  aliases: ["desproteger", "sacarescudo", "removerescudo"],
  description: "Remueve el escudo anti-robo sagrado de un miembro (!quitarescudo).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `👑 *QUITAR ESCUDO ANTI-ROBOS*\n\nUso: \`!quitarescudo\` respondiendo a un mensaje o \`!quitarescudo @usuario\`` },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await removeRobShield(targetJid);
    const targetName = formatUserName(targetJid);

    const text =
      `🛡️❌ *¡ESCUDO DESACTIVADO!* 🛡️❌\n\n` +
      `Se retiró la protección divina de ${targetName}.\n\n` +
      `⚠️ Su billetera vuelve a ser vulnerable a asaltos de los rastreros del grupo.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const darItemCommand: Command = {
  name: "daritem",
  aliases: ["regalaritem"],
  description: "Agrega cualquier ítem o reliquia de la tienda a la mochila del usuario (!daritem @usuario <id_item> [cant]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const itemQuery = remainingArgs[0];
    const qty = parseFriendlyNumber(remainingArgs[1]) || 1;

    if (!targetJid || !itemQuery) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *DAR ÍTEM / RELIQUIA / HERRAMIENTA*\n\n` +
            `Uso: \`!daritem @usuario <nombre_o_id> [cantidad]\`\n` +
            `_Ejemplos:_\n` +
            `• \`!daritem @Usuario guiso 5\`\n` +
            `• \`!daritem @Dany soldadora\`\n` +
            `• \`!daritem @Usuario2 reliquia_llave\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await giveItem(targetJid, itemQuery, qty);
    if (!res.success) {
      await ctx.sock.sendMessage(ctx.remoteJid, { text: `❌ ${res.error}` }, { quoted: ctx.msg as any });
      return;
    }

    const targetName = formatUserName(targetJid);
    const text =
      `🎁 *¡TRANSFERENCIA DE ARSENAL / PROVISIONES!* 🎁\n\n` +
      `Se entregó directamente al inventario de ${targetName}:\n\n` +
      `📦 *Ítem:* ${res.quantityAdded}x ${res.item?.name}\n` +
      `🎒 *Total en posesión:* ${res.newTotalQuantity} unidades\n` +
      `ℹ️ _${res.item?.description}_`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

// ==========================================
// ⚡ COMANDOS DE CASTIGOS DIVINOS
// ==========================================

export const quitarFichaCommand: Command = {
  name: "quitarficha",
  aliases: ["quitarfichas", "multar", "embargar", "sancionar"],
  description: "Confisca fichas de la billetera de un usuario (!quitarficha <monto> citando o @usuario <monto>).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const amount = parseFriendlyNumber(remainingArgs[0]);

    if (!targetJid || !amount || amount <= 0) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *CONFISCAR FICHAS (MULTA)*\n\n` +
            `Uso: \`!quitarficha <monto>\` (respondiendo a un mensaje) o \`!quitarficha @usuario <monto>\`\n` +
            `_Ejemplos:_\n` +
            `• \`!quitarficha 3000\` (respondiendo al usuario o a vos mismo)\n` +
            `• \`!quitarficha @Usuario 3000\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await seizeCash(targetJid, amount);
    if (!res.success) {
      await ctx.sock.sendMessage(ctx.remoteJid, { text: `❌ ${res.error}` }, { quoted: ctx.msg as any });
      return;
    }

    const targetName = formatUserName(targetJid);
    const text =
      `⚡ *¡EMBARGO ECONÓMICO EJECUTADO!* ⚡\n\n` +
      `Por desacato o portación de cara, se confiscaron fondos a ${targetName}.\n\n` +
      `📉 *Monto incautado:* -$${formatNumber(res.amount!)} fichas\n` +
      `💳 *Saldo restante:* *$${formatNumber(res.newBalance!)}* fichas`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const vaciarCommand: Command = {
  name: "vaciar",
  aliases: ["expropiar", "quiebra"],
  description: "Deja la billetera de un usuario en $0 fichas (!vaciar @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `👑 *VACIAR BILLETERA A CERO*\n\nUso: \`!vaciar @usuario\` (o respondé a un mensaje con \`!vaciar\`)`,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await clearCash(targetJid);
    const targetName = formatUserName(targetJid);

    const text =
      `🔥 *¡EXPROPIACIÓN TOTAL!* 🔥\n\n` +
      `${targetName} acaba de ser desvalijado por completo por la patronal.\n\n` +
      `💸 *Fichas pulverizadas:* -$${formatNumber(res.oldBalance || 0)}\n` +
      `💳 *Saldo actual:* *$0* fichas (en la lona absoluta)`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const hambrearCommand: Command = {
  name: "hambrear",
  aliases: ["bajarenergia", "agotamiento"],
  description: "Reduce la barra de hambre/energía a 0% (Inanición) (!hambrear @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `👑 *CASTIGO DE INANICIÓN*\n\nUso: \`!hambrear\` respondiendo a un mensaje o \`!hambrear @usuario\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await setHunger(targetJid, 0);
    const targetName = formatUserName(targetJid);

    const text =
      `💀 *¡DRENAJE VITAL DE ENERGÍA!* 💀\n\n` +
      `${targetName} cayó desplomado al piso por agotamiento extremo.\n\n` +
      `🔋 *Energía:* ${res.hungerBar} 0% (Inanición)\n` +
      `⚠️ No podrá laburar ni hacer changas hasta que coma algo o alguien le convide morfi.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const nerfCommand: Command = {
  name: "nerf",
  aliases: ["darnerf", "maldicion", "debuff"],
  description: "Aplica turnos de nerf de laburo (-30% por changa) a un usuario (!nerf [turnos]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const rawTurns = parseFriendlyNumber(remainingArgs[0]) || 3;
    const nerfTurns = -Math.abs(rawTurns);

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *APLICAR NERF DE LABURO (-30%)*\n\n` +
            `Uso: \`!nerf [turnos]\` (respondiendo al mensaje o a vos mismo) o \`!nerf @usuario [turnos]\` (por defecto: 3 turnos)\n` +
            `_Ejemplo:_ \`!nerf 3\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await setBuffTurns(targetJid, nerfTurns);
    const targetName = formatUserName(targetJid);

    const text =
      `📉 *¡CASTIGO LABORAL: NERF APLICADO!* 📉\n\n` +
      `Por desacato con la patronal, ${targetName} sufrirá una penalidad en sus changas (-30% de cobro).\n\n` +
      `💀 *Turnos de nerf activos:* ${Math.abs(res.newTurns || 0)} turnos (-30% de paga)`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const quitarBuffCommand: Command = {
  name: "quitarbuff",
  aliases: ["despojar"],
  description: "Elimina todos los turnos de buff o nerf acumulados (!quitarbuff @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `👑 *DESPOJAR BUFFS / NERFS DE LABURO*\n\nUso: \`!quitarbuff\` respondiendo a un mensaje o \`!quitarbuff @usuario\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await clearBuffTurns(targetJid);
    const targetName = formatUserName(targetJid);

    const text =
      `📉 *¡ANULACIÓN DE MODIFICADORES!* 📉\n\n` +
      `Se le retiraron todos los modificadores (buffs y nerfs) a ${targetName}.\n\n` +
      `🚫 *Turnos eliminados:* ${res.oldTurns || 0}\n` +
      `💼 Ahora cobrará tarifa normal en las changas.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const quitarItemCommand: Command = {
  name: "quitaritem",
  aliases: ["confiscar"],
  description: "Remueve un ítem de la mochila de un usuario (!quitaritem @usuario <nombre_o_id> [cant]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const itemQuery = remainingArgs[0];
    const qty = remainingArgs[1] ? parseFriendlyNumber(remainingArgs[1]) || undefined : undefined;

    if (!targetJid || !itemQuery) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *CONFISCAR ÍTEM / RELIQUIA*\n\n` +
            `Uso: \`!quitaritem @usuario <nombre_o_id> [cantidad]\`\n` +
            `_Ejemplo:_ \`!quitaritem @Usuario guiso 2\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await confiscateItem(targetJid, itemQuery, qty);
    if (!res.success) {
      await ctx.sock.sendMessage(ctx.remoteJid, { text: `❌ ${res.error}` }, { quoted: ctx.msg as any });
      return;
    }

    const targetName = formatUserName(targetJid);
    const text =
      `🚨 *¡INCAUTACIÓN DE MERCADERÍA!* 🚨\n\n` +
      `Se allanó la mochila de ${targetName} y se decomisó:\n\n` +
      `📦 *Ítem:* ${res.quantityRemoved}x ${res.item?.name}\n` +
      `🎒 *Restante en mochila:* ${res.newTotalQuantity} unidades`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const congelarCommand: Command = {
  name: "congelar",
  aliases: ["bloqueareco"],
  description: "Bloquea temporalmente el uso de comandos económicos a un usuario (!congelar @usuario [minutos]).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid, remainingArgs } = parseTargetAndArgs(ctx);
    const minutes = remainingArgs[0] ? parseFriendlyNumber(remainingArgs[0]) ?? 10 : 10;

    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text:
            `👑 *CONGELAR ECONOMÍA*\n\n` +
            `Uso: \`!congelar @usuario [minutos]\` (por defecto: 10 minutos. Poné 0 para descongelar)\n` +
            `_Ejemplo:_ \`!congelar @Usuario 15\``,
        },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await freezeUserEconomy(targetJid, minutes);
    const targetName = formatUserName(targetJid);

    if (minutes <= 0) {
      await ctx.sock.sendMessage(ctx.remoteJid, {
        text: `🔥 *¡DESCONGELADO!* ${targetName} ya puede volver a usar comandos de economía.`,
      });
      return;
    }

    const text =
      `🧊 *¡SANCIONADO: CUENTA CONGELADA!* 🧊\n\n` +
      `Por disposición del Creador, las funciones económicas de ${targetName} han sido bloqueadas.\n\n` +
      `⏱️ *Plazo de congelamiento:* ${res.minutes} minuto(s)\n` +
      `🚫 No podrá laburar, apostar en el casino, asaltar ni comprar en la tienda hasta que finalice la sanción.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const descongelarCommand: Command = {
  name: "descongelar",
  aliases: ["unfreeze"],
  description: "Levanta inmediatamente el congelamiento económico de un usuario (!descongelar @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `👑 *DESCONGELAR ECONOMÍA*\n\nUso: \`!descongelar @usuario\`` },
        { quoted: ctx.msg as any }
      );
      return;
    }

    await unfreezeUserEconomy(targetJid);
    const targetName = formatUserName(targetJid);

    const text =
      `🔥 *¡SANCION LEVANTADA!* 🔥\n\n` +
      `La patronal perdonó a ${targetName}. Su cuenta económica vuelve a estar operativa.`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

// ==========================================
// 🔍 MÓDULO DE INSPECCIÓN Y RESETEO
// ==========================================

export const inspeccionarCommand: Command = {
  name: "inspeccionar",
  aliases: ["auditar", "perfilsecreto", "ficha"],
  description: "Muestra la ficha técnica económica completa de un usuario (!inspeccionar @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `👑 *AUDITORÍA PROFUNDA*\n\nUso: \`!inspeccionar @usuario\` (o respondé a un mensaje con \`!inspeccionar\`)` },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await inspectUserEconomy(targetJid);
    const u = res.user!;
    const targetName = formatUserName(u.jid);

    // Listado de inventario
    let invText = "_(Mochila vacía)_";
    if (res.inventory && res.inventory.length > 0) {
      invText = res.inventory
        .map((i) => `  • *${i.quantity}x* ${i.item ? i.item.name : i.itemId}`)
        .join("\n");
    }

    const freezeNotice = res.isFrozen
      ? `🧊 *Sanción activa:* Congelado (${Math.ceil(res.frozenSeconds! / 60)}m restantes)`
      : `🟢 *Estado de cuenta:* Habilitada`;

    const shieldNotice = res.shieldActive
      ? `🛡️ *Escudo:* Activo (${res.shieldRemainingHours}h restantes)`
      : `🛡️ *Escudo:* Inactivo (Vulnerable a asaltos)`;

    const text =
      `🕵️‍♂️ *AUDITORÍA ECONÓMICA DE LA PATRONAL* 🕵️‍♂️\n\n` +
      `👤 *Sujeto:* ${targetName} (${u.primaryName || u.pushName || "Anónimo"})\n` +
      `📱 *Teléfono:* \`+${u.phone}\` | *Rol:* \`${u.role}\`\n` +
      `🏷️ *Título:* ${u.title || "Sin título"}\n` +
      `💼 *Profesión:* ${res.professionIcon} ${res.professionName}\n\n` +
      `💵 *Saldo en Billetera:* *$${formatNumber(u.balance)}* fichas\n` +
      `🔋 *Energía / Hambre:* ${u.hunger}%\n` +
      `✨ *Buffs de Laburo:* ${u.jobBuffTurns} turnos restantes\n` +
      `${shieldNotice}\n` +
      `${freezeNotice}\n\n` +
      `📊 *Estadísticas Históricas:*\n` +
      `  • Changas completadas: ${u.jobsCompleted}\n` +
      `  • Robos exitosos: ${u.robberiesWon}\n` +
      `  • Comidas consumidas: ${u.foodEaten}\n\n` +
      `🎒 *Inventario Completo:*\n${invText}`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};

export const reiniciarEcoCommand: Command = {
  name: "reiniciareco",
  aliases: ["reseteareco"],
  description: "Restaura la economía del usuario a valores de fábrica ($500 fichas, 85% energía, inventario vacío) (!reiniciareco @usuario).",
  execute: async (ctx: CommandContext) => {
    const senderJid = ctx.senderProfile?.jid || ctx.msg.key?.participant || ctx.msg.key?.remoteJid || "";
    if (!isBotOwner(ctx.senderProfile, senderJid)) {
      return rejectUnauthorized(ctx.sock, ctx.remoteJid, ctx.msg);
    }

    const { targetJid } = parseTargetAndArgs(ctx);
    if (!targetJid) {
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        { text: `👑 *RESET ECONÓMICO A FÁBRICA*\n\nUso: \`!reiniciareco @usuario\` (o respondé a un mensaje con \`!reiniciareco\`)` },
        { quoted: ctx.msg as any }
      );
      return;
    }

    const res = await resetUserEconomy(targetJid);
    const targetName = formatUserName(targetJid);

    const text =
      `🔄 *¡REINICIO A VALORES DE FÁBRICA!* 🔄\n\n` +
      `El perfil económico de ${targetName} fue formateado desde cero:\n\n` +
      `💵 *Saldo:* $500 fichas iniciales\n` +
      `🔋 *Energía:* 85%\n` +
      `🎒 *Inventario:* 100% vaciado\n` +
      `⭐ *Buffs y Escudos:* Anulados\n` +
      `📊 *Estadísticas:* En cero`;

    await ctx.sock.sendMessage(ctx.remoteJid, {
      text,
    });
  },
};
