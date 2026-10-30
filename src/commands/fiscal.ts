import { Command, CommandContext } from "./types.js";
import { searchUserPastStatements } from "../services/db/embedding.service.js";
import { buildForensicQuotedMessage } from "../services/db/message.service.js";
import { generateWithGemini, generateWithGroqReasoning } from "../services/ai.service.js";
import { generateMicrosoftTTS } from "../services/tts.service.js";
import {
  extractDigits,
  normalizeToPhoneJid,
  resolveToCanonicalJid,
} from "../services/whatsapp-identity.js";
import { getAllCachedProfiles, formatUserName } from "../services/db/user.service.js";

const FISCAL_SYSTEM_PROMPT = `Sos "El Fiscal Forense de Empyreal", el implacable auditor de contradicciones del grupo.
Tu tarea es comparar lo que un usuario sostiene o niega en la actualidad contra sus declaraciones del pasado archivadas en la base de datos.

REGLAS DE ORO:
1. SÉ CORTO, PICANTE Y CONTUNDENTE (máximo 60-90 palabras).
2. Tono pibe argentino, porteño, juez de potrero pero 100% justiciero ("Te fuiste domado", "El archivo no perdona", "Tiraste la piedra y te olvidaste").
3. Si encontrás una contradicción clara, señalá la contradicción y rematá con humor.
4. Si no se contradice rotundamente pero hay matices, declará "Duda razonable pero sospechoso".
5. Devolvé ÚNICAMENTE un JSON con esta estructura exacta:
{
  "best_match_index": 0, // índice del mensaje del archivo que mejor lo incrimina (empezando en 0)
  "verdict": "Tu remate picante y veredicto acusatorio para el grupo."
}`;

export const fiscalCommand: Command = {
  name: "fiscal",
  aliases: ["carpetazo", "contradiccion", "archivo", "auditor"],
  description: "Audita declaraciones pasadas de un usuario y le clava un carpetazo con cita visual nativa.",
  execute: async (ctx: CommandContext) => {
    const { sock, msg, remoteJid, contextInfo, args } = ctx;

    if (msg.key) {
      await sock.sendMessage(remoteJid, { react: { text: "📂", key: msg.key } }).catch(() => {});
    }

    // 1. Determinar si se solicita remate por audio
    const wantsAudio = args.some((a) => a.toLowerCase() === "audio" || a.toLowerCase() === "voz");
    const cleanArgs = args.filter((a) => a.toLowerCase() !== "audio" && a.toLowerCase() !== "voz");

    // 2. Determinar el usuario objetivo (citado o mencionado o primer argumento)
    let targetJid: string | null = null;
    let targetName = "el sospechoso";

    if (contextInfo?.participant) {
      targetJid = normalizeToPhoneJid(contextInfo.participant);
    } else if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      targetJid = normalizeToPhoneJid(contextInfo.mentionedJid[0]);
    } else if (cleanArgs.length > 0) {
      const firstArg = cleanArgs[0].replace(/^@/, "").trim().toLowerCase();
      const allProfiles = getAllCachedProfiles();
      const found = allProfiles.find(
        (p) =>
          p.primaryName.toLowerCase() === firstArg ||
          extractDigits(p.phone) === firstArg ||
          (p.aliases && p.aliases.some((a) => a.normalized === firstArg))
      );
      if (found) {
        targetJid = found.jid;
        targetName = found.primaryName;
      }
    }

    if (!targetJid) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `📂 *Uso de !fiscal:* Citá un mensaje del sospechoso o mencionalo: \`!fiscal @usuario [tema/afirmación]\` (opcional: agregar \`audio\` para remate por voz).`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const canonicalTargetJid = await resolveToCanonicalJid(targetJid);
    targetName = formatUserName(canonicalTargetJid).replace(/\*/g, "");

    // 3. Extraer el tema a auditar
    const topicQuery = cleanArgs
      .filter((a) => !a.startsWith("@") && a.toLowerCase() !== targetName.toLowerCase())
      .join(" ")
      .trim();

    // 4. Buscar declaraciones en base de datos forense
    const statements = await searchUserPastStatements(canonicalTargetJid, topicQuery, 6);

    const validStatementsWithId = statements.filter((s) => s.waMessageId && s.waMessageId.trim().length > 0);

    if (validStatementsWithId.length === 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `📂 *El archivo de @${targetName} está limpio... por ahora.* No encontré mensajes históricos con ID recuperable sobre este tema.`,
          mentions: [canonicalTargetJid],
        },
        { quoted: msg as any }
      );
      return;
    }

    // 5. Contrastar con IA
    const evidenceList = validStatementsWithId
      .map(
        (s, idx) =>
          `[Evidencia #${idx}] (${s.createdAt.toLocaleDateString("es-AR")}): "${s.body}"`
      )
      .join("\n");

    const userPrompt = `Sospechoso auditado: @${targetName}
Tema cuestionado: "${topicQuery || "Declaraciones contradictorias en el grupo"}"

EVIDENCIAS RECUPERADAS DEL ARCHIVO:
${evidenceList}

Analizá las pruebas y devolvé el veredicto JSON:`;

    const fullPrompt = `${FISCAL_SYSTEM_PROMPT}\n\n${userPrompt}`;
    let aiResponse = await generateWithGroqReasoning(fullPrompt, 250, 0.3, "classifier");
    if (!aiResponse) {
      aiResponse = await generateWithGemini(fullPrompt, 250, 0.3, "conversation");
    }

    let bestIdx = 0;
    let verdictText = `📂 *CARPETAZO FORENSE A @${targetName}:* El archivo no miente. Acá tenés lo que dijiste con tu propia cuenta:`;

    try {
      if (aiResponse) {
        const parsed = JSON.parse(aiResponse.replace(/```(?:json)?/gi, "").trim());
        if (typeof parsed.best_match_index === "number" && validStatementsWithId[parsed.best_match_index]) {
          bestIdx = parsed.best_match_index;
        }
        if (parsed.verdict) {
          verdictText = `📂 *CARPETAZO FORENSE A @${targetName}:*\n\n${parsed.verdict}`;
        }
      }
    } catch {}

    const incriminatedMessage = validStatementsWithId[bestIdx];

    // 6. Construir la cita visual nativa de Baileys
    const forensicQuote = buildForensicQuotedMessage({
      chatJid: incriminatedMessage.chatJid || remoteJid,
      waMessageId: incriminatedMessage.waMessageId!,
      senderJid: canonicalTargetJid,
      exactText: incriminatedMessage.body,
    });

    // 7. Despachar veredicto con cita nativa
    if (wantsAudio) {
      try {
        const audioBuffer = await generateMicrosoftTTS(verdictText.replace(/[*_~`]/g, ""));
        await sock.sendMessage(
          remoteJid,
          {
            audio: audioBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
            mentions: [canonicalTargetJid],
          },
          { quoted: forensicQuote as any }
        );
        return;
      } catch (audioErr) {
        console.warn("[Fiscal Command] Falló síntesis de audio, enviando texto plano:", audioErr);
      }
    }

    await sock.sendMessage(
      remoteJid,
      {
        text: verdictText,
        mentions: [canonicalTargetJid],
      },
      { quoted: forensicQuote as any }
    );
  },
};
