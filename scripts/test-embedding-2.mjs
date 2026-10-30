import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function testEmbedding() {
  const modelName = "gemini-embedding-2";
  console.log(`Testing ${modelName} with 768 dimensions...`);

  // Testing via REST to support outputDimensionality
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${process.env.GEMINI_API_KEY}`;
  const payload = {
    model: `models/${modelName}`,
    content: {
      parts: [{ text: "che se cayó el servidor de minecraft ayer a la noche" }]
    },
    outputDimensionality: 768
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.embedding?.values) {
    console.log(`✅ Embedding generated successfully! Length: ${data.embedding.values.length}`);
    console.log(`Sample: [${data.embedding.values.slice(0, 5).join(", ")}...]`);
  } else {
    console.error("Error from API:", data);
  }
}

testEmbedding().catch(console.error);
