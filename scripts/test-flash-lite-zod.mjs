import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const UserFactSchema = z.object({
  jid: z.string(),
  accion: z.enum(["UPSERT", "DELETE"]),
  tipo: z.enum(["PERMANENTE", "TEMPORADA", "EPISODICO"]),
  clave: z.string(),
  valor: z.string(),
});

const MemorySynthesisSchema = z.object({
  userFacts: z.array(UserFactSchema).default([]),
  botCorrections: z.array(z.string()).default([]),
  burnedJokes: z.array(z.string()).default([]),
  memorableMoments: z.array(z.object({
    userJid: z.string(),
    senderName: z.string(),
    body: z.string(),
  })).default([]),
  groupLexicon: z.array(z.object({
    term: z.string(),
    category: z.enum(["slang", "insult_friendly", "expression", "reference"]),
    example: z.string(),
  })).default([]),
  toneOfWindow: z.enum(["bardo", "joda", "serio", "mixto"]).default("mixto"),
});

async function testFlashLiteStructured() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const systemInstruction = `Sos el sintetizador de memoria del grupo de WhatsApp Empyreal.
Analizá los mensajes de chat y extraé hechos útiles, momentos memorables, modismos y tono.`;

  const userPrompt = `Mensajes recientes:
[549110001@s.whatsapp.net] (Alex): me mudé a Córdoba ayer
[549110002@s.whatsapp.net] (Lucas): buena onda Alex, linda ciudad
[549110001@s.whatsapp.net] (Alex): sí, re piola mal, alta skuba`;

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
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
          botCorrections: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          burnedJokes: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
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
          toneOfWindow: {
            type: "STRING",
            enum: ["bardo", "joda", "serio", "mixto"],
          },
        },
        required: ["userFacts", "botCorrections", "burnedJokes", "memorableMoments", "groupLexicon", "toneOfWindow"],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("Raw JSON output:", rawText);

  const parsed = JSON.parse(rawText);
  const validated = MemorySynthesisSchema.parse(parsed);
  console.log("✅ Zod validation successful! Validated data:", JSON.stringify(validated, null, 2));
}

testFlashLiteStructured().catch(console.error);
