import "dotenv/config";
import { syncAuthToDb, restoreAuthFromDb } from "../src/services/db/auth-sync.service.js";
import { prisma } from "../src/services/db/prisma.js";

async function main() {
  console.log("=================================================");
  console.log("📤 SINCRONIZANDO SESIÓN LOCAL A POSTGRESQL (RENDER)");
  console.log("=================================================\n");

  try {
    console.log("Empaquetando auth_info/ local y subiendo a PostgreSQL...");
    await syncAuthToDb();
    console.log("✅ ¡Sesión subida exitosamente a PostgreSQL!");
    console.log("Render ahora podrá restaurar esta sesión automáticamente sin pedir código QR.\n");
  } catch (err: any) {
    console.error("❌ Error sincronizando sesión:", err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
