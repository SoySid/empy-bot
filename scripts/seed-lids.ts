import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mappings = [
    { lid: "00000000000001@lid", phoneJid: "5491100000001@s.whatsapp.net", phone: "5491100000001", name: "User1" },
    { lid: "00000000000002@lid", phoneJid: "5491100000002@s.whatsapp.net", phone: "5491100000002", name: "User2" },
    { lid: "00000000000003@lid", phoneJid: "5491100000003@s.whatsapp.net", phone: "5491100000003", name: "User3" },
    { lid: "00000000000004@lid", phoneJid: "5491100000004@s.whatsapp.net", phone: "5491100000004", name: "User4" },
    { lid: "00000000000005@lid", phoneJid: "5491100000005@s.whatsapp.net", phone: "5491100000005", name: "empy-bot" },
  ];

  for (const m of mappings) {
    await prisma.lidMapping.upsert({
      where: { lid: m.lid },
      update: { phoneJid: m.phoneJid, phoneNumber: m.phone },
      create: { lid: m.lid, phoneJid: m.phoneJid, phoneNumber: m.phone },
    });

    const lidUser = await prisma.userProfile.findFirst({ where: { jid: m.lid } });
    const phoneUser = await prisma.userProfile.findFirst({ where: { jid: m.phoneJid } });

    if (lidUser && phoneUser && lidUser.id !== phoneUser.id) {
      const maxBal = Math.max(lidUser.balance, phoneUser.balance);
      await prisma.userFact.deleteMany({ where: { userJid: lidUser.jid } });
      await prisma.userAlias.deleteMany({ where: { userJid: lidUser.jid } });
      await prisma.userProfile.delete({ where: { id: lidUser.id } });

      await prisma.userProfile.update({
        where: { id: phoneUser.id },
        data: { lid: m.lid, balance: maxBal },
      });
      console.log(`Unificado perfil de ${m.name}`);
    } else if (phoneUser) {
      await prisma.userProfile.update({
        where: { id: phoneUser.id },
        data: { lid: m.lid },
      });
    }
  }

  console.log("LID mappings seeded successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
