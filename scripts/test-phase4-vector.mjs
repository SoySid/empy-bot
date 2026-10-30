import dotenv from "dotenv";
import { saveMessageEmbedding, searchRelevantPastMessages } from "../src/services/db/embedding.service.js";
import { prisma } from "../src/services/db/prisma.js";

dotenv.config();

async function testPhase4() {
  console.log("🧪 --- PROBANDO FASE 4: MEMORIA VECTORIAL SEMÁNTICA (GEMINI EMBEDDING 2 + PGVECTOR) --- 🧪\n");

  const testUserJid = "5491100000001@s.whatsapp.net";
  const testSender = "Cris";
  const testAnecdote = "Ayer a la noche se nos quemó la fuente de la PC mientras jugábamos la final del torneo de LoL y perdimos la promo";

  console.log(`1. Guardando anécdota memorable en Neon con pgvector (768d)...`);
  console.log(`📝 "${testAnecdote}"`);
  const saveStart = Date.now();
  await saveMessageEmbedding(testUserJid, testSender, testAnecdote);
  console.log(`✅ Guardado vectorial completado en ${Date.now() - saveStart}ms.\n`);

  // Búsqueda semántica usando distancia coseno (<=>)
  const searchQuery = "¿qué les pasó jugando la final del torneo?";
  console.log(`2. Ejecutando búsqueda semántica nativa con consulta:`);
  console.log(`🔍 "${searchQuery}"`);
  const searchStart = Date.now();
  const results = await searchRelevantPastMessages(searchQuery, 2, 0.50);
  console.log(`⏱️ Búsqueda vectorial completada en ${Date.now() - searchStart}ms.\n`);

  console.log("🏆 Resultados recuperados por pgvector:");
  for (const r of results) {
    console.log(`- [@${r.senderName}] (Similitud: ${(r.similarity * 100).toFixed(1)}%): "${r.body}"`);
  }

  // Limpieza del registro de prueba
  await prisma.messageEmbedding.deleteMany({
    where: { body: testAnecdote },
  });
  console.log("\n🧹 Registro de prueba limpiado exitosamente.");
}

testPhase4()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
