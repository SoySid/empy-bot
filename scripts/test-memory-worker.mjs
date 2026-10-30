import dotenv from "dotenv";
import { MemorySynthesisSchema } from "../src/workers/memory-synthesizer.js";
import { prisma } from "../src/services/db/prisma.js";

dotenv.config();

async function testWorkerExtraction() {
  console.log("🧪 --- PROBANDO WORKER DE MEMORIA (GEMINI 3.5 FLASH LITE + ZOD) --- 🧪\n");

  const testTranscript = `[Alex (5491100000001@s.whatsapp.net)]: che me compré una moto honda 250 ayer
[Lucas (5491100000002@s.whatsapp.net)]: zarpado Alex, felicitaciones
[Martin (5491100000003@s.whatsapp.net)]: alta nave rey, no choques
[Alex (5491100000001@s.whatsapp.net)]: jojo de una, re cheto`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const payload = {
    systemInstruction: {
      parts: [{
        text: `Sos el analizador cognitivo del grupo de WhatsApp Empyreal.
Analizá los mensajes de chat y extraé hechos útiles de los usuarios, modismos y tono.
Respondé ÚNICAMENTE un JSON válido que cumpla el esquema estricto.`,
      }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: testTranscript }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          userFacts: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                jid: { type: "STRING" },
                accion: { type: "STRING", enum: ["UPSERT", "DELETE"] },
                tipo: { type: "STRING", enum: ["PERMANENTE", "TEMPORADA", "EPISODICO"] },
                clave: { type: "STRING" },
                valor: { type: "STRING" },
              },
              required: ["jid", "accion", "tipo", "clave", "valor"],
            },
          },
          botCorrections: { type: "ARRAY", items: { type: "STRING" } },
          burnedJokes: { type: "ARRAY", items: { type: "STRING" } },
          memorableMoments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                userJid: { type: "STRING" },
                senderName: { type: "STRING" },
                body: { type: "STRING" },
              },
              required: ["userJid", "senderName", "body"],
            },
          },
          groupLexicon: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                term: { type: "STRING" },
                category: { type: "STRING", enum: ["slang", "insult_friendly", "expression", "reference"] },
                example: { type: "STRING" },
              },
              required: ["term", "category", "example"],
            },
          },
          toneOfWindow: { type: "STRING", enum: ["bardo", "joda", "serio", "mixto"] },
        },
        required: ["userFacts", "botCorrections", "burnedJokes", "memorableMoments", "groupLexicon", "toneOfWindow"],
      },
    },
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(`⏱️ Extracción de Flash Lite completada en ${Date.now() - start}ms.`);
  console.log("Raw JSON:", rawText);

  const parsed = JSON.parse(rawText);
  const validated = MemorySynthesisSchema.parse(parsed);

  console.log("\n✅ Validación Zod exitosa! Estructura tipada:");
  console.log(JSON.stringify(validated, null, 2));
}

testWorkerExtraction()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
