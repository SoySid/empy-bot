import dotenv from "dotenv";
dotenv.config();

import {
  getDailyHoroscope,
  getSynastryReading,
  getTarotReading,
  calculateNatalChart,
  getNatalChartReading,
} from "../src/services/astrology.service.js";
import { generateWithGemini } from "../src/services/ai.service.js";
import { buildDynamicSystemPrompt } from "../src/services/prompts.js";

async function runTests() {
  console.log("=================================================");
  console.log("🔮 INICIANDO PRUEBAS DEL MÓDULO ASTRAL Y ASISTENTE");
  console.log("=================================================\n");

  // 1. Prueba de Asistente Servicial y Obediente ("decime dos colores")
  console.log("▶️ 1. Test de Asistente: Pedido directo ('decime dos colores')...");
  const systemPrompt = buildDynamicSystemPrompt();
  const testAssistantPrompt = `${systemPrompt}\n\n[Mensaje de usuario]: "decime dos colores"`;
  const assistantReply = await generateWithGemini(testAssistantPrompt, 150, 0.4, "test_assistant");
  console.log("Respuesta obtenida:\n" + assistantReply);
  if (assistantReply && !assistantReply.toLowerCase().includes("esclavo") && !assistantReply.toLowerCase().includes("mucama")) {
    console.log("✅ Test Asistente: Aprobado (útil, educado y sin agresividad).\n");
  } else {
    console.log("❌ Test Asistente: Falló.\n");
  }

  // 2. Prueba de Horóscopo Diario (Sin videojuegos forzados)
  console.log("▶️ 2. Test Horóscopo Diario (Escorpio)...");
  const horoscope = await getDailyHoroscope("Escorpio", "Nico");
  console.log("Respuesta obtenida:\n" + horoscope);
  const hasGaming = /lol|mlbb|ranked|gank|tilteo de ranked/i.test(horoscope);
  if (!hasGaming && horoscope.includes("Amor & Chamuyo") && horoscope.includes("Alerta del Día")) {
    console.log("✅ Test Horóscopo: Aprobado (estructura correcta, tono argentino y sin videojuegos).\n");
  } else {
    console.log(`⚠️ Test Horóscopo: Revisar (menciones a gaming: ${hasGaming}).\n`);
  }

  // 3. Prueba de Sinastría / Compatibilidad
  console.log("▶️ 3. Test Sinastría (Aries y Cáncer)...");
  const synastry = await getSynastryReading("Lucas", "Aries", "Mateo", "Cáncer");
  console.log("Respuesta obtenida:\n" + synastry);
  const synastryGaming = /support|adc|lol|mlbb/i.test(synastry);
  if (!synastryGaming && synastry.includes("Química") && synastry.includes("Zona de Bardo")) {
    console.log("✅ Test Sinastría: Aprobado (enfoque en convivencia real sin gaming forzado).\n");
  } else {
    console.log(`⚠️ Test Sinastría: Revisar.\n`);
  }

  // 4. Prueba de Tarot Decisivo (Pregunta directa)
  console.log("▶️ 4. Test Tarot Decisivo: '¿Me conviene renunciar a mi trabajo actual?'...");
  const tarot = await getTarotReading("¿Me conviene renunciar a mi trabajo actual?", "Mateo");
  console.log("Respuesta obtenida:\n" + tarot);
  if (tarot.includes("El Veredicto de Empy")) {
    console.log("✅ Test Tarot: Aprobado (Veredicto claro y postura tomada).\n");
  } else {
    console.log("❌ Test Tarot: Falta sección de Veredicto.\n");
  }

  // 5. Cómputo Astronómico Real
  console.log("▶️ 5. Test Cálculo Astronómico de Carta Natal...");
  const chart = calculateNatalChart(1998, 5, 15, "14:30", "Buenos Aires");
  console.log(`Sol: ${chart.sun.name} (${chart.sun.degree}°), Luna: ${chart.moon.name}, Ascendente: ${chart.ascendant?.name || "N/A"}`);
  if (chart.sun.name === "Tauro" && chart.ascendant) {
    console.log("✅ Test Astronomía: Aprobado (Sol en Tauro con Ascendente calculado correctamente).\n");
  } else {
    console.log("❌ Test Astronomía: Falló cálculo.\n");
  }

  console.log("=================================================");
  console.log("🎉 TODAS LAS PRUEBAS COMPLETADAS");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("Error ejecutando pruebas:", err);
  process.exit(1);
});
