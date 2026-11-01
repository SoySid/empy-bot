import dotenv from "dotenv";
import { getUserProfession, executeJob } from "../src/services/economy.service.js";
import { prisma } from "../src/services/db/prisma.js";

dotenv.config();

async function testLaburar() {
  console.log("🧪 --- PROBANDO COMANDO LABURAR CON NEON POSTGRESQL --- 🧪\n");

  const testUser = await prisma.userProfile.findFirst({
    where: { role: "owner" },
  }) || await prisma.userProfile.findFirst();

  if (!testUser) {
    console.error("Ningún usuario encontrado en DB.");
    return;
  }

  console.log(`Usuario encontrado: ${testUser.primaryName} (ID: ${testUser.id}, JID: ${testUser.jid})`);

  // 1. Probar lectura de profesión
  console.log("1. Probando getUserProfession...");
  const prof = await getUserProfession(testUser.id);
  console.log("✅ Profesión obtenida sin errores:", prof);

  // 2. Probar ejecución de laburo
  console.log("\n2. Probando executeJob...");
  const workResult = await executeJob(testUser.jid);
  console.log("✅ Resultado de executeJob:", workResult.success ? `Éxito! Ganó $${workResult.earned}` : `Cooldown o fallo: ${workResult.error || workResult.message || 'ok'}`);
}

testLaburar()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
