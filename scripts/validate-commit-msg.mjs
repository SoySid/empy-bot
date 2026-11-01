import fs from "node:fs";

const msgFile = process.argv[2];

if (!msgFile || !fs.existsSync(msgFile)) {
  console.log("🛡️ [Commit Guard] No se proporcionó archivo de mensaje, omitiendo.");
  process.exit(0);
}

const commitMsg = fs.readFileSync(msgFile, "utf8").trim();

// Ignorar comentarios generados automáticamente por git (líneas que empiezan con #)
const cleanLines = commitMsg
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

const textToValidate = cleanLines.join(" ");

if (!textToValidate) {
  process.exit(0);
}

// Términos estrictamente prohibidos que delatan el uso de herramientas o menciones de IA
const FORBIDDEN_WORDS = [
  /\bai\b/i,
  /\bia\b/i,
  /\bprompt(s)?\b/i,
  /\bhumaniz(ar|ado|acion|ación|er)\b/i,
  /\basistente(s)?\b/i,
  /\bllm(s)?\b/i,
  /\bgemini\b/i,
  /\bclaude\b/i,
  /\bchatgpt\b/i,
  /\bcopilot\b/i,
  /\bcursor\b/i,
  /\bantigravity\b/i,
  /\bdeepmind\b/i,
  /\bgpt(-[0-9a-z]+)?\b/i,
];

const foundViolations = [];

for (const pattern of FORBIDDEN_WORDS) {
  const match = textToValidate.match(pattern);
  if (match) {
    foundViolations.push(match[0]);
  }
}

if (foundViolations.length > 0) {
  console.error("\n🚫 [Commit Guard] COMMIT RECHAZADO: Términos prohibidos detectados en el mensaje:");
  for (const word of foundViolations) {
    console.error(`   ❌ Palabra no permitida: "${word}"`);
  }
  console.error(`\nMensaje enviado: "${textToValidate}"`);
  console.error("\n💡 Redacta el mensaje en español técnico estándar de desarrollo.");
  console.error("   Ejemplos correctos: 'feat: agregar validacion de pagos', 'fix: corregir calculo de saldo', 'refactor: modularizar funciones'\n");
  process.exit(1);
}

process.exit(0);
