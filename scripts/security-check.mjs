import { execSync } from "node:child_process";
import fs from "node:fs";

const isFullScan = process.argv.includes("--all");

const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(\..+)?$/i, // Prohíbe .env, .env.local, .env.production (salvo .env.example)
  /^auth_info(\/|\\)/i,
  /^baileys_auth_info(\/|\\)/i,
  /^stickers(\/|\\)/i,
  /^cookies.*\.txt$/i,
  /\.(db|db-journal|db-wal|sqlite|sqlite3)$/i,
  /\.(pem|key|pfx|cer)$/i,
  /^GEMINI\.md$/i,
  /^CLAUDE\.md$/i,
  /^\.gemini(\/|\\)/i,
  /^\.antigravity(\/|\\)/i,
  /^\.agent(\/|\\)/i,
  /^brain(\/|\\)/i,
  /^\.system_generated(\/|\\)/i,
  /serviceAccountKey\.json$/i,
  /credentials\.json$/i,
];

const SECRET_PATTERNS = [
  { name: "Clave de OpenAI / Groq / Servicio", regex: /\b(sk-[a-zA-Z0-9_\-]{20,}|gsk_[a-zA-Z0-9_\-]{20,})\b/ },
  { name: "API Key de Google", regex: /\bAIzaSy[0-9A-Za-z\-_]{33}\b/ },
  { name: "Token personal de GitHub", regex: /\bghp_[a-zA-Z0-9]{36}\b/ },
  { name: "Token de Slack/Discord/Bot", regex: /\b(xox[baprs]-[0-9a-zA-Z]{10,}|bot[0-9]{8,12}:[a-zA-Z0-9_-]{35})\b/ },
  { name: "Clave privada criptográfica", regex: /BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY/ },
  { name: "Cadena de conexión con contraseña real", regex: /postgresql?:\/\/(?!postgres\.\[PROJECT-REF\])[a-zA-Z0-9_\-\.]+:[^@\s\/]{3,}@[a-zA-Z0-9_\-\.]+/ },
];

const AI_MARKER_PATTERNS = [
  { name: "Comentario delator de AI en código", regex: /\/\/\s*(generado por|generado con|created (with|by)|escrito por|prompt( de)?|asistente (ia|ai))\b/i },
  { name: "Firma de chatbot en comentario", regex: /\/\*[\s\S]*?(generado por ia|prompt inicial|gemini assistant)[\s\S]*?\*\//i },
];

function checkFiles() {
  const violations = [];

  let filesToCheck = [];
  try {
    const gitCommand = isFullScan ? "git ls-files" : "git diff --cached --name-only";
    const stdout = execSync(gitCommand, { encoding: "utf8" }).trim();
    filesToCheck = stdout ? stdout.split(/\r?\n/).map((f) => f.trim()).filter(Boolean) : [];
  } catch (err) {
    console.error("[Security Shield] Error ejecutando git diff:", err.message);
    process.exit(1);
  }

  // 1. Validar nombres de archivo prohibidos
  for (const file of filesToCheck) {
    if (file === ".env.example") continue;

    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(file)) {
        violations.push(`[Archivo Prohibido] "${file}" no puede estar bajo seguimiento de Git.`);
        break;
      }
    }
  }

  // 2. Validar contenido (secretos y comentarios delatores)
  if (!isFullScan) {
    try {
      const diffOutput = execSync("git diff --cached -U0", { encoding: "utf8" });
      const addedLines = diffOutput
        .split(/\r?\n/)
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1));

      for (const line of addedLines) {
        if (line.includes(".env.example") || line.includes("[PROJECT-REF]")) continue;

        for (const secret of SECRET_PATTERNS) {
          if (secret.regex.test(line)) {
            violations.push(`[Secreto Detectado] ${secret.name} en el código agregado.`);
          }
        }

        for (const marker of AI_MARKER_PATTERNS) {
          if (marker.regex.test(line)) {
            violations.push(`[Texto Delator de AI] "${line.trim()}" en el código.`);
          }
        }
      }
    } catch (err) {
      console.error("[Security Shield] Error inspeccionando diff:", err.message);
      process.exit(1);
    }
  }

  if (violations.length > 0) {
    console.error("\n🚨 [Security Shield] BLOQUEO DE SEGURIDAD PREVENTIVO:");
    for (const v of violations) {
      console.error(`   ❌ ${v}`);
    }
    console.error("\n💡 Por favor corrige los puntos anteriores antes de commitear hacia el repositorio público.\n");
    process.exit(1);
  }

  console.log("🛡️ [Security Shield] Verificación de archivos y secretos superada con éxito.");
  process.exit(0);
}

checkFiles();
