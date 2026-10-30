import { Command, CommandContext } from "../types.js";
import { setUserProfession, getOrInitGlobalState } from "../../services/economy.service.js";
import { PROFESSIONS } from "../../config/economy.config.js";

export const profesionCommand: Command = {
  name: "profesion",
  aliases: ["oficio", "trabajo", "elegiroficio"],
  description: "Elegí tu oficio para laburar: !profesion <oficio> (12 oficios disponibles, podés renunciar con !renunciar o !borrartrabajo).",
  execute: async ({ sock, msg, remoteJid, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const { weather } = await getOrInitGlobalState();

    if (!args[0]) {
      const currentRes = await setUserProfession(senderJid);
      const hasProf = !!currentRes.professionMetadata;
      const currentName = hasProf
        ? `${currentRes.professionMetadata!.icon} *${currentRes.professionMetadata!.name}*`
        : "⚠️ *Ninguno seleccionado* _(Elegí uno de la lista)_";

      const listText = Object.values(PROFESSIONS)
        .map((p) => {
          const mult = weather.professionMultipliers?.[p.id] ?? 1.0;
          const multText = mult !== 1.0 ? ` 🌤️\`x${mult.toFixed(1)}\`` : "";
          return `• ${p.icon} *${p.name}* (\`!profesion ${p.id}\`)${multText}`;
        })
        .join("\n");

      const instructionText = hasProf
        ? `💼 _Ya tenés tu rubro asignado. Podés cambiar de rubro cuando quieras renunciando con \`!renunciar\` o \`!borrartrabajo\`._`
        : `⚠️ *ATENCIÓN:* Podés elegir uno de los 12 oficios disponibles (si querés cambiar más adelante, podés renunciar con \`!renunciar\`):\n\n${listText}\n\n💡 _Mirá herramientas, reliquias y la sede de cualquier rubro con \`!tienda <oficio>\`._`;

      const message =
        `👷 *OFICIOS DE LA CIUDAD DE EMPYREAL*\n\n` +
        `👤 *Tu oficio:* ${currentName}\n` +
        `🌤️ *Clima vigente:* ${weather.icon} *${weather.name}*\n\n` +
        instructionText;

      await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
      return;
    }

    const input = args[0].toLowerCase();
    const res = await setUserProfession(senderJid, input);

    if (!res.success) {
      await sock.sendMessage(
        remoteJid,
        { text: `❌ ${res.error}` },
        { quoted: msg as any }
      );
      return;
    }

    const p = res.professionMetadata!;
    const mult = weather.professionMultipliers?.[p.id] ?? 1.0;
    const multText = mult !== 1.0 ? `\n🌤️ *Multiplicador por clima actual:* \`x${mult.toFixed(1)}\`` : "";

    const text =
      `🎉 *¡OFICIO ASIGNADO!*\n\n` +
      `Te registraste como: ${p.icon} *${p.name.toUpperCase()}*\n` +
      `📝 _"${p.description}"_\n` +
      `${multText}\n\n` +
      `📌 *Tu oficio actual:* Este es tu oficio en Empyreal (podés renunciar luego con \`!renunciar\` o \`!borrartrabajo\`).\n` +
      `¡A partir de ahora, cada vez que tires \`!laburar\` harás changas exclusivas de tu profesión y podrás equiparte con sus 5 reliquias y herramientas en \`!tienda\`!`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
