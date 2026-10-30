import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

function extractFirstJson(raw: string): any {
  const match = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.indexOf("}", start);
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function listAllAvailableModels() {
  console.log("\n📡 1. Consultando a Google qué modelos exactos tiene tu API Key...");
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = (await res.json()) as any;
    
    if (data.models) {
      const embeddingModels = data.models
        .filter((m: any) => m.name.includes("embed"))
        .map((m: any) => m.name.replace("models/", ""));

      console.log("   ✅ Modelos de Embedding disponibles en tu cuenta:", embeddingModels);
      return embeddingModels;
    } else {
      console.log("   ❌ No devolvió modelos:", data);
      return [];
    }
  } catch (err: any) {
    console.log("   ❌ Error listando modelos:", err?.message || err);
    return [];
  }
}

async function testGeminiWithExtractor() {
  console.log("\n🥊 2. Probando Extractor Blindado en Gemini 2.5 Flash...");
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    });

    const prompt = `Extraé la ciudad y el juego. Mensaje: "Carlos de Mendoza juega ajedrez".
Respondé ÚNICAMENTE un JSON con este formato: {"ciudad": "Mendoza", "juego": "Ajedrez"}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const parsed = extractFirstJson(raw);

    if (parsed && parsed.ciudad) {
      console.log("   ✅ ¡Éxito! JSON extraído a la perfección:", parsed);
    } else {
      console.log("   ⚠️ Respuesta en bruto:", raw);
    }
  } catch (err: any) {
    console.log("   ❌ Error en Gemini:", err?.message || err);
  }
}

async function testDiscoveredEmbedding(models: string[]) {
  console.log("\n🗄️ 3. Probando Embeddings con los nombres reales descubiertos...");
  const listToTry = models.length > 0 ? models : ["text-embedding-004", "embedding-001"];

  for (const name of listToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const res = await model.embedContent("Prueba de vector de Empyreal");
      console.log(`   ✅ '${name}' FUNCIONA PERFECTO -> Vector de ${res.embedding.values.length} dimensiones.`);
      return name;
    } catch (e: any) {
      console.log(`   ❌ '${name}' falló: ${e?.message?.slice(0, 100)}`);
    }
  }
}

async function main() {
  const discovered = await listAllAvailableModels();
  await testGeminiWithExtractor();
  await testDiscoveredEmbedding(discovered);
  console.log("\n============================================================\n");
}

main();
