import { prisma } from "../db/prisma.js";
import { getAllCachedProfiles, getCachedUserProfile } from "../db/user.service.js";
import { getRecentToneContext, getBurnedJokesContext, getActiveLessonsContext, getCachedGroupLexicon } from "../db/reflection.service.js";
import { searchRelevantPastMessages } from "../db/embedding.service.js";
import { REALTIME_SEARCH_REGEX, fetchLiveSearchData } from "../ai.service.js";

export interface HydratedContext {
  activeUsersContext: string;
  lexiconContext: string;
  toneContext: string;
  burnedJokesContext: string;
  lessonsContext: string;
  historicalMemoriesContext?: string;
  liveSearchContext?: string;
  activeParticipants: string[];
}

const MEMORY_RECALL_REGEX = /\b(quien es|qui[eé]n es|quien era|qui[eé]n era|te acordas|te acordás|paso antes|pasó antes|que paso|qu[eé] pasó|hace tiempo|en el pasado|la otra vez|te acordas de|se acuerdan|qu[eé] sab[eé]s? (de|sobre|del))\b/i;

const STOP_WORDS = new Set(["de", "en", "el", "la", "un", "si", "no", "al", "yo", "te", "me", "se", "mi", "tu", "que", "qué"]);

/**
 * Capa 3: Hidratación RAG Quirúrgica
 * Consulta en Neon DB los hechos (UserFact) de los usuarios activos Y de cualquier
 * integrante mencionado en el debate/consulta, términos relevantes de GroupLexicon,
 * tono actual y recuerdos históricos vectoriales si se pregunta sobre personas o el pasado.
 */
