import { ensureYtDlpBinary } from "../src/services/media.service.js";

async function main() {
  console.log("[Build Script] Preparando binario yt-dlp...");
  try {
    const binPath = await ensureYtDlpBinary();
    console.log("[Build Script] Binario yt-dlp verificado exitosamente:", binPath);
    process.exit(0);
  } catch (error) {
    console.warn("[Build Script] Advertencia: No se pudo pre-descargar yt-dlp en build (se intentará en runtime):", error);
    // No fallar el build si GitHub tiene problema de red temporal, continuará a tsc
    process.exit(0);
  }
}

main();
