import { commandMap } from "../commands/index.js";
import { MessageContext } from "./types.js";
import { isUserCommandBanned } from "../services/command-ban.service.js";
import { isUserIgnoredByRoulette } from "../services/games/ruletarusa.service.js";

const PREFIX: string = process.env.BOT_PREFIX || "!";

/**
 * Procesa comandos con prefijo (ej: !s, !descargar, !resumen).
 * Retorna true si un comando fue encontrado y ejecutado.
 */
export async function handlePrefixCommand(ctx: MessageContext): Promise<boolean> {
  const trimmed = ctx.body.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return false;
  }

  // Soporta "! laburar", "!   laburo", "!profesión"
  const withoutPrefix = trimmed.slice(PREFIX.length).trim();
  const [commandName, ...args] = withoutPrefix.split(/\s+/);
  if (!commandName) return false;

  const cleanText = args.join(" ");

  // Normalización de tildes / acentos diacríticos
  const normalizedCommandName = commandName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const command =
    commandMap.get(normalizedCommandName) ||
    commandMap.get(commandName.toLowerCase());

  if (command) {
    const userJid =
      ctx.senderProfile?.jid ||
      ctx.msg.key?.participant ||
      ctx.msg.key?.remoteJid ||
      "";

    if (isUserIgnoredByRoulette(userJid) && command.name !== "ruletarusa") {
      console.log(`[Command] 💀 Ignorando comando !${command.name} de usuario en muerte por ruleta rusa: ${userJid}`);
      return true;
    }

    if (isUserCommandBanned(userJid, normalizedCommandName, command.name)) {
      const userName = ctx.senderProfile?.primaryName || "usuario";
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `⛔ @${userName}, tenés restringido el uso del comando *!${normalizedCommandName}*.`,
          mentions: userJid ? [userJid] : [],
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return true;
    }

    console.log(
      `[Command] ⚡ Ejecutando !${command.name} (input: "${commandName}") de ${ctx.senderProfile?.primaryName || "desconocido"} (${ctx.remoteJid})`
    );
    try {
      await command.execute({
        sock: ctx.sock,
        msg: ctx.msg,
        remoteJid: ctx.remoteJid,
        body: ctx.body,
        args,
        cleanText,
        senderProfile: ctx.senderProfile,
        quotedSenderProfile: ctx.quotedSenderProfile,
        contextInfo: ctx.contextInfo,
        quotedMsg: ctx.quotedMsg,
      });
      return true;
    } catch (cmdErr: any) {
      console.error(`[Command Error] ❌ Error ejecutando !${command.name}:`, cmdErr);
      await ctx.sock.sendMessage(
        ctx.remoteJid,
        {
          text: `⚠️ *Error al ejecutar !${commandName}:* Ocurrió un problema temporal al procesar el comando. Probá de nuevo en unos segundos.`,
        },
        { quoted: ctx.msg as any }
      ).catch(() => {});
      return true;
    }
  }

  return false;
}
