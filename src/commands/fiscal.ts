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

const FISCAL_SYSTEM_PROMPT = `Sos "El Fiscal Forense de Empyreal", el implacable auditor de contradicciones y carpetazos del grupo de WhatsApp.
Tu tarea es comparar la afirmación que un usuario hace o sostiene en la actualidad contra sus declaraciones pasadas archivadas en el historial del chat.

REGLAS DE AUDITORÍA:
1. TONO: Pibe argentino, porteño, juez de potrero implacable pero cómico y justiciero ("Te fuiste domado", "El archivo te liquidó", "No resistís archivo", "Te pisaste solo").
2. LONGITUD: Máximo 50-80 palabras. Directo y al hueso.
3. CRITERIO DE CONTRADICCIÓN:
   - Solo considerá que se contradice si una de las evidencias demuestra CLARAMENTE lo contrario a lo que afirma o lo deja en evidencia (ej: dice "odio el fernet" y en el mensaje dice "tomando un fernet").
   - Si se contradice:
     "contradiction": true,
     "best_match_index": <número del índice [Evidencia #X] que lo incrimina directamente>,
     "verdict": "<tu remate picante explicando la contradicción con humor>"
   - Si NO se contradice (habla de otra cosa, las pruebas no son concluyentes o confirman lo que dijo):
     "contradiction": false,
     "best_match_index": -1,
     "verdict": "<declaración cómica de que el sospechoso está limpio o que no hay pruebas suficientes>"

RESPONDE EXCLUSIVAMENTE CON ESTE JSON:
{
  "contradiction": true,
  "best_match_index": 0,
  "verdict": "Tu remate acá..."
}`;

