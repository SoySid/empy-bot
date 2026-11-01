import fs from "node:fs";
import path from "node:path";

const hooksDir = path.resolve(process.cwd(), ".git", "hooks");

if (!fs.existsSync(hooksDir)) {
  console.log("[Hooks Setup] Directorio .git/hooks no encontrado (¿no es raíz de git?). Omitiendo.");
  process.exit(0);
}

const preCommitScript = `#!/bin/sh
# 1. Escudo de seguridad (archivos prohibidos, secretos y comentarios delatores)
node scripts/security-check.mjs || exit 1

# 2. Sincronizacion automatica de Graphify en commits con cambios en src/
if git diff --cached --name-only | grep -E '^src/.*\\.(ts|js|json)$' > /dev/null 2>&1; then
    echo "[graphify] Sincronizando grafo de dependencias de codigo..."
    if command -v graphify > /dev/null 2>&1; then
        graphify . --code-only
    elif command -v graphify.exe > /dev/null 2>&1; then
        graphify.exe . --code-only
    fi
fi
exit 0
`;

const commitMsgScript = `#!/bin/sh
# Validacion anti-delacion de mensajes de commit (estándar humano técnico)
node scripts/validate-commit-msg.mjs "$1" || exit 1
exit 0
`;

try {
  const preCommitPath = path.join(hooksDir, "pre-commit");
  fs.writeFileSync(preCommitPath, preCommitScript, { encoding: "utf8", mode: 0o755 });

  const commitMsgPath = path.join(hooksDir, "commit-msg");
  fs.writeFileSync(commitMsgPath, commitMsgScript, { encoding: "utf8", mode: 0o755 });

  console.log("🛡️ [Hooks Setup] Git hooks pre-commit y commit-msg instalados y protegidos con éxito.");
} catch (err) {
  console.warn("[Hooks Setup] Advertencia configurando hooks:", err.message);
}
