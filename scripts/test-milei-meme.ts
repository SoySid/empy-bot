import fs from "fs";
import path from "path";
import os from "os";
import { generateMileiMierdaMeme, formatMileiMierdaPhrase } from "../src/services/meme.service.js";

async function main() {
  const subject = process.argv[2] || "Corrientes";
  const phrase = formatMileiMierdaPhrase(subject);
  console.log(`Frase generada para "${subject}":`, phrase);

  const buffer = await generateMileiMierdaMeme(subject);

  // Guardar en el Escritorio del usuario
  const desktopPath = path.join(os.homedir(), "Desktop", "corrientes-es-una-mierda.jpg");
  fs.writeFileSync(desktopPath, buffer);

  console.log(`✅ Meme guardado con éxito en el escritorio: ${desktopPath} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error("Error al generar meme:", err);
  process.exit(1);
});