export async function hydrateContextForActiveUsers(
  activeUserJids: string[],
  recentText: string,
  intent?: string,
  targetUsers: string[] = []
): Promise<HydratedContext> {
  const activeJidSet = new Set(activeUserJids.filter(Boolean));
  const finalJidSet = new Set(activeJidSet);

  // 1. Resolver integrantes mencionados en el texto reciente o en target_users de Triage desde RAM (0ms latency)
  try {
    const candidateProfiles = getAllCachedProfiles();

    const normalizedText = recentText.toLowerCase();
    const normalizedTargets = (targetUsers || []).map((t) => t.replace(/^@/, "").trim().toLowerCase());

    for (const user of candidateProfiles) {
      if (finalJidSet.has(user.jid)) continue;

      const namesToCheck: string[] = [
        user.primaryName,
        ...(user.realName ? [user.realName] : []),
        ...(user.aliases ? user.aliases.map((a) => a.alias) : []),
        ...(user.facts ? user.facts.filter((f) => ["apodo", "nombre", "alias"].includes(f.clave)).map((f) => f.valor) : []),
      ].filter(Boolean);

      for (const name of namesToCheck) {
        const normName = name.trim().toLowerCase();
        if (!normName || normName.length < 2) continue;
        if (normName.length === 2 && STOP_WORDS.has(normName)) continue;

        const inTargets = normalizedTargets.some((t) => t.includes(normName) || normName.includes(t));
        const wordRegex = new RegExp(`\\b${normName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        const inText = wordRegex.test(normalizedText);

        if (inTargets || inText) {
          finalJidSet.add(user.jid);
          break;
        }
      }
    }
  } catch (lookupErr) {
    console.warn("[RAG Hydration] Error resolviendo usuarios mencionados:", lookupErr);
  }

  const uniqueJids = Array.from(finalJidSet);

  // 2. Cargar perfiles y hechos de los participantes activos y mencionados (priorizando RAM)
  const userProfiles: any[] = [];
  const missingJids: string[] = [];

  for (const jid of uniqueJids) {
    const cached = getCachedUserProfile(jid);
    if (cached) {
      userProfiles.push(cached);
    } else {
      missingJids.push(jid);
    }
  }

  if (missingJids.length > 0) {
    try {
      const fetched = await prisma.userProfile.findMany({
        where: { jid: { in: missingJids } },
        include: {
          aliases: true,
          facts: {
            where: {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ]
            },
            orderBy: { weight: "desc" },
            take: 8,
          },
        },
      });
      userProfiles.push(...fetched);
    } catch (fetchErr) {
      console.warn("[RAG Hydration] Error trayendo perfiles faltantes de DB:", fetchErr);
    }
  }

  const isPersonalQuery = /\b(quien es|qui[eé]n es|quien era|qui[eé]n era|qu[eé] sab[eé]s? (de|sobre|del)|qu[eé] me cont[aá]s? (de|sobre)|qu[eé] me pod[eé]s decir (de|sobre)|hablame de|h[aá]blame de|cont[aá]me? (de|sobre)|decime (algo )?(de|sobre)|conoc[eé]s a|ubic[aá]s a|info de|data de|ten[eé]s data de|de qu[eé] labura|qu[eé] hace|d[oó]nde vive|de d[oó]nde es|qu[eé] juega|a qu[eé] juega|de qu[eé] cuadro|cu[aá]ntos a[ñn]os|c[oó]mo se llama|qu[eé] onda con|qu[eé] onda)\b/i.test(recentText);

  const activeParticipants: string[] = [];
  const userLines: string[] = [];
  const normTargets = (targetUsers || []).map((t) => t.replace(/^@/, "").trim().toLowerCase());

  for (const u of userProfiles) {
    activeParticipants.push(u.primaryName);

    // Mapear alias y apodos conocidos del participante
    const aliasesList = (u.aliases || [])
      .map((a: any) => a.alias)
      .filter((a: string) => a.toLowerCase() !== u.primaryName.toLowerCase());
    const aliasStr = aliasesList.length > 0 ? ` (aka: ${aliasesList.join(", ")})` : "";

    const isRecentSpeaker = activeJidSet.has(u.jid);
    const roleTag = isRecentSpeaker ? "" : " (Mencionado)";

    // Filtrado Quirúrgico: NUNCA volcar la biografía completa del usuario a menos que sea pertinente
    const normText = recentText.toLowerCase();
    const isTargetOfQuery = isPersonalQuery && (
      normText.includes(u.primaryName.toLowerCase()) ||
      aliasesList.some((a: string) => normText.includes(a.toLowerCase())) ||
      normTargets.includes(u.primaryName.toLowerCase()) ||
      aliasesList.some((a: string) => normTargets.includes(a.toLowerCase()))
    );

    const now = new Date();
    const activeFacts = (u.facts || []).filter((f: any) => !f.expiresAt || f.expiresAt > now);

    const relevantFacts: string[] = [];
    const formatFactString = (f: any) => {
      const isOldSeasonal =
        f.tipo === "TEMPORADA" &&
        f.lastConfirmedAt &&
        now.getTime() - new Date(f.lastConfirmedAt).getTime() > 21 * 24 * 60 * 60 * 1000;
      return isOldSeasonal
        ? `${f.clave}: ${f.valor} [dato antiguo, no asumir actual]`
        : `${f.clave}: ${f.valor}`;
    };

    if (isTargetOfQuery) {
      // Si preguntaron por esta persona puntual, traer hasta 6 hechos destacados
      for (const f of activeFacts.slice(0, 6)) {
        relevantFacts.push(formatFactString(f));
      }
    } else {
      // En charla casual, solo incluir un hecho si su tema específico fue mencionado en el chat con coincidencia de palabra completa
      for (const f of activeFacts) {
        const k = f.clave.toLowerCase();
        const v = f.valor.toLowerCase();
        const isKeyInText = k.length >= 3 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normText);
        const isValInText = v.length >= 4 && new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normText);
        if (isKeyInText || isValInText) {
          relevantFacts.push(formatFactString(f));
          if (relevantFacts.length >= 2) break;
        }
      }
    }

    const factsNotice = relevantFacts.length > 0
      ? ` [Datos: ${relevantFacts.join(", ")}]`
      : (isTargetOfQuery ? ` [Sin datos personales registrados todavía]` : "");

    userLines.push(`• @${u.primaryName}${aliasStr}${roleTag}${factsNotice}`);
  }

  const activeUsersContext = userLines.length > 0
    ? userLines.join("\n")
    : "";

  // 2. Jerga relevante del grupo que aparezca en el texto actual (máximo 2 términos, conciso)
  const normalizedText = recentText.toLowerCase();
  const allLexicon = getCachedGroupLexicon();

  const matchedLexicon = allLexicon.filter(
    (l) => l.term.length >= 3 && normalizedText.includes(l.term.toLowerCase())
  ).slice(0, 2);

  const lexiconContext = matchedLexicon.length > 0
    ? `Jerga del grupo: ${matchedLexicon.map((l) => l.term).join(", ")}`
    : "";

  // 3. Tono, chistes quemados y lecciones activas
  const toneContext = getRecentToneContext();
  const burnedJokesContext = getBurnedJokesContext();
  const lessonsContext = getActiveLessonsContext();

  // 4. Búsqueda semántica vectorial histórica (Capa 4/RAG) si el intent es "recuerdo" o pregunta sobre el pasado
  let historicalMemoriesContext = "";
  if (intent === "recuerdo" || MEMORY_RECALL_REGEX.test(recentText)) {
    const memoryMatches = await searchRelevantPastMessages(recentText, 3, 0.50);
    if (memoryMatches.length > 0) {
      const memoryLines = memoryMatches.map(
        (m) => `• [${m.createdAt.toLocaleDateString("es-AR")}] @${m.senderName}: "${m.body}"`
      );
      historicalMemoriesContext = `Recuerdos históricos relevantes recuperados de la memoria vectorial:\n${memoryLines.join("\n")}`;
    }
  }

  // 5. Búsqueda en tiempo real (clima, dólar, partidos, noticias)
  let liveSearchContext = "";
  if (REALTIME_SEARCH_REGEX.test(recentText)) {
    try {
      const liveData = await fetchLiveSearchData(recentText);
      if (liveData) {
        liveSearchContext = `DATOS EN TIEMPO REAL:\n${liveData}`;
      }
    } catch {}
  }

  return {
    activeUsersContext,
    lexiconContext,
    toneContext,
    burnedJokesContext,
    lessonsContext,
    historicalMemoriesContext,
    liveSearchContext,
    activeParticipants,
  };
}
