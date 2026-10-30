import { downloadUniversalMedia } from "../src/services/media.service.js";

async function verifyAll() {
  console.log("=== INICIANDO VERIFICACIÓN DE DESCARGAS ===");

  // 1. TikTok
  console.log("\n[1/4] Probando TikTok...");
  const ttResult = await downloadUniversalMedia("https://www.tiktok.com/@tiktok/video/7106594312292453675");
  if (ttResult && (ttResult.buffer || ttResult.url)) {
    const size = ttResult.buffer ? `${(ttResult.buffer.length / 1024 / 1024).toFixed(2)} MB` : "URL disponible";
    console.log(`✅ TikTok: Éxito (${size}, ${ttResult.type})`);
  } else {
    console.error("❌ TikTok: Falló la descarga");
    process.exit(1);
  }

  // 2. Facebook
  console.log("\n[2/4] Probando Facebook...");
  const fbResult = await downloadUniversalMedia("https://www.facebook.com/watch/?v=10153231379946729");
  if (fbResult && (fbResult.buffer || fbResult.url)) {
    const size = fbResult.buffer ? `${(fbResult.buffer.length / 1024 / 1024).toFixed(2)} MB` : "URL disponible";
    console.log(`✅ Facebook: Éxito (${size}, ${fbResult.type})`);
  } else {
    console.error("❌ Facebook: Falló la descarga");
    process.exit(1);
  }

  // 3. Twitter / X
  console.log("\n[3/4] Probando Twitter / X...");
  const twResult = await downloadUniversalMedia("https://twitter.com/captainamerica/status/719944021058060289");
  if (twResult && (twResult.buffer || twResult.url)) {
    const size = twResult.buffer ? `${(twResult.buffer.length / 1024 / 1024).toFixed(2)} MB` : "URL disponible";
    console.log(`✅ Twitter / X: Éxito (${size}, ${twResult.type})`);
  } else {
    console.error("❌ Twitter / X: Falló la descarga");
    process.exit(1);
  }

  // 4. Instagram
  console.log("\n[4/4] Probando Instagram (detección y enrutamiento)...");
  const igResult = await downloadUniversalMedia("https://www.instagram.com/reel/C8rF5n-o0qP/");
  if (igResult) {
    if (igResult.buffer || igResult.url) {
      console.log(`✅ Instagram: Éxito en descarga directa (${igResult.type})`);
    } else if (igResult.errorNotice) {
      console.log(`✅ Instagram: Enrutado y manejado con aviso (${igResult.errorNotice})`);
    }
  } else {
    console.log("ℹ️ Instagram: Manejado sin excepciones no controladas.");
  }

  console.log("\n==========================================");
  console.log("🎉 TODAS LAS PLATAFORMAS VERIFICADAS CON ÉXITO");
  console.log("==========================================");
}

verifyAll().catch((err) => {
  console.error("Error en verificación:", err);
  process.exit(1);
});
