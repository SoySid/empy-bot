import "dotenv/config";
import { prisma } from "../src/services/db/prisma.js";
import {
  backupSeasonS1,
  migrateToSeasonS2,
  restoreSeasonS1,
  verifySeasonDatabaseState,
} from "../src/services/season.service.js";

type CliMode = "backup-only" | "migrate-s2" | "restore-s1";

function parseArgs(argv: string[]): { mode: CliMode; force: boolean } {
  const args = new Set(argv.slice(2));
  const modes: CliMode[] = [];

  if (args.has("--backup-only")) modes.push("backup-only");
  if (args.has("--migrate-s2")) modes.push("migrate-s2");
  if (args.has("--restore-s1")) modes.push("restore-s1");

  if (modes.length !== 1) {
    throw new Error(
      "Uso: npx tsx scripts/season-s2-migration.ts <--backup-only | --migrate-s2 | --restore-s1> [--force]"
    );
  }

  return {
    mode: modes[0],
    force: args.has("--force"),
  };
}

function printVerificationReport(report: Awaited<ReturnType<typeof verifySeasonDatabaseState>>): void {
  console.log("\n=== VERIFICACIÓN DE BASE DE DATOS ===");
  console.log(JSON.stringify(report, null, 2));
}

async function main(): Promise<void> {
  const { mode, force } = parseArgs(process.argv);

  if (mode === "backup-only") {
    const result = await backupSeasonS1(force);
    console.log("=== BACKUP TEMPORADA S1 ===");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (mode === "migrate-s2") {
    const preAudit = await verifySeasonDatabaseState();
    console.log("=== ESTADO PREVIO A MIGRACIÓN ===");
    console.log(JSON.stringify(preAudit, null, 2));

    const result = await migrateToSeasonS2();
    console.log("\n=== RESULTADO MIGRACIÓN S1 -> S2 ===");
    console.log(JSON.stringify(result, null, 2));

    const postAudit = await verifySeasonDatabaseState();
    printVerificationReport(postAudit);
    return;
  }

  if (mode === "restore-s1") {
    const result = await restoreSeasonS1();
    console.log("=== RESTAURACIÓN TEMPORADA S1 ===");
    console.log(JSON.stringify(result, null, 2));

    const postAudit = await verifySeasonDatabaseState();
    printVerificationReport(postAudit);
  }
}

main()
  .catch((err) => {
    console.error("[Season Migration Error]:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
