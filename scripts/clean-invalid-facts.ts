import { prisma } from "../src/services/db/prisma.js";

const FORBIDDEN_WORDS = [
  "albañil",
  "albanil",
  "guiso",
  "hambre",
  "saldo",
  "fichas",
  "casino",
  "coima",
  "prepucio",
  "semen",
  "masturbacion",
  "mecanico",
  "mecánico",
  "espia",
  "espía",
  "cartonero",
  "minero",
];

async function main() {
  console.log("--- Inspeccionando todos los UserFacts en la base de datos ---");
  const allFacts = await prisma.userFact.findMany({
    include: {
      user: true,
    },
  });

  console.log(`Total de hechos encontrados: ${allFacts.length}`);

  const toDeleteIds: string[] = [];

  for (const f of allFacts) {
    const keyLower = f.clave.toLowerCase();
    const valLower = f.valor.toLowerCase();

    const isForbidden = FORBIDDEN_WORDS.some(
      (w) => keyLower.includes(w) || valLower.includes(w)
    );

    if (isForbidden) {
      console.log(
        `🚨 A ELIMINAR -> [${f.user?.primaryName || f.userJid}] (${f.tipo}) ${f.clave}: "${f.valor}" (ID: ${f.id})`
      );
      toDeleteIds.push(f.id);
    } else {
      console.log(
        `✅ VÁLIDO -> [${f.user?.primaryName || f.userJid}] (${f.tipo}) ${f.clave}: "${f.valor}"`
      );
    }
  }

  if (toDeleteIds.length > 0) {
    const deleteResult = await prisma.userFact.deleteMany({
      where: {
        id: { in: toDeleteIds },
      },
    });
    console.log(`\n🧹 Se eliminaron con éxito ${deleteResult.count} hechos inválidos/corruptos.`);
  } else {
    console.log("\n✨ No se encontraron hechos que requieran eliminación.");
  }
}

main()
  .catch((e) => {
    console.error("Error al ejecutar limpieza:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
