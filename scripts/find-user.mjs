import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function findUsers() {
  const users = await prisma.userProfile.findMany({
    include: { aliases: true, facts: true },
  });

  console.log(`Total users in DB: ${users.length}`);
  for (const u of users) {
    console.log(`- ${u.primaryName} (realName: ${u.realName}, pushName: ${u.pushName}, jid: ${u.jid})`);
    if (u.aliases.length > 0) {
      console.log(`  Aliases: ${u.aliases.map(a => a.alias).join(", ")}`);
    }
    if (u.facts.length > 0) {
      console.log(`  Facts: ${u.facts.map(f => f.clave + '=' + f.valor).join(", ")}`);
    }
  }
}

findUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
