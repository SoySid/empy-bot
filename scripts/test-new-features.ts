import { prisma } from "../src/services/db/prisma.js";
import {
  setUserProfession,
  clearUserProfession,
  executeJob,
  executeRobbery
} from "../src/services/economy.service.js";
import {
  setRobShield,
  removeRobShield,
  setBuffTurns,
  clearBuffTurns
} from "../src/services/admin-economy.service.js";
import { formatNativeMention } from "../src/services/whatsapp-identity.js";
import { PROFESSIONS } from "../src/config/economy.config.js";
import { TOOL_JOBS_CONFIG } from "../src/config/tool-jobs.config.js";
import { JOB_EVENTS_CONFIG } from "../src/config/job-events.config.js";

async function main() {
  console.log("=== INICIANDO PRUEBAS DE NUEVAS FUNCIONALIDADES ===");

  // 1. Verificar registro de nuevos oficios
  console.log("1. Verificando configuración de nuevos oficios...");
  if (!PROFESSIONS.macumbero || !PROFESSIONS.profesora_especial) {
    throw new Error("Falta registrar macumbero o profesora_especial en PROFESSIONS");
  }
  if (!TOOL_JOBS_CONFIG.macumbero || !TOOL_JOBS_CONFIG.profesora_especial) {
    throw new Error("Falta registrar macumbero o profesora_especial en TOOL_JOBS_CONFIG");
  }
  if (!JOB_EVENTS_CONFIG.macumbero || !JOB_EVENTS_CONFIG.profesora_especial) {
    throw new Error("Falta registrar macumbero o profesora_especial en JOB_EVENTS_CONFIG");
  }
  console.log("✅ macumbero y profesora_especial registrados con éxito en todos los configs.");

  // 2. Probar formatNativeMention
  console.log("\n2. Probando formatNativeMention para Argentina...");
  const mention1 = formatNativeMention("5491100000001");
  console.log("Mention test 5491100000001:", mention1);
  if (!mention1.mentionJids.includes("5491100000001@s.whatsapp.net") || !mention1.mentionJids.includes("541100000001@s.whatsapp.net")) {
    throw new Error("formatNativeMention no generó las variantes 54 y 549");
  }
  console.log("✅ formatNativeMention genera correctamente variantes con y sin 9.");

  // Crear usuario de prueba
  const testJid = "5499999999999@s.whatsapp.net";
  const victimJid = "5498888888888@s.whatsapp.net";

  await prisma.userProfile.upsert({
    where: { jid: testJid },
    update: { balance: 10000, hunger: 100, profession: null, lastRobAttempt: null },
    create: { jid: testJid, phone: "5499999999999", primaryName: "Tester", balance: 10000, hunger: 100 },
  });

  await prisma.userProfile.upsert({
    where: { jid: victimJid },
    update: { balance: 10000, hunger: 100, profession: null, robShieldUntil: null },
    create: { jid: victimJid, phone: "5498888888888", primaryName: "Victima", balance: 10000, hunger: 100 },
  });

  // 3. Probar asignación y borrado de oficio (!borrartrabajo)
  console.log("\n3. Probando !borrartrabajo...");
  const setProf = await setUserProfession(testJid, "macumbero");
  if (!setProf.success || setProf.profession !== "macumbero") {
    throw new Error("No se pudo asignar oficio macumbero: " + setProf.error);
  }
  console.log("Asignado oficio macumbero correctamente.");

  const clearProf = await clearUserProfession(testJid);
  if (!clearProf.success) {
    throw new Error("Falló clearUserProfession: " + clearProf.error);
  }
  console.log("Oficio borrado correctamente. Oficio previo:", clearProf.previousProfession?.name);

  const testUser = await prisma.userProfile.findUnique({ where: { jid: testJid } });
  if (testUser?.profession !== null) {
    throw new Error("El campo profession no quedó en null en la BD");
  }
  console.log("✅ !borrartrabajo verificado: el usuario quedó desempleado en BD.");

  // 4. Probar protección de escudo en robos
  console.log("\n4. Probando protección de escudo en executeRobbery...");
  await setRobShield(victimJid, 6);
  const robBlocked = await executeRobbery(testJid, victimJid);
  console.log("Resultado de robo contra víctima con escudo:", robBlocked);
  if (robBlocked.success || !robBlocked.error?.includes("escudo")) {
    throw new Error("El escudo no bloqueó el robo");
  }
  console.log("✅ Escudo bloqueó el robo exitosamente.");

  await removeRobShield(victimJid);
  const victimAfter = await prisma.userProfile.findUnique({ where: { jid: victimJid } });
  if (victimAfter?.robShieldUntil !== null) {
    throw new Error("removeRobShield no limpió robShieldUntil");
  }
  console.log("✅ removeRobShield desactivó el escudo correctamente.");

  // 5. Probar buff (+30%) y nerf (-30%)
  console.log("\n5. Probando !buff y !nerf...");
  await setUserProfession(testJid, "profesora_especial");

  await setBuffTurns(testJid, 2);
  const jobWithBuff = await executeJob(testJid);
  console.log("Job con buff (+30%):", {
    hadFoodBuff: jobWithBuff.hadFoodBuff,
    multiplier: jobWithBuff.multiplier,
    earnings: jobWithBuff.earnings
  });
  if (!jobWithBuff.hadFoodBuff) {
    throw new Error("executeJob no detectó buff");
  }

  await prisma.userProfile.update({
    where: { jid: testJid },
    data: { lastJob: null, hunger: 100 },
  });
  await setBuffTurns(testJid, -2);
  const jobWithNerf = await executeJob(testJid);
  console.log("Job con nerf (-30%):", {
    hasJobNerf: (jobWithNerf as any).hasJobNerf,
    multiplier: jobWithNerf.multiplier,
    earnings: jobWithNerf.earnings
  });
  if (!(jobWithNerf as any).hasJobNerf) {
    throw new Error("executeJob no detectó nerf");
  }
  console.log("✅ !buff y !nerf verificados correctamente.");

  // Limpiar usuarios de prueba
  await prisma.userProfile.deleteMany({ where: { jid: { in: [testJid, victimJid] } } });

  console.log("\n🎉 TODAS LAS PRUEBAS PASARON SATISFACTORIAMENTE!");
}

main()
  .catch((err) => {
    console.error("❌ ERROR EN TEST:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
