import { Command, CommandContext } from "./types.js";
import { prisma } from "../services/db/prisma.js";
import { getLiveBufferMessages } from "../services/db/message.service.js";
import { generateWithGemini, generateWithGroqReasoning } from "../services/ai.service.js";
import {
  normalizeToPhoneJid,
  getGroupParticipantJidSet,
} from "../services/whatsapp-identity.js";

const SYSTEM_PROMPT = `Sos Empy, el árbitro supremo e imparcial del grupo de WhatsApp "Empyreal".
Los pibes te invocaron con !arbitro para que cortes el bardo y dictes sentencia de potrero.

REGLA DE ORO: SÉ BREVE, PICANTE Y CONTUNDENTE (MÁXIMO 80-130 PALABRAS TOTALES).
Cero formalismos aburridos ni testamentos de juzgado. El veredicto se tiene que leer de un solo saque en el celular sin scrollear.

ESTRUCTURA OBLIGATORIA (3 BLOQUES CORTOS):
⚖️ *FALLO ARBITRAL*

⚔️ *El Bardo:* [1 sola oración directa: quiénes y por qué se están matando]

🏆 *El Veredicto:* [Fallo directo y con fakta en 2 o 3 oraciones. Quién tiene la razón y quién está vendiendo humo / llorando. Si ambos son un desastre, declará "Duelo de inválidos". Tono pibe argentino pero juez que no le tiembla el pulso]

💡 *La Condena:* [Castigo o penitencia en joda para descomprimir (ej: pagar la coca/birras, jugar de support, silencio por media hora)]`.trim();

export const arbitroCommand: Command = {
  name: "arbitro",
  aliases: ["juicio", "tribunal", "arbitraje", "veredicto", "juez"],
  description: "Emite un veredicto objetivo e imparcial sobre una discusión o debate reciente en el grupo.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, contextInfo, args } = ctx;

    // 1. Determinar cantidad de mensajes a analizar (por defecto 100, configurable de 20 a 250)
    const parsedLimit = args.map((a) => parseInt(a, 10)).find((n) => !isNaN(n) && n > 0);
    const limit = Math.min(Math.max(parsedLimit || 100, 20), 250);

    // Reacción de balanza de la justicia mientras delibera
    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "⚖️", key: msg.key } }).catch(() => {});
    }

    // 2. Obtener mensajes recientes del chat (aislando por grupo si corresponde)
    const allowedUserJids = await getGroupParticipantJidSet(sock, remoteJid);

    const whereClause: any = {
      isBot: false,
      ...(allowedUserJids ? { userJid: { in: allowedUserJids } } : {}),
    };

    let recentMessages: { senderName: string; body: string }[] = [];

    // Prioridad A: Consultar DB Neon para abarcar la discusión completa (hasta `limit` mensajes)
    try {
      const rawFromDb = await prisma.rawMessage.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      recentMessages = rawFromDb
        .reverse()
        .filter(
          (m) =>
            m.body &&
            !m.body.startsWith("!") &&
            !m.body.startsWith(".") &&
            !m.body.startsWith("/") &&
            m.body.trim().length >= 2
        )
        .map((m) => ({
          senderName: m.senderName || "Integrante",
          body: m.body,
        }));
    } catch (err) {
      console.warn("[Arbitro Command] Error leyendo mensajes de DB:", err);
    }

    // Si DB tenía pocos mensajes (ej. purge o arranque fresco), complementar con liveBuffer
    if (recentMessages.length < 20) {
      const liveMsgs = getLiveBufferMessages(limit);
      const filteredLive = liveMsgs.filter(
        (m) =>
          m.body &&
          !m.body.startsWith("!") &&
          !m.body.startsWith(".") &&
          !m.body.startsWith("/") &&
          m.body.trim().length >= 2
      );
      if (filteredLive.length > recentMessages.length) {
        recentMessages = filteredLive;
      }
    }

    if (recentMessages.length < 3) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "⚖️ *No hay suficiente bardo o debate reciente en el chat para emitir un fallo.* Discutan un toque más o tiren sus argumentos primero.",
        },
        { quoted: msg as any }
      );
      return;
    }

    // Detectar participantes mencionados o el citado
    const mentionedJids = contextInfo?.mentionedJid || [];
    let participantsNote = "";
    if (mentionedJids.length > 0) {
      participantsNote = `\n(Nota: Los participantes explícitamente señalados en la disputa son: ${mentionedJids.map((j) => `@${normalizeToPhoneJid(j)}`).join(", ")})`;
    }

    const transcript = recentMessages
      .map((m) => `[${m.senderName}]: ${m.body}`)
      .join("\n");

    const userPrompt = `Analizá la siguiente discusión reciente del grupo (últimos ${recentMessages.length} mensajes) y emití tu veredicto objetivo e imparcial:\n\n${transcript}${participantsNote}\n\nEmití tu fallo arbitral estructurado:`;

    let verdictText = "";

    // 3. Ejecutar: Probar modelo de razonamiento profundo Groq 120B primero (si hay cuota)
    const arbitroPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
    verdictText = (await generateWithGroqReasoning(arbitroPrompt, 500, 0.4, "arbitro")) || "";

    // Fallback transparente a la familia Gemini (Gemma 4 primero, Flash después)
    if (!verdictText) {
      verdictText = (await generateWithGemini(arbitroPrompt, 500, 0.4, "arbitro")) || "";
    }

    if (!verdictText) {
      await sock.sendMessage(
        remoteJid,
        {
          text: "❌ *El Tribunal está deliberando y se saturó la línea.* Tiren de vuelta !arbitro en un ratito.",
        },
        { quoted: msg as any }
      );
      return;
    }

    await sock.sendMessage(
      remoteJid,
      {
        text: verdictText,
      },
      { quoted: msg as any }
    );
  },
};
