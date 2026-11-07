import { Command, CommandContext } from "./types.js";
import { generateWithGemini } from "../services/ai.service.js";

const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 25 * 1000;

export const socratesCommand: Command = {
  name: "socrates",
  aliases: ["sócrates", "filosofo", "filósofo", "mayeutica", "mayéutica"],
  description: "Examina una frase u opinión con ironía socrática y mayéutica punzante (!socrates [frase] o citando un mensaje).",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg, senderProfile, quotedSenderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    // Verificar cooldown por usuario
    const now = Date.now();
    const lastUsed = userCooldowns.get(senderJid) || 0;
    if (now - lastUsed < COOLDOWN_MS) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
      await sock.sendMessage(
        remoteJid,
        { text: `⏳ Sócrates está procesando la última contradicción. Esperá *${remainingSec}s* antes de interpelar de nuevo.` },
        { quoted: msg as any }
      );
      return;
    }

    // Texto explícito o del mensaje citado
    let textTarget = cleanText.trim();
    if (!textTarget && quotedMsg) {
      textTarget =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption ||
        "";
      textTarget = textTarget.trim();
    }

    if (!textTarget) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🏛️ *«Solo sé que no sé nada... y vos tampoco dijiste nada.»*\n\n` +
            `Citá un mensaje del grupo o escribí una premisa después de *!socrates* para que la examinemos en el ágora.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    userCooldowns.set(senderJid, now);

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🏛️", key: msg.key } }).catch(() => {});
      }

      const authorName = quotedSenderProfile
        ? quotedSenderProfile.primaryName || quotedSenderProfile.pushName || "un ciudadano"
        : senderProfile?.primaryName || senderProfile?.pushName || "el interlocutor";

      const cleanTarget = textTarget.replace(/\s+/g, " ").trim();
      const previewTarget = cleanTarget.length > 110 ? `${cleanTarget.slice(0, 107)}...` : cleanTarget;

      const prompt = `Sos Sócrates encarnado en un grupo de amigos de WhatsApp en Argentina.
Un participante del grupo acaba de sostener esta premisa o comentario:
<<<PREMISA_A_EXAMINAR>>>
${cleanTarget}
<<<FIN_PREMISA>>>
Autor atribuido: ${authorName}

Tu tarea es aplicar el auténtico MÉTODO SOCRÁTICO (ironía socrática + mayéutica pura) para desmontar la afirmación:
1. Párrafo 1 (Cuestionamiento socrático): Tratás la afirmación con fingida reverencia, señalás su contradicción interna, absurdo lógico o hipocresía intrínseca con ironía elegante y punzante (máximo 2 a 3 oraciones directas).
2. Párrafo 2 (Remate mayéutico): Cerrás obligatoriamente con una sola pregunta retórica/mayéutica punzante que deje al autor y al grupo en silencio recalculando.

REGLAS ESTRICTAS:
- Estilo: Irónico, perspicaz, con chispa dialéctica natural. Cero solemnidad de enciclopedia o tono de chatbot de autoayuda.
- PROHIBIDO: Usar introducciones vacías ("Hola", "Estimado", "Veamos", "Como Sócrates te diría"). Andá directo a interpelar lo que dijo.
- PROHIBIDO: Citar a otros filósofos (Platón, Aristóteles, etc.).
- Longitud total: Entre 50 y 90 palabras. Breve, contundente y quirúrgico.`.trim();

      const socratesText = await generateWithGemini(prompt, 300, 0.7, "socrates");

      const responseText =
        `🏛️ *Premisa examinada:* _«${previewTarget}»_\n\n` +
        `${socratesText || "Examiné tu premisa y descubrí que carece de sustancia hasta para ser refutada."}`;

      await sock.sendMessage(
        remoteJid,
        { text: responseText },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Socrates Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ El oráculo de Delfos no respondió en este momento. Volvé a intentar en unos instantes." },
        { quoted: msg as any }
      );
    }
  },
};
