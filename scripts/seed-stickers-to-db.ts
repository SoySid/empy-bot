import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { prisma } from "../src/services/db/prisma.js";
import { VALID_CATEGORIES, initStickersTable } from "../src/services/sticker.service.js";

async function isAnimatedWebp(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return Boolean(metadata.pages && metadata.pages > 1);
  } catch {
    return false;
  }
}

async function main() {
  console.log("🚀 Sincronizando stickers locales hacia la base de datos Neon PostgreSQL...");

  await initStickersTable();

  const stickersRoot = path.resolve(process.cwd(), "stickers");
  if (!fs.existsSync(stickersRoot)) {
    console.error("❌ No existe la carpeta stickers en la raíz.");
    process.exit(1);
  }

  let totalUploaded = 0;

  for (const cat of VALID_CATEGORIES) {
    const catDir = path.join(stickersRoot, cat);
    if (!fs.existsSync(catDir)) continue;

    const files = await fs.promises.readdir(catDir);
    for (const file of files) {
      if (!/\.(webp|png|jpg|jpeg)$/i.test(file)) continue;

      const filePath = path.join(catDir, file);
      const buffer = await fs.promises.readFile(filePath);
      const isAnimated = await isAnimatedWebp(buffer);
      const base64Data = buffer.toString("base64");
      const id = crypto.randomUUID();

      await prisma.customSticker.upsert({
        where: { filename: file },
        create: {
          id,
          category: cat,
          filename: file,
          data: base64Data,
          isAnimated,
          addedBy: "seed",
        },
        update: {
          category: cat,
          data: base64Data,
          isAnimated,
        },
      });

      console.log(`  ✓ [${cat}] ${file} (${buffer.length} bytes, animado: ${isAnimated})`);
      totalUploaded++;
    }
  }

  const ownerPhone = (process.env.BOT_OWNER_PHONE || "").replace(/\D/g, "");
  if (ownerPhone) {
    const ownerUpdate = await prisma.userProfile.updateMany({
      where: {
        OR: [
          { phone: ownerPhone },
          { jid: `${ownerPhone}@s.whatsapp.net` },
        ],
      },
      data: { role: "owner" },
    });
    console.log(`👑 Rol de owner actualizado: ${ownerUpdate.count} registro(s)`);
  }

  console.log(`\n🎉 Sincronización completada: ${totalUploaded} stickers cargados en CustomSticker en Neon.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error en seed de stickers:", err);
  process.exit(1);
});