async function extractSearchKeywords(claim: string): Promise<string[]> {
  try {
    const prompt = `Extraé de 2 a 5 palabras clave esenciales (sustantivos, nombres o verbos clave, en minúsculas y sin tildes) para buscar en un historial de chat si alguien habló del tema o se contradice con esta afirmación:
"${claim}"
Respondé ÚNICAMENTE las palabras separadas por comas (ejemplo: fernet, birra, alcohol, escabio).`;

    const aiRes = await generateWithGroqReasoning(prompt, 60, 0.2, "classifier");
    if (aiRes) {
      const words = aiRes
        .split(/[,;\n]+/)
        .map((w) => w.replace(/[^a-záéíóúñ0-9]/gi, "").trim().toLowerCase())
        .filter((w) => w.length >= 3);
      if (words.length > 0) return words;
    }
  } catch {}

  const stopWords = new Set([
    "para", "como", "pero", "este", "esta", "estos", "estas", "porque", "cuando", "donde",
    "quien", "desde", "hasta", "sobre", "entre", "hacia", "contra", "todos", "todas", "todo",
    "nada", "nunca", "jamas", "siempre", "algun", "alguna", "algunos", "algunas", "mucho",
    "mucha", "muchos", "muchas", "poco", "poca", "pocos", "pocas", "bueno", "buena", "malo",
    "mala", "bien", "hola", "chau", "hace", "hizo", "hacen", "dice", "dijo", "dicen", "tener",
    "tengo", "tiene", "tienen", "estar", "estoy", "estan", "estaba", "seria", "fueron", "creo",
    "ayer", "anteayer", "manana", "hoy", "meses", "dias", "anos"
  ]);

  return claim
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w))
    .slice(0, 5);
}

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

    // 2. Extraer texto del mensaje citado y su id
    const quotedMsg = contextInfo?.quotedMessage;
    const quotedText =
      quotedMsg?.conversation ||
      quotedMsg?.extendedTextMessage?.text ||
      quotedMsg?.imageMessage?.caption ||
      quotedMsg?.videoMessage?.caption ||
      "";
    const quotedWaId = contextInfo?.stanzaId || undefined;

    // 3. Determinar el usuario objetivo (citado o mencionado o primer argumento)
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
          text: `📂 *Uso de !fiscal:*\n• Citá un mensaje con \`!fiscal\` para auditar si se contradice con el archivo.\n• O escribí: \`!fiscal @usuario <afirmación o tema>\``,
        },
        { quoted: msg as any }
      );
      return;
    }

    const canonicalTargetJid = await resolveToCanonicalJid(targetJid);
    targetName = formatUserName(canonicalTargetJid).replace(/\*/g, "");

    const remainingArgs = cleanArgs
      .filter((a) => !a.startsWith("@") && a.toLowerCase() !== targetName.toLowerCase())
      .join(" ")
      .trim();

    // 4. Determinar la afirmación / tema a auditar
    let claimToAudit = "";
    if (quotedText && remainingArgs) {
      claimToAudit = `"${quotedText}" (foco: ${remainingArgs})`;
    } else if (quotedText) {
      claimToAudit = quotedText;
    } else if (remainingArgs) {
      claimToAudit = remainingArgs;
    }

    if (!claimToAudit) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `📂 *Uso de !fiscal:* Citá el mensaje que querés auditar con \`!fiscal\` o indicá qué querés buscar:\n\`!fiscal @${targetName} <afirmación o tema>\``,
          mentions: [canonicalTargetJid],
        },
        { quoted: msg as any }
      );
      return;
    }

    // 5. Extraer palabras clave de búsqueda
    const keywords = await extractSearchKeywords(claimToAudit);

    // 6. Obtener todos los JIDs del usuario (canónico, LID, teléfono)
    const allProfiles = getAllCachedProfiles();
    const targetProfile = allProfiles.find(
      (p) => p.jid === canonicalTargetJid || p.phone === canonicalTargetJid.split("@")[0]
    );
    const targetJids = [canonicalTargetJid];
    if (targetProfile?.lid) targetJids.push(targetProfile.lid);
    if (targetProfile?.phone && !targetJids.includes(`${targetProfile.phone}@s.whatsapp.net`)) {
      targetJids.push(`${targetProfile.phone}@s.whatsapp.net`);
    }

    // 7. Buscar declaraciones históricas en la base de datos
    const statements = await searchUserPastStatements(
      targetJids,
      keywords,
      {
        excludeWaMessageId: quotedWaId,
        limit: 8,
        vectorQuery: claimToAudit,
      }
    );

    if (statements.length === 0) {
      const searchTermsStr = keywords.length > 0 ? keywords.slice(0, 3).join(", ") : claimToAudit.slice(0, 30);
      await sock.sendMessage(
        remoteJid,
        {
          text: `📂 *DICTAMEN DEL FISCAL - SIN ANTECEDENTES:*\n\nRevisé el historial de @${targetName} buscando registros sobre _"${searchTermsStr}"_ y el archivo está limpio.\n\nNo hay mensajes previos que lo comprometan sobre esto. Causa archivada por falta de pruebas.`,
          mentions: [canonicalTargetJid],
        },
        { quoted: msg as any }
      );
      return;
    }

    // 8. Contrastar pruebas encontradas con IA
    const evidenceList = statements
      .map(
        (s, idx) =>
          `[Evidencia #${idx}] (${s.createdAt.toLocaleDateString("es-AR")}): "${s.body}"`
      )
      .join("\n");

    const facts = (targetProfile?.facts || [])
      .slice(0, 5)
      .map((f) => `- ${f.clave}: ${f.valor}`)
      .join("\n");
    const factsBlock = facts ? `\nDATOS CONOCIDOS DEL PERFIL:\n${facts}\n` : "";

    const userPrompt = `Sospechoso auditado: @${targetName}
Afirmación investigada: "${claimToAudit}"
${factsBlock}
EVIDENCIAS RECUPERADAS DEL ARCHIVO:
${evidenceList}

Analizá las pruebas y devolvé el veredicto JSON:`;

    const fullPrompt = `${FISCAL_SYSTEM_PROMPT}\n\n${userPrompt}`;
    let aiResponse = await generateWithGroqReasoning(fullPrompt, 250, 0.3, "classifier");
    if (!aiResponse) {
      aiResponse = await generateWithGemini(fullPrompt, 250, 0.3, "conversation");
    }

    let isContradiction = false;
    let bestIdx = -1;
    let verdictText = `El archivo fue revisado y no se hallaron contradicciones contundentes.`;

    try {
      if (aiResponse) {
        const parsed = JSON.parse(aiResponse.replace(/```(?:json)?/gi, "").trim());
        if (typeof parsed.contradiction === "boolean") {
          isContradiction = parsed.contradiction;
        }
        if (
          typeof parsed.best_match_index === "number" &&
          parsed.best_match_index >= 0 &&
          statements[parsed.best_match_index]
        ) {
          bestIdx = parsed.best_match_index;
        }
        if (parsed.verdict) {
          verdictText = parsed.verdict;
        }
      }
    } catch (parseErr) {
      console.warn("[Fiscal Command] Error parseando respuesta de IA:", parseErr);
    }

    // 9. Si NO hay contradicción o no se identificó mensaje incriminatorio
    if (!isContradiction || bestIdx === -1) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `⚖️ *DICTAMEN DEL FISCAL - ABSOLUCIÓN DE @${targetName}:*\n\n${verdictText}`,
          mentions: [canonicalTargetJid],
        },
        { quoted: msg as any }
      );
      return;
    }

    // 10. Si HAY contradicción: clavar carpetazo citando visualmente el mensaje del pasado
    const incriminatedMessage = statements[bestIdx];
    const forensicQuote = incriminatedMessage.waMessageId
      ? buildForensicQuotedMessage({
          chatJid: incriminatedMessage.chatJid || remoteJid,
          waMessageId: incriminatedMessage.waMessageId,
          senderJid: canonicalTargetJid,
          exactText: incriminatedMessage.body,
        })
      : msg;

    const finalText = `📂 *CARPETAZO FORENSE A @${targetName}:*\n\n${verdictText}`;

    if (wantsAudio) {
      try {
        const audioBuffer = await generateMicrosoftTTS(finalText.replace(/[*_~`]/g, ""));
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
        text: finalText,
        mentions: [canonicalTargetJid],
      },
      { quoted: forensicQuote as any }
    );
  },
};
