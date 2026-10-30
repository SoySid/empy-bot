import { prisma } from "../src/services/db/prisma.js";

import { getUserProfessionBuffs } from "../src/services/economy.service.js";

import { getOrInitGlobalState } from "../src/services/economy.service.js";

async function main() {
  const lessons = await prisma.botLesson.findMany();
  console.log(`\nBot Lessons (${lessons.length}):`);
  for (const l of lessons) {
    console.log(`- ${l.lesson}`);
  }
}

main().finally(() => prisma.$disconnect());
