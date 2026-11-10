import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

interface SyncIssue {
  category: string;
  item: string;
  missingIn: string;
  details: string;
}

function verifySync(): void {
  const issues: SyncIssue[] = [];

  // 1. Verificar Juegos en src/commands/games/juegos.ts
  const gamesIndexPath = path.join(rootDir, "src", "commands", "games", "index.ts");
  const juegosCmdPath = path.join(rootDir, "src", "commands", "games", "juegos.ts");
  const readmePath = path.join(rootDir, "README.md");

  if (!fs.existsSync(gamesIndexPath) || !fs.existsSync(juegosCmdPath)) {
    console.error("❌ No se encontraron los archivos de juegos en src/commands/games/");
    process.exit(1);
  }

  const gamesIndexContent = fs.readFileSync(gamesIndexPath, "utf-8");
  const juegosCmdContent = fs.readFileSync(juegosCmdPath, "utf-8");
  const readmeContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf-8") : "";

  // Mapeo esperado de comandos principales de juegos y su token identificador en !juegos
  const expectedGames: Record<string, { triggers: string[]; label: string }> = {
    pokemon: { triggers: ["!pokemon", "!poke"], label: "Pokémon" },
    bandera: { triggers: ["!bandera", "!pais"], label: "Banderas" },
    pesca: { triggers: ["!pescar", "!pesca"], label: "Pesca" },
    boss: { triggers: ["!boss", "!atacar"], label: "Raid / Boss" },
    wordle: { triggers: ["!wordle"], label: "Wordle" },
    ahorcado: { triggers: ["!ahorcado"], label: "Ahorcado" },
    superhero: { triggers: ["!superheroe", "!comic"], label: "Superhéroes" },
    mlbb: { triggers: ["!mlbb", "!heroe"], label: "Mobile Legends (MLBB)" },
    ruletarusa: { triggers: ["!ruletarusa"], label: "Ruleta Rusa" },
    campominado: { triggers: ["!campominado", "!campo", "!minas"], label: "Campo Minado" },
    tuttifrutti: { triggers: ["!tuttifrutti", "!basta"], label: "Tutti Frutti" },
    ciego: { triggers: ["!ciego", "!elnumero"], label: "El Número Ciego" },
  };

  for (const [key, meta] of Object.entries(expectedGames)) {
    // Si el archivo del juego está exportado en index.ts
    const isExported = gamesIndexContent.includes(key);
    if (!isExported) continue;

    // Verificar si figura en juegos.ts
    const inJuegos = meta.triggers.some((t) => juegosCmdContent.toLowerCase().includes(t.toLowerCase()));
    if (!inJuegos) {
      issues.push({
        category: "Minijuegos",
        item: meta.label,
        missingIn: "src/commands/games/juegos.ts",
        details: `El juego está activo pero ninguno de sus disparadores (${meta.triggers.join(", ")}) figura en la cartelera !juegos.`,
      });
    }

    // Verificar si figura en README.md
    const inReadme = meta.triggers.some((t) => readmeContent.toLowerCase().includes(t.toLowerCase())) ||
      readmeContent.toLowerCase().includes(meta.label.toLowerCase());
    if (!inReadme) {
      issues.push({
        category: "Documentación GitHub",
        item: meta.label,
        missingIn: "README.md",
        details: `El juego ${meta.label} (${meta.triggers[0]}) no está documentado en el README.`,
      });
    }
  }

  // 2. Reporte de resultados
  console.log("🔍 Verificando sincronización de comandos, menús y documentación...\n");

  if (issues.length > 0) {
    console.warn(`⚠️ Se detectaron ${issues.length} desincronizaciones:\n`);
    for (const issue of issues) {
      console.warn(`  • [${issue.category}] ${issue.item}`);
      console.warn(`    Falta en: ${issue.missingIn}`);
      console.warn(`    Detalle:  ${issue.details}\n`);
    }
    console.warn("💡 Ejecutá a Mati para corregir quirúrgicamente estos faltantes.");
    process.exit(1);
  } else {
    console.log("✅ Todo sincronizado: Los menús del bot y README.md están perfectamente alineados.");
    process.exit(0);
  }
}

verifySync();
