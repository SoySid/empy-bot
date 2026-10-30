import "dotenv/config";
import { clearAuthFromDb } from "../src/services/db/auth-sync.service.js";
import { prisma } from "../src/services/db/prisma.js";

async function main() {
  console.log("=================================================");
  console.log("🗑️ PURGANDO SESIÓN DE WHATSAPP EN POSTGRESQL (RENDER)");
  console.log("=================================================\n");

  try {
    console.log("Eliminando bundle de sesión en tabla BaileysSession...");
    await clearAuthFromDb();
    console.log("✅ ¡Sesión eliminada de PostgreSQL!");
    console.log("Al arrancar en Render, el bot solicitará un nuevo código QR limpio.\n");
  } catch (err: any) {
    console.error("❌ Error eliminando sesión:", err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
