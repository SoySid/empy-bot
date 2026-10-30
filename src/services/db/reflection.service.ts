import { prisma } from "./prisma.js";

let cachedLessons: string[] = [];
let cachedBurnedTopics: string[] = [];
let cachedGroupLexicon: { term: string; category: string; frequency: number }[] = [];
let cachedRecentTone: { avgTone: string; textRatio: number } | null = null;

// Buffer de chistes usados en la sesión actual (RAM)
const sessionBurnedTopics = new Set<string>();

export async function refreshGroupLexiconCache(): Promise<void> {
  try {
    const topTerms = await prisma.groupLexicon.findMany({
      orderBy: { frequency: "desc" },
      take: 12,
    });
    cachedGroupLexicon = topTerms.map((t) => ({
      term: t.term,
      category: t.category,
      frequency: t.frequency,
    }));

    const latestTone = await prisma.toneSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (latestTone) {
      cachedRecentTone = {
        avgTone: latestTone.avgTone,
        textRatio: latestTone.textRatio,
      };
    }
  } catch (error) {
    console.error("[Reflection DB] Error actualizando caché de léxico y tono:", error);
  }
}

export function getCachedGroupLexicon(): { term: string; category: string; frequency: number }[] {
  return cachedGroupLexicon;
}

export function getGroupLexiconContext(): string {
  if (cachedGroupLexicon.length === 0) return "";
  const termsList = cachedGroupLexicon.slice(0, 5).map((t) => t.term).join(", ");
  return `Jerga conocida: ${termsList}`;
}

export function getRecentToneContext(): string {
  if (!cachedRecentTone) return "";
  return cachedRecentTone.avgTone;
}

