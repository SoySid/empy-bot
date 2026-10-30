import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

interface InitialFact {
  tipo: "PERMANENTE" | "TEMPORADA" | "EPISODICO";
  clave: string;
  valor: string;
}

interface InitialUser {
  phone: string;
  primaryName: string;
  aliases: string;
  role: "owner" | "admin" | "member";
  facts: InitialFact[];
}

const INITIAL_USERS: InitialUser[] = [
  {
    phone: process.env.BOT_OWNER_PHONE || process.env.OWNER_PHONE || "5491100000001",
    primaryName: process.env.BOT_OWNER_NAME || "Admin",
    aliases: "admin,creador",
    role: "owner",
    facts: [
      { tipo: "PERMANENTE", clave: "rol_grupo", valor: "Creador y Administrador" },
      { tipo: "PERMANENTE", clave: "gustos", valor: "Programar, música" },
      { tipo: "TEMPORADA", clave: "main_juego", valor: "Juegos online" },
    ],
  },
  {
    phone: process.env.SEED_USER_1_PHONE || "5491100000002",
    primaryName: "Usuario1",
    aliases: "user1,miembro1",
    role: "member",
    facts: [
      { tipo: "PERMANENTE", clave: "rol_grupo", valor: "Integrante del grupo" },
      { tipo: "PERMANENTE", clave: "ciudad", valor: "Buenos Aires" },
    ],
  },
  {
    phone: process.env.SEED_USER_2_PHONE || "5491100000003",
    primaryName: "Usuario2",
    aliases: "user2,miembro2",
    role: "member",
    facts: [
      { tipo: "PERMANENTE", clave: "rol_grupo", valor: "Integrante del grupo" },
      { tipo: "TEMPORADA", clave: "main_juego", valor: "Juegos de rol" },
    ],
  },
  {
    phone: process.env.SEED_USER_3_PHONE || "5491100000004",
    primaryName: "Usuario3",
    aliases: "user3,miembro3",
    role: "member",
    facts: [
      { tipo: "PERMANENTE", clave: "ciudad", valor: "Córdoba" },
      { tipo: "PERMANENTE", clave: "rol_grupo", valor: "Integrante del grupo" },
    ],
  },
];

async function main() {
  console.log("[Seed] 🚀 Iniciando seed de usuarios...");

  for (const user of INITIAL_USERS) {
    const cleanPhone = user.phone.replace(/\D/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const aliasList = user.aliases.split(",").map((a) => a.trim()).filter(Boolean);

    const profile = await prisma.userProfile.upsert({
      where: { jid },
      update: {
        primaryName: user.primaryName,
        phone: cleanPhone,
        role: user.role,
      },
      create: {
        jid,
        phone: cleanPhone,
        primaryName: user.primaryName,
        role: user.role,
      },
    });

    for (const rawAlias of aliasList) {
      const normalized = rawAlias
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (normalized) {
        await prisma.userAlias.upsert({
          where: {
            userJid_normalized: {
              userJid: profile.jid,
              normalized,
            },
          },
          update: { alias: rawAlias },
          create: {
            userJid: profile.jid,
            alias: rawAlias,
            normalized,
            isPrimary: rawAlias.toLowerCase() === user.primaryName.toLowerCase(),
          },
        });
      }
    }

    for (const fact of user.facts) {
      await prisma.userFact.upsert({
        where: {
          userJid_clave: {
            userJid: profile.jid,
            clave: fact.clave,
          },
        },
        update: {
          tipo: fact.tipo,
          valor: fact.valor,
          lastConfirmedAt: new Date(),
        },
        create: {
          userJid: profile.jid,
          tipo: fact.tipo,
          clave: fact.clave,
          valor: fact.valor,
        },
      });
    }

    console.log(`[Seed] ✅ Perfil listo: ${user.primaryName} (${cleanPhone}) con ${user.facts.length} hechos y ${aliasList.length} alias.`);
  }

  console.log("[Seed] 🎉 Seed completado con éxito.");
}

main()
  .catch((e) => {
    console.error("[Seed] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
