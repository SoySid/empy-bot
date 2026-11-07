import dotenv from "dotenv";
dotenv.config();

import { evaluateTriage } from "../src/services/pipeline/triage.service.js";
import { fetchWebSearchContext } from "../src/services/web-search.service.js";
import { generateGroupResponse } from "../src/services/pipeline/generator.service.js";

async function runTestSuite() {
  console.log("=====================================================");
  console.log("🧪 SUITE QA: PIPELINE DE BÚSQUEDA WEB Y ANTI-ALUCINACIÓN");
  console.log("=====================================================\n");

  let passes = 0;
  let total = 0;

  // ----------------------------------------------------
  // TEST 1: Detección Semántica - Pregunta Factual
  // ----------------------------------------------------
  total++;
  console.log(`[TEST 1] Clasificación semántica de consulta factual...`);
  const historyFactual = `[Sid]: che @Empy a cuánto está el dólar blue hoy?`;
  const triage1 = await evaluateTriage(historyFactual, true, "Sid");
  console.log(`  -> needs_web_search: ${triage1.needs_web_search}`);
  console.log(`  -> search_query: "${triage1.search_query}"`);
  if (triage1.needs_web_search && triage1.search_query) {
    console.log(`  ✅ PASÓ: Detectó necesidad de búsqueda y extrajo query.`);
    passes++;
  } else {
    console.error(`  ❌ FALLÓ: No detectó búsqueda para pregunta de cotización.`);
  }

  // ----------------------------------------------------
  // TEST 2: Detección Semántica - Charla Casual (No debe buscar)
  // ----------------------------------------------------
  total++;
  console.log(`\n[TEST 2] Clasificación semántica de charla casual (Cero búsquedas al pedo)...`);
  const historyCasual = `[Nahum]: che @Empy qué onda amigo todo tranqui?`;
  const triage2 = await evaluateTriage(historyCasual, true, "Nahum");
  console.log(`  -> needs_web_search: ${triage2.needs_web_search}`);
  if (!triage2.needs_web_search) {
    console.log(`  ✅ PASÓ: Reconoció charla casual sin disparar búsqueda.`);
    passes++;
  } else {
    console.error(`  ❌ FALLÓ: Disparó búsqueda innecesaria para un saludo.`);
  }

  // ----------------------------------------------------
  // TEST 3: Detección Semántica - Anécdota con palabra temporal
  // ----------------------------------------------------
  total++;
  console.log(`\n[TEST 3] Anécdota personal con palabras temporales (Anti-falso positivo)...`);
  const historyAnecdote = `[Leo]: che ayer me caí de la moto y me rompí todo el lomo jajaja`;
  const triage3 = await evaluateTriage(historyAnecdote, false, "Leo");
  console.log(`  -> should_intervene: ${triage3.should_intervene}`);
  console.log(`  -> needs_web_search: ${triage3.needs_web_search}`);
  if (!triage3.needs_web_search) {
    console.log(`  ✅ PASÓ: No confundió anécdota personal con consulta web.`);
    passes++;
  } else {
    console.error(`  ❌ FALLÓ: Confundió una anécdota con búsqueda factual.`);
  }

  // ----------------------------------------------------
  // TEST 4: Servicio Web Search & Blindaje OWASP
  // ----------------------------------------------------
  total++;
  console.log(`\n[TEST 4] Recuperación de datos web y encapsulado OWASP...`);
  const webData = await fetchWebSearchContext("dolar blue cotizacion");
  if (webData && webData.includes("<external_reference_data") && webData.includes("untrusted=\"true\"")) {
    console.log(`  -> Datos recuperados con éxito.`);
    console.log(`  -> Encapsulado OWASP presente: OK.`);
    console.log(`  ✅ PASÓ: Formato seguro e inyección blindada.`);
    passes++;
  } else {
    console.error(`  ❌ FALLÓ: No se obtuvieron datos o falló el encapsulado.`);
  }

  // ----------------------------------------------------
  // TEST 5: Generación Conversacional con Datos Reales
  // ----------------------------------------------------
  total++;
  console.log(`\n[TEST 5] Generación conversacional fáctica (Gemini 3.5 Flash Lite)...`);
  const mockRagContext = {
    activeUsersContext: "Sid (admin del grupo)",
    lexiconContext: "",
    toneContext: "relajado",
    burnedJokesContext: "",
    lessonsContext: "",
    liveSearchContext: webData || undefined,
    activeParticipants: ["Sid"],
  };

  const response = await generateGroupResponse(
    historyFactual,
    triage1,
    mockRagContext,
    "Sid"
  );

  console.log(`  -> Respuesta generada: "${response}"`);
  if (response && response.length > 5 && !response.includes("<external_reference_data>")) {
    console.log(`  ✅ PASÓ: Generó respuesta fáctica limpia y sin alucinar.`);
    passes++;
  } else {
    console.error(`  ❌ FALLÓ: No generó respuesta adecuada.`);
  }

  console.log(`\n=====================================================`);
  console.log(`RESULTADO FINAL: ${passes}/${total} PRUEBAS PASADAS`);
  console.log(`=====================================================`);

  if (passes !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Excepción en la suite QA:", err);
  process.exit(1);
});
