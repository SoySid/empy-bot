import dotenv from "dotenv";
import { evaluateTriage } from "../src/services/pipeline/triage.service.js";
import { hydrateContextForActiveUsers } from "../src/services/pipeline/rag-hydration.service.js";
import { generateGroupResponse } from "../src/services/pipeline/generator.service.js";
import { prisma } from "../src/services/db/prisma.js";

dotenv.config();

async function runPipelineSimulation() {
  console.log("🧪 --- SIMULANDO PIPELINE DE CHAT EN VIVO (4 CAPAS) --- 🧪\n");

  // Simulación: Diálogo en el grupo
  const testSpeaker = "Tester";
  const user = await prisma.userProfile.findFirst({ where: { primaryName: testSpeaker } });
  const activeJids = user ? [user.jid] : [];

  const conversationHistory = `[UserA]: che el server está caído otra vez
[UserB]: mal, quien tocó la configuración?
[Tester]: yo no fui, estuve todo el día trabajando
[UserA]: seguro fue el tester probando cosas raras
[Tester]: dejá de acusar sin pruebas`;

  console.log("📜 Historial de entrada:");
  console.log(conversationHistory);
  console.log("\n--------------------------------------------------");

  // Capa 2: Triage en Groq con qwen/qwen3.8-27b
  console.log("⚡ [Capa 2] Ejecutando Triage en Groq (qwen/qwen3.8-27b)...");
  const triageStart = Date.now();
  const triage = await evaluateTriage(conversationHistory, false, testSpeaker, "UserB");
  console.log(`⏱️ Triage listo en ${Date.now() - triageStart}ms:`, triage);

  if (!triage.should_intervene || triage.intent === "silencio") {
    console.log("🤫 El triage decidió silencio para esta conversación.");
    return;
  }

  // Capa 3: Hidratación RAG Quirúrgica desde Neon PostgreSQL
  console.log("\n📦 [Capa 3] Hidratando contexto desde Neon PostgreSQL...");
  const ragStart = Date.now();
  const ragContext = await hydrateContextForActiveUsers(activeJids, conversationHistory);
  console.log(`⏱️ RAG listo en ${Date.now() - ragStart}ms.`);
  console.log("Participantes detectados:", ragContext.activeParticipants);
  console.log("Hechos hidratados:\n", ragContext.activeUsersContext);

  // Capa 4: Generación con Gemma 4 31B en Google AI Studio
  console.log("\n🧠 [Capa 4] Generando respuesta con Gemma 4 31B (Google AI Studio)...");
  const genStart = Date.now();
  const reply = await generateGroupResponse(conversationHistory, triage, ragContext, testSpeaker);
  console.log(`⏱️ Generación lista en ${Date.now() - genStart}ms.`);

  console.log("\n==================================================");
  console.log("💬 RESPUESTA GENERADA POR EMPY PARA WHATSAPP:");
  console.log("==================================================");
  console.log(reply);
  console.log("==================================================");
}

runPipelineSimulation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
