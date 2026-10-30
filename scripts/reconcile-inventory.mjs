import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import fs from "fs";

const prisma = new PrismaClient();

async function main() {
  console.log("=== INICIANDO CONCILIACIÓN DE INVENTARIOS ===");

  // 1. Revisar ítems en SQLite legacy (prisma/dev.db)
  if (fs.existsSync("prisma/dev.db")) {
    console.log("Examinando prisma/dev.db...");
    const db = new DatabaseSync("prisma/dev.db", { readOnly: true });
    const sqliteItems = db.prepare("SELECT userJid, itemId, quantity FROM UserInventoryItem").all();
    console.log(`Encontrados ${sqliteItems.length} ítems en SQLite.`);

    let restoredCount = 0;
    for (const sq of sqliteItems) {
      const existing = await prisma.userInventoryItem.findUnique({
        where: {
          userJid_itemId: {
            userJid: sq.userJid,
            itemId: sq.itemId,
          },
        },
      });

      if (!existing) {
        await prisma.userInventoryItem.create({
          data: {
            userJid: sq.userJid,
            itemId: sq.itemId,
            quantity: sq.quantity,
          },
        });
        console.log(`✅ Restaurado ítem [${sq.itemId} x${sq.quantity}] para ${sq.userJid} desde SQLite.`);
        restoredCount++;
      }
    }
    console.log(`Total ítems restaurados desde SQLite: ${restoredCount}`);
    db.close();
  }

  // 2. Revisar si hay ítems bajo LID que deban migrarse al JID canónico
  const allProfiles = await prisma.userProfile.findMany();
  for (const prof of allProfiles) {
    if (prof.lid && prof.lid !== prof.jid) {
      const lidItems = await prisma.userInventoryItem.findMany({
        where: { userJid: prof.lid },
      });

      if (lidItems.length > 0) {
        console.log(`Encontrados ${lidItems.length} ítems bajo LID ${prof.lid} para migrar a ${prof.jid}...`);
        for (const it of lidItems) {
          const canonicalItem = await prisma.userInventoryItem.findUnique({
            where: { userJid_itemId: { userJid: prof.jid, itemId: it.itemId } },
          });
          if (canonicalItem) {
            await prisma.userInventoryItem.update({
              where: { id: canonicalItem.id },
              data: { quantity: { increment: it.quantity } },
            });
            await prisma.userInventoryItem.delete({ where: { id: it.id } });
          } else {
            await prisma.userInventoryItem.update({
              where: { id: it.id },
              data: { userJid: prof.jid },
            });
          }
          console.log(`🔄 Migrado ítem [${it.itemId}] de LID -> Canónico para ${prof.primaryName}`);
        }
      }
    }
  }

  // 3. Auditoría final de usuarios e inventarios
  console.log("\n=== ESTADO ACTUAL DE INTEGRANTES Y SUS INVENTARIOS ===");
  const users = await prisma.userProfile.findMany({
    orderBy: { primaryName: "asc" },
  });

  const allItems = await prisma.userInventoryItem.findMany();

  for (const u of users) {
    const userItems = allItems.filter((i) => i.userJid === u.jid || (u.lid && i.userJid === u.lid));
    const itemsSummary = userItems.length > 0
      ? userItems.map((i) => `${i.itemId} x${i.quantity}`).join(", ")
      : "NINGUNO";

    console.log(`👤 ${u.primaryName} (${u.phone}) | Rubro: [${u.profession || "SIN OFICIO"}] | Saldo: $${u.balance.toLocaleString("es-AR")}`);
    console.log(`   📦 Inventario (${userItems.length} tipos): ${itemsSummary}\n`);
  }

  console.log("=== CONCILIACIÓN COMPLETADA CON ÉXITO ===");
}

main()
  .catch((err) => {
    console.error("Error en reconciliación:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
