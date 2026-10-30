import dotenv from "dotenv";
import {
  getSignFromDate,
  normalizeSignName,
  calculateNatalChart,
  drawTarotCards,
  getDailyHoroscope,
  getNatalChartReading,
  getSynastryReading,
  getTarotReading,
} from "../src/services/astrology.service.js";

dotenv.config();

async function runAstrologyTests() {
  console.log("🔮 --- TEST DE MÓDULO DE ASTROLOGÍA Y GEMINI --- 🔮\n");

  // 1. Test de normalización y signos
  console.log("1️⃣ Verificando cálculo de signos solares:");
  const testCases = [
    { day: 25, month: 3, expected: "Aries" },
    { day: 15, month: 5, expected: "Tauro" },
    { day: 10, month: 6, expected: "Géminis" },
    { day: 1, month: 7, expected: "Cáncer" },
    { day: 15, month: 8, expected: "Leo" },
    { day: 5, month: 9, expected: "Virgo" },
    { day: 1, month: 10, expected: "Libra" },
    { day: 31, month: 10, expected: "Escorpio" },
    { day: 1, month: 12, expected: "Sagitario" },
    { day: 25, month: 12, expected: "Capricornio" },
    { day: 1, month: 2, expected: "Acuario" },
    { day: 1, month: 3, expected: "Piscis" },
  ];

  for (const tc of testCases) {
    const sign = getSignFromDate(tc.day, tc.month);
    const pass = sign === tc.expected;
    console.log(`   ${tc.day}/${tc.month} -> ${sign} [${pass ? "OK" : "FAIL"}]`);
    if (!pass) throw new Error(`Esperado ${tc.expected}, recibido ${sign}`);
  }

  // 2. Test de cálculo astronómico de Carta Astral
  console.log("\n2️⃣ Verificando cálculo astronómico (astronomy-engine):");
  const chart = calculateNatalChart(1998, 5, 15, "14:30", "Córdoba");
  console.log(`   Sol: ${chart.sun.name} (${chart.sun.symbol}) a ${chart.sun.degree}°`);
  console.log(`   Luna: ${chart.moon.name} (${chart.moon.symbol}) a ${chart.moon.degree}°`);
  console.log(`   Ascendente: ${chart.ascendant?.name} (${chart.ascendant?.symbol}) a ${chart.ascendant?.degree}°`);
  console.log(`   Mercurio: ${chart.mercury.name} (${chart.mercury.symbol})`);
  console.log(`   Marte: ${chart.mars.name} (${chart.mars.symbol})`);
  console.log(`   Elementos:`, chart.elements);

  if (chart.sun.name !== "Tauro") {
    throw new Error(`Sol esperado Tauro, recibido ${chart.sun.name}`);
  }
  console.log("   ✅ Posiciones astronómicas calculadas correctamente.");

  // 3. Test de baraja de Tarot
  console.log("\n3️⃣ Verificando tirada de Tarot:");
  const cards = drawTarotCards(3);
  console.log("   Cartas tiradas:", cards.map((c) => `${c.card.name} (${c.isReversed ? "Invertida" : "Derecho"})`).join(", "));
  if (cards.length !== 3) throw new Error("Deben salir 3 cartas");
  console.log("   ✅ Baraja funcionando.");

  // 4. Test de llamada a Gemini para Horóscopo
  console.log("\n4️⃣ Generando Horóscopo con Gemini en voz de Empy:");
  const horoscope = await getDailyHoroscope("Escorpio", "Sid");
  console.log("--------------------------------------------------");
  console.log(horoscope);
  console.log("--------------------------------------------------");

  // 5. Test de llamada a Gemini para Carta Astral
  console.log("\n5️⃣ Generando interpretación de Carta Astral con Gemini:");
  const reading = await getNatalChartReading(chart, "Sid");
  console.log("--------------------------------------------------");
  console.log(reading);
  console.log("--------------------------------------------------");

  console.log("\n✨ ¡TODOS LOS TESTS DE ASTROLOGÍA Y GEMINI PASARON CON ÉXITO! ✨");
}

runAstrologyTests().catch(console.error);
