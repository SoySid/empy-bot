import { Command, CommandContext } from "./types.js";
import { prisma } from "../services/db/prisma.js";
import { getGroupParticipantJidSet } from "../services/whatsapp-identity.js";


export const rankingCommand: Command = {
  name: "ranking",
  aliases: ["top", "mensajes", "stats", "podio", "clasificacion"],
  description: "Muestra los rankings del grupo: !ranking [mensajes|plata|laburo|chorros|morfi]",
  execute: async ({ sock, msg, remoteJid, cleanText, args }: CommandContext) => {
    try {
      const mode = (args[0] || "").toLowerCase();
      const isAllTime = cleanText.toLowerCase().includes("total") || cleanText.toLowerCase().includes("historico");
      const medals = ["🥇", "🥈", "🥉", "4.", "5.", "6.", "7.", "8.", "9.", "10."];

      // 1. RANKING DE PLATA / MILLONARIOS
      if (mode === "plata" || mode === "ricos" || mode === "billetera" || mode === "guita") {
        const users = await (prisma.userProfile as any).findMany({
          orderBy: { balance: "desc" },
          take: 10,
          select: {
            primaryName: true,
            balance: true,
            title: true,
          },
        });

        if (users.length === 0) {
          await sock.sendMessage(remoteJid, { text: "📊 Todavía no hay perfiles con saldo registrado." }, { quoted: msg as any });
          return;
        }

        const lines = users.map((u: any, idx: number) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const titleSuffix = u.title ? ` _[${u.title}]_` : "";
          return `${medal} *${u.primaryName}*${titleSuffix}: *$${u.balance}* fichas`;
        });

        const text =
          `💰 *PODIO DE MAGNATES (MÁS RICOS)* 💰\n\n` +
          `${lines.join("\n")}\n\n` +
          `💡 _Categorías disponibles: \`!ranking mensajes\`, \`!ranking laburo\`, \`!ranking chorros\`, \`!ranking morfi\`._`;

        await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
        return;
      }

      // 2. RANKING DE LABURADORES / CHANGAS
      if (mode === "laburo" || mode === "laburadores" || mode === "changas" || mode === "trabajo") {
        const users = await (prisma.userProfile as any).findMany({
          where: { jobsCompleted: { gt: 0 } },
          orderBy: { jobsCompleted: "desc" },
          take: 10,
          select: {
            primaryName: true,
            jobsCompleted: true,
            title: true,
          },
        });

        if (users.length === 0) {
          await sock.sendMessage(remoteJid, { text: "💼 Nadie laburó todavía. ¡Tirá `!laburar` para inaugurar el podio!" }, { quoted: msg as any });
          return;
        }

        const lines = users.map((u: any, idx: number) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const titleSuffix = u.title ? ` _[${u.title}]_` : "";
          return `${medal} *${u.primaryName}*${titleSuffix}: *${u.jobsCompleted}* changas metidas`;
        });

        const text =
          `💼 *PODIO DE LOS MÁS LABURADORES* 💼\n\n` +
          `${lines.join("\n")}\n\n` +
          `💡 _Meté changas cada 1:30 min (o 45s con herramientas) con \`!laburar\` para subir en el ranking._`;

        await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
        return;
      }

      // 3. RANKING DE CHORROS / ASALTANTES
      if (mode === "chorros" || mode === "robos" || mode === "ladrones" || mode === "asaltos") {
        const users = await (prisma.userProfile as any).findMany({
          where: { robberiesWon: { gt: 0 } },
          orderBy: { robberiesWon: "desc" },
          take: 10,
          select: {
            primaryName: true,
            robberiesWon: true,
            title: true,
          },
        });

        if (users.length === 0) {
          await sock.sendMessage(remoteJid, { text: "🥷 Todavía no hay asaltos exitosos registrados. ¡Tirá `!robar @usuario`!" }, { quoted: msg as any });
          return;
        }

        const lines = users.map((u: any, idx: number) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const titleSuffix = u.title ? ` _[${u.title}]_` : "";
          return `${medal} *${u.primaryName}*${titleSuffix}: *${u.robberiesWon}* asaltos coronados`;
        });

        const text =
          `🥷 *PODIO DE LOS MÁS CHORROS* 🥷\n\n` +
          `${lines.join("\n")}\n\n` +
          `💡 _Asaltá a los giles con \`!robar @usuario\` o pagá \`!coima\` para zafar del cooldown._`;

        await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
        return;
      }

      // 4. RANKING DE MORFI / COMILONES
      if (mode === "morfi" || mode === "comida" || mode === "comilones" || mode === "bajon") {
        const users = await (prisma.userProfile as any).findMany({
          where: { foodEaten: { gt: 0 } },
          orderBy: { foodEaten: "desc" },
          take: 10,
          select: {
            primaryName: true,
            foodEaten: true,
            title: true,
          },
        });

        if (users.length === 0) {
          await sock.sendMessage(remoteJid, { text: "🍲 Nadie comió todavía. ¡Tirá `!tienda` y `!comer chipa` para inaugurar el morfi!" }, { quoted: msg as any });
          return;
        }

        const lines = users.map((u: any, idx: number) => {
          const medal = medals[idx] || `${idx + 1}.`;
          const titleSuffix = u.title ? ` _[${u.title}]_` : "";
          return `${medal} *${u.primaryName}*${titleSuffix}: *${u.foodEaten}* porciones bajadas`;
        });

        const text =
          `🍲 *PODIO DE LOS MÁS COMILONES* 🍲\n\n` +
          `${lines.join("\n")}\n\n` +
          `💡 _Comé con \`!comer\` para mantener tu energía y evitar desmayarte (0%)._`;

        await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
        return;
      }

      // 5. POR DEFECTO: RANKING DE PARTICIPACIÓN / MENSAJES (HOY O HISTÓRICO)
      let dateFilter: Date | undefined;
      let title = "🗣️ *RANKING DE CHARLATANES (HOY)*";

      if (!isAllTime) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        dateFilter = startOfDay;
      } else {
        title = "🗣️ *RANKING DE CHARLATANES (HISTÓRICO)*";
      }

      const allowedUserJids = await getGroupParticipantJidSet(sock, remoteJid);

      const whereClause: any = dateFilter
        ? { createdAt: { gte: dateFilter }, isBot: false, ...(allowedUserJids ? { userJid: { in: allowedUserJids } } : {}) }
        : { isBot: false, ...(allowedUserJids ? { userJid: { in: allowedUserJids } } : {}) };

      const messagesGrouped = await prisma.rawMessage.groupBy({
        by: ["senderName", "userJid"],
        where: whereClause,
        _count: {
          id: true,
          _all: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 10,
      });

      if (messagesGrouped.length === 0) {
        await sock.sendMessage(
          remoteJid,
          { text: "📊 Todavía no hay suficientes mensajes registrados para armar el ranking de hoy." },
          { quoted: msg as any }
        );
        return;
      }

      const lines = messagesGrouped.map((item, idx) => {
        const medal = medals[idx] || `${idx + 1}.`;
        const count = item._count._all;
        return `${medal} *${item.senderName}*: ${count} mensajes`;
      });

      const totalCount = messagesGrouped.reduce((acc, curr) => acc + curr._count._all, 0);

      const responseText =
        `${title}\n\n` +
        `${lines.join("\n")}\n\n` +
        `💬 *Total registrado:* ${totalCount} mensajes\n\n` +
        `📌 *Otras categorías:*\n` +
        `• \`!ranking total\` (histórico mensajes)\n` +
        `• \`!ranking plata\` (los más ricos)\n` +
        `• \`!ranking laburo\` (más changas)\n` +
        `• \`!ranking chorros\` (más robos ganados)\n` +
        `• \`!ranking morfi\` (más comilones)`;

      await sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg as any });
    } catch (err) {
      console.error("[Ranking Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Error al generar el ranking." },
        { quoted: msg as any }
      );
    }
  },
};
