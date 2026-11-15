import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  STICKER_MOOD_CATEGORIES,
  classifyStickerMood,
  getClassifier,
  pickSmartStickerCategory,
  type StickerMoodCategory,
} from "../src/services/neural/sticker-classifier.service.js";

interface TestCase {
  expected: StickerMoodCategory;
  text: string;
}

const UNSEEN_TEST_CASES: TestCase[] = [
  // bardo
  { expected: "bardo", text: "deja de mandar cagadas boludo me tenes harto" },
  { expected: "bardo", text: "sos un forro pinchaste toda la partida gil" },
  // burla
  { expected: "burla", text: "alto manco sos no le pegas ni a una pared" },
  { expected: "burla", text: "te re domaron maestro anda a dormir" },
  // risa
  { expected: "risa", text: "jajajajaja me muero de la risa lpm" },
  { expected: "risa", text: "kjjjj es lo mas gracioso que vi hoy jsjs" },
  // triste
  { expected: "triste", text: "que bajon loco hoy estoy re deprimido" },
  { expected: "triste", text: "me fue mal en todo estoy hecho mierda" },
  // wtf
  { expected: "wtf", text: "que carajo es esa cosa re turbina amigo" },
  { expected: "wtf", text: "wtf chabon flasheaste cualquiera mal" },
  // festejo
  { expected: "festejo", text: "vamos carajo salimos campeones al fin" },
  { expected: "festejo", text: "gg ez ganamos la final vamooos" },
  // afecto
  { expected: "afecto", text: "te quiero mucho hermano gracias por bancarme" },
  { expected: "afecto", text: "un abrazo gigante sos lo mas grande amigo" },
  // duda
  { expected: "duda", text: "che alguien sabe a que hora arranca esto?" },
  { expected: "duda", text: "no se si conviene probar eso o esperar?" },
];

function run(): void {
  const trainStart = performance.now();
  getClassifier();
  const trainMs = performance.now() - trainStart;

  let correct = 0;
  const infStart = performance.now();

  for (const tc of UNSEEN_TEST_CASES) {
    const res = classifyStickerMood(tc.text);
    const ok = res.topCategory === tc.expected;
    if (ok) correct++;
    const mark = ok ? "OK  " : "MISS";
    console.log(
      `[${mark}] expected=${tc.expected.padEnd(8)} got=${res.topCategory.padEnd(8)} conf=${(res.confidence * 100).toFixed(1)}% | "${tc.text}"`
    );
  }

  const infMs = performance.now() - infStart;
  const avgInfMs = infMs / UNSEEN_TEST_CASES.length;
  const accuracy = correct / UNSEEN_TEST_CASES.length;

  console.log("\n--- Resumen ---");
  console.log(`Categorías activas: ${STICKER_MOOD_CATEGORIES.length}`);
  console.log(`Latencia entrenamiento (singleton): ${trainMs.toFixed(2)} ms`);
  console.log(
    `Latencia inferencia (${UNSEEN_TEST_CASES.length} frases): ${infMs.toFixed(2)} ms total (${avgInfMs.toFixed(3)} ms/frase)`
  );
  console.log(
    `Precisión unseen: ${correct}/${UNSEEN_TEST_CASES.length} (${(accuracy * 100).toFixed(1)}%)`
  );

  // Verificación de restricciones de eligibleCats en pickSmartStickerCategory
  assert.equal(
    pickSmartStickerCategory("vamos carajo ganamos", []),
    null,
    "Debe retornar null si eligibleCats está vacío"
  );

  const subset = ["triste", "duda"];
  for (let i = 0; i < 20; i++) {
    const picked = pickSmartStickerCategory("que bajon hermano estoy re triste", subset);
    assert.ok(
      picked !== null && subset.includes(picked),
      `Categoría elegida "${picked}" fuera de eligibleCats`
    );
  }

  const single = ["afecto"];
  assert.equal(
    pickSmartStickerCategory("te quiero amigo", single),
    "afecto",
    "Debe respetar un único elemento en eligibleCats"
  );

  assert.ok(
    accuracy >= 0.75,
    `Precisión insuficiente: ${(accuracy * 100).toFixed(1)}% < 75%`
  );

  console.log("Checks de eligibleCats y umbral >= 75%: PASS");
}

run();