export async function refreshReflectionCache(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.burnedJoke.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const burned = await prisma.burnedJoke.findMany({
      where: { createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    cachedBurnedTopics = Array.from(new Set(burned.map((b) => b.topic)));

    const lessons = await prisma.botLesson.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    cachedLessons = lessons.map((l) => l.lesson);

    await refreshGroupLexiconCache();
  } catch (error) {
    console.error("[Reflection DB] Error actualizando caché de lecciones:", error);
  }
}

export function getActiveLessonsContext(): string {
  if (cachedLessons.length === 0) return "";
  return cachedLessons.slice(0, 3).map((l) => `• ${l}`).join("\n");
}

export function getBurnedJokesContext(): string {
  const allBurned = Array.from(new Set([...cachedBurnedTopics, ...sessionBurnedTopics]));
  if (allBurned.length === 0) return "";
  return `Temas quemados a no repetir: ${allBurned.slice(0, 4).join(", ")}`;
}

/**
 * Registra un tema o remate en caliente para no repetirlo en el siguiente mensaje
 */
export function recordSessionBurnedJoke(topic: string): void {
  const clean = topic.trim().toLowerCase();
  if (!clean || clean.length < 3) return;

  sessionBurnedTopics.add(clean);

  if (sessionBurnedTopics.size > 15) {
    const firstItem = sessionBurnedTopics.values().next().value;
    if (firstItem) sessionBurnedTopics.delete(firstItem);
  }
}

const TOXIC_LESSON_REGEX =
  /\b(maten|apaga|apágalo|apagalo|desactiva|elimina|silencia|silenciar|reinicia|basta|mierda|mrda|bugeo|bugeó|mutea|mutear|callate|cállate|rompas|hdp|pelotudo|inutil|inútil|cansado)\b/i;

export async function addMasterLesson(lesson: string, context = "Corrección en vivo"): Promise<void> {
  const cleanLesson = lesson.trim();
  if (cleanLesson.length < 6 || TOXIC_LESSON_REGEX.test(cleanLesson)) return;

  try {
    const exists = await prisma.botLesson.findFirst({
      where: { lesson: cleanLesson },
    });

    if (!exists) {
      await prisma.botLesson.create({
        data: {
          lesson: cleanLesson,
          context,
        },
      });
    }

    const allLessons = await prisma.botLesson.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (allLessons.length > 8) {
      const toDelete = allLessons.slice(8).map((l) => l.id);
      await prisma.botLesson.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    await refreshReflectionCache();
  } catch (error) {
    console.error("[Reflection DB] Error agregando lección:", error);
  }
}

export async function replaceMasterLessons(newLessons: string[]): Promise<void> {
  try {
    const validLessons = newLessons
      .map((l) => l.trim())
      .filter((l) => l.length >= 6 && !l.toLowerCase().includes("ningun") && !TOXIC_LESSON_REGEX.test(l));

    if (validLessons.length === 0) return;

    for (const lesson of validLessons) {
      const exists = await prisma.botLesson.findFirst({
        where: { lesson },
      });

      if (!exists) {
        await prisma.botLesson.create({
          data: {
            lesson,
            context: "Corrección aprendida por chat",
          },
        });
      }
    }

    const allLessons = await prisma.botLesson.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (allLessons.length > 8) {
      const toDelete = allLessons.slice(8).map((l) => l.id);
      await prisma.botLesson.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    await refreshReflectionCache();
    console.log(`[Reflection DB] 📌 Lecciones actualizadas (${validLessons.length} procesadas).`);
  } catch (error) {
    console.error("[Reflection DB] Error guardando lecciones:", error);
  }
}

export async function recordBurnedJoke(topic: string): Promise<void> {
  try {
    const cleanTopic = topic.trim().toLowerCase();
    if (!cleanTopic || cleanTopic.length < 3) return;

    recordSessionBurnedJoke(cleanTopic);

    await prisma.burnedJoke.create({
      data: { topic: cleanTopic },
    });

    if (!cachedBurnedTopics.includes(cleanTopic)) {
      cachedBurnedTopics.push(cleanTopic);
      if (cachedBurnedTopics.length > 8) cachedBurnedTopics.shift();
    }
  } catch (error) {
    console.error("[Reflection DB] Error guardando tema quemado:", error);
  }
}

export async function upsertGroupTerm(
  term: string,
  category = "slang",
  example = ""
): Promise<void> {
  const clean = term.trim();
  if (clean.length < 2 || clean.length > 50) return;
  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  try {
    const existing = await prisma.groupLexicon.findFirst({
      where: { normalized },
    });

    if (existing) {
      let examplesArr: string[] = [];
      try {
        examplesArr = JSON.parse(existing.examples || "[]");
      } catch {}
      if (example && !examplesArr.includes(example)) {
        examplesArr.push(example);
        if (examplesArr.length > 3) examplesArr.shift();
      }

      await prisma.groupLexicon.update({
        where: { id: existing.id },
        data: {
          frequency: existing.frequency + 1,
          lastSeenAt: new Date(),
          examples: JSON.stringify(examplesArr),
          category: category || existing.category,
        },
      });
    } else {
      await prisma.groupLexicon.create({
        data: {
          term: clean,
          normalized,
          frequency: 1,
          category: category || "slang",
          examples: example ? JSON.stringify([example]) : "[]",
        },
      });
    }
  } catch (err) {
    console.error(`[Reflection DB] Error en upsertGroupTerm para '${clean}':`, err);
  }
}

export async function saveToneSnapshot(
  avgTone: string,
  textRatio: number,
  activeUsers: number,
  windowStart: Date,
  windowEnd: Date
): Promise<void> {
  try {
    await prisma.toneSnapshot.create({
      data: {
        windowStart,
        windowEnd,
        avgTone,
        textRatio,
        activeUsers,
      },
    });
    cachedRecentTone = { avgTone, textRatio };

    // Retención máxima de 30 snapshots para evitar acumulación innecesaria en Neon DB
    const totalCount = await prisma.toneSnapshot.count();
    if (totalCount > 30) {
      const oldSnapshots = await prisma.toneSnapshot.findMany({
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: totalCount - 30,
      });
      const idsToDelete = oldSnapshots.map((s) => s.id);
      await prisma.toneSnapshot.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  } catch (err) {
    console.error("[Reflection DB] Error guardando ToneSnapshot:", err);
  }
}