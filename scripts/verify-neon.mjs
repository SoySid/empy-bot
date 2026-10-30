import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function verify() {
  console.log("🔍 Verifying Neon PostgreSQL connection and data...");
  const usersCount = await prisma.userProfile.count();
  const factsCount = await prisma.userFact.count();
  const lexiconCount = await prisma.groupLexicon.count();
  const rawMsgsCount = await prisma.rawMessage.count();
  const topUsers = await prisma.userProfile.findMany({
    select: { primaryName: true, balance: true, hunger: true, profession: true },
    orderBy: { balance: "desc" },
    take: 3,
  });

  console.log(`✅ UserProfile: ${usersCount} users`);
  console.log(`✅ UserFact: ${factsCount} facts`);
  console.log(`✅ GroupLexicon: ${lexiconCount} terms`);
  console.log(`✅ RawMessage: ${rawMsgsCount} messages`);
  console.log("🏆 Top 3 Users by Balance in Neon:", topUsers);
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
