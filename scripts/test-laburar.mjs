import dotenv from "dotenv";
import { getUserProfession, executeJob } from "../src/services/economy.service.js";
import { prisma } from "../src/services/db/prisma.js";

dotenv.config();

async function testLaburar() {
  console.log("🧪 --- PROBANDO COMANDO LABURAR CON NEON POSTGRESQL --- 🧪\n");

  const sid = await prisma.userProfile.findFirst({
    where: { primaryName: "Sid" },
  });

  if (!sid) {
    console.error("Usuario Sid no encontrado.");
    return;
  }

  console.log(`Usuario encontrado: ${sid.primaryName} (ID: ${sid.id}, JID: ${sid.jid})`);

  // 1. Probar lectura de profesión
  console.log("1. Probando getUserProfession...");
  const prof = await getUserProfession(sid.id);
  console.log("✅ Profesión obtenida sin errores:", prof);

  // 2. Probar ejecución de laburo
  console.log("\n2. Probando executeJob...");
  const workResult = await executeJob(sid.jid);
  console.log("✅ Resultado de executeJob:", workResult.success ? `Éxito! Ganó $${workResult.earned}` : `Cooldown o fallo: ${workResult.error || workResult.message || 'ok'}`);
}

testLaburar()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
