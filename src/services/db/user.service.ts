import { UserProfile, UserFact, UserAlias } from "@prisma/client";
import { prisma, withWriteLock } from "./prisma.js";
import type { WASocket } from "@whiskeysockets/baileys";
import {
  cleanJid,
  normalizeEntityName,
  isLidIdentifier,
  extractDigits,
  loadLidMappingsToRam,
  registerLidMapping,
  resolveToCanonicalJid,
  getCachedGroupMetadata,
} from "../whatsapp-identity.js";

export type UserProfileWithFacts = UserProfile & {
  facts: UserFact[];
  aliases: UserAlias[];
};

const userCache = new Map<string, UserProfileWithFacts>();

export async function initUserCache(): Promise<void> {
  try {
    await loadLidMappingsToRam();
    await cleanExpiredFacts();

    const profiles = await prisma.userProfile.findMany({
      include: {
        facts: {
          orderBy: { updatedAt: "desc" },
        },
        aliases: true,
      },
    });

    userCache.clear();

    for (const profile of profiles) {
      userCache.set(profile.jid, profile);
      const phoneDigits = extractDigits(profile.phone || profile.jid);
      if (phoneDigits) userCache.set(phoneDigits, profile);

      if (profile.lid) {
        userCache.set(profile.lid, profile);
        const lidDigits = extractDigits(profile.lid);
        if (lidDigits) userCache.set(lidDigits, profile);
      }
    }
    console.log(`[User Cache] 👥 ${profiles.length} perfiles cargados en RAM con sus alias y hechos.`);
  } catch (error) {
    console.error("[User Cache] Error inicializando caché:", error);
  }
}

/**
 * Actualiza de forma atómica e inmediata los datos de un usuario en la caché de RAM.
 * Evita desincronizaciones entre base de datos y memoria RAM (ej: hambre, balance, títulos).
 */
export function updateCachedUser(userJid: string, partial: Partial<UserProfileWithFacts>): void {
  const clean = cleanJid(userJid);
  const digits = extractDigits(clean);
  const existing =
    userCache.get(clean) ||
    (digits ? userCache.get(digits) : undefined);

  if (existing) {
    Object.assign(existing, partial);
    userCache.set(existing.jid, existing);
    if (existing.phone) {
      const pDigits = extractDigits(existing.phone);
      if (pDigits) userCache.set(pDigits, existing);
    }
    if (existing.lid) {
      userCache.set(existing.lid, existing);
      const lDigits = extractDigits(existing.lid);
      if (lDigits) userCache.set(lDigits, existing);
    }
  }
}

/**
 * Refresca puntualmente en RAM la caché de un único usuario sin recargar toda la base de datos.
 */
export async function refreshSingleUserCache(userJid: string): Promise<void> {
  try {
    const clean = cleanJid(userJid);
    const digits = extractDigits(clean);
    const profile = await prisma.userProfile.findFirst({
      where: {
        OR: [
          { jid: clean },
          ...(digits ? [{ phone: digits }] : []),
          { lid: clean },
        ],
      },
      include: {
        facts: { orderBy: { updatedAt: "desc" } },
        aliases: true,
      },
    });

    if (profile) {
      userCache.set(profile.jid, profile);
      const phoneDigits = extractDigits(profile.phone || profile.jid);
      if (phoneDigits) userCache.set(phoneDigits, profile);

      if (profile.lid) {
        userCache.set(profile.lid, profile);
        const lidDigits = extractDigits(profile.lid);
        if (lidDigits) userCache.set(lidDigits, profile);
      }
    }
  } catch (err) {
    console.error(`[User Cache] Error refrescando usuario ${userJid}:`, err);
  }
}

export { cleanJid, normalizeEntityName as normalizeName };

/**
 * Busca un usuario por nombre principal, nombre real o alias exacto (sin falsos positivos de prefijo)
 */
export function findUserByNameOrAlias(query: string): UserProfileWithFacts | null {
  const clean = normalizeEntityName(query.replace(/^@/, ""));
  if (!clean || clean.length < 2) return null;

  // 1. Coincidencia exacta con primaryName o realName
  for (const user of userCache.values()) {
    if (normalizeEntityName(user.primaryName) === clean) return user;
    if (user.realName && normalizeEntityName(user.realName) === clean) return user;
  }

  // 2. Coincidencia exacta con algún alias registrado
  for (const user of userCache.values()) {
    if (user.aliases && user.aliases.some((a) => a.normalized === clean)) {
      return user;
    }
  }

  // 3. Coincidencia de prefijo estricta (solo si la búsqueda tiene al menos 4 caracteres para evitar colisiones)
  // Ordenamos por longitud descendente para que coincidencias más específicas tengan prioridad
  if (clean.length >= 4) {
    const candidates = Array.from(new Set(userCache.values()));
    candidates.sort((a, b) => (b.primaryName?.length || 0) - (a.primaryName?.length || 0));
    for (const user of candidates) {
      if (normalizeEntityName(user.primaryName).startsWith(clean)) return user;
      if (user.aliases && user.aliases.some((a) => a.normalized.startsWith(clean))) return user;
    }
  }

  return null;
}

/**
 * Retorna todos los perfiles de usuario únicos almacenados en la caché de RAM.
 */
export function getAllCachedProfiles(): UserProfileWithFacts[] {
  const unique = new Map<string, UserProfileWithFacts>();
  for (const user of userCache.values()) {
    if (user.jid && !unique.has(user.jid)) {
      unique.set(user.jid, user);
    }
  }
  return Array.from(unique.values());
}

/**
 * Obtiene un perfil de usuario desde la caché de RAM por su JID o dígitos de teléfono.
 */
export function getCachedUserProfile(jid: string): UserProfileWithFacts | undefined {
  const clean = cleanJid(jid);
  const digits = extractDigits(clean);
  return userCache.get(clean) || (digits ? userCache.get(digits) : undefined);
}

/**
 * Retorna los primaryName únicos de todos los usuarios en el cache (excluyendo al bot).
 * Usado para inyectar la lista de participantes en prompts espontáneos.
 */
export function getGroupParticipantNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const user of userCache.values()) {
    if (!user.primaryName || user.primaryName === "empy-bot") continue;
    const name = user.primaryName.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Limpia hechos temporales o episódicos cuya fecha de vencimiento ya pasó
 */
export async function cleanExpiredFacts(): Promise<void> {
  try {
    const now = new Date();
    const result = await prisma.userFact.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });
    if (result.count > 0) {
      console.log(`[User DB] 🧹 ${result.count} hechos temporales vencidos eliminados.`);
    }
  } catch (error) {
    console.error("[User DB] Error limpiando hechos vencidos:", error);
  }
}

export async function deleteUserFact(userJid: string, clave: string): Promise<void> {
  try {
    const cleanClave = normalizeEntityName(clave);
    await withWriteLock(async () => {
      await prisma.userFact.deleteMany({
        where: {
          userJid,
          clave: cleanClave,
        },
      });
    });
    await refreshSingleUserCache(userJid);
    console.log(`[User DB] 🗑️ Hecho eliminado para ${userJid}: [${cleanClave}]`);
  } catch (error) {
    console.error(`[User DB] Error eliminando hecho:`, error);
  }
}

/**
 * Guarda o actualiza un hecho con ponderación y decaimiento (decay) automático:
 * - PERMANENTE: Sin expiración.
 * - TEMPORADA: TTL de 45 días (decay si no se vuelve a mencionar).
 * - EPISODICO: TTL de 48 horas (o ttlHours especificado).
 */
export async function upsertUserFact(
  userJid: string,
  tipo: "PERMANENTE" | "TEMPORADA" | "EPISODICO",
  clave: string,
  valor: string,
  ttlHours?: number
): Promise<void> {
  try {
    const cleanClave = normalizeEntityName(clave);
    const cleanValor = valor.trim();
    if (!cleanClave || !cleanValor) return;

    let expiresAt: Date | null = null;
    const now = new Date();

    if (tipo === "EPISODICO") {
      const hours = ttlHours || 48;
      expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    } else if (tipo === "TEMPORADA") {
      // 45 días de vigencia para temas de temporada
      expiresAt = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    }

    await withWriteLock(async () => {
      const existing = await prisma.userFact.findUnique({
        where: {
          userJid_clave: {
            userJid,
            clave: cleanClave,
          },
        },
      });

      if (existing) {
        await prisma.userFact.update({
          where: { id: existing.id },
          data: {
            tipo,
            valor: cleanValor,
            weight: existing.weight + 1,
            lastConfirmedAt: now,
            expiresAt,
          },
        });
      } else {
        await prisma.userFact.create({
          data: {
            userJid,
            tipo,
            clave: cleanClave,
            valor: cleanValor,
            weight: 1,
            lastConfirmedAt: now,
            expiresAt,
          },
        });
      }
    });

    await refreshSingleUserCache(userJid);
  } catch (error) {
    console.error(`[User DB] Error guardando hecho para ${userJid}:`, error);
  }
}

/**
 * Sincroniza los participantes de un grupo de WhatsApp:
 * Persiste los mapeos LID <-> Teléfono y actualiza la tabla LidMapping.
 */
export async function syncGroupParticipants(sock: WASocket, groupJid: string): Promise<void> {
  try {
    if (!groupJid || !groupJid.endsWith("@g.us")) return;

    const metadata = await getCachedGroupMetadata(sock, groupJid);
    if (!metadata?.participants) return;

    let mappedCount = 0;
    for (const p of metadata.participants) {
      const anyP = p as any;
      const idRaw = cleanJid(anyP.id || "");
      const lidRaw = cleanJid(anyP.lid || "");

      const phoneJid = idRaw.endsWith("@s.whatsapp.net")
        ? idRaw
        : cleanJid(anyP.jid || "").endsWith("@s.whatsapp.net")
        ? cleanJid(anyP.jid)
        : anyP.phoneNumber
        ? `${extractDigits(anyP.phoneNumber)}@s.whatsapp.net`
        : "";

      const lidJid = lidRaw.endsWith("@lid")
        ? lidRaw
        : idRaw.endsWith("@lid")
        ? idRaw
        : cleanJid(anyP.lid || "").endsWith("@lid")
        ? cleanJid(anyP.lid)
        : "";

      if (phoneJid && lidJid) {
        await registerLidMapping(lidJid, phoneJid);
        mappedCount++;

        const cached = userCache.get(phoneJid);
        if (cached && cached.lid === lidJid) {
          continue;
        }

        const phoneDigits = extractDigits(phoneJid);
        const lidDigits = extractDigits(lidJid);

        // Migración/Fusión atómica de UserProfile solo si hay discrepancia pendiente
        await withWriteLock(async () => {
          const lidProfile = await prisma.userProfile.findFirst({
            where: {
              OR: [
                { jid: lidJid },
                { jid: `${lidDigits}@lid` },
                { phone: `lid_${lidDigits}` },
                { phone: lidDigits },
              ],
            },
          });

          const phoneProfile = await prisma.userProfile.findFirst({
            where: {
              OR: [{ jid: phoneJid }, { phone: phoneDigits }],
            },
          });

          if (lidProfile && !phoneProfile) {
            // Migrar perfil de LID a perfil de teléfono canónico
            await prisma.userProfile.update({
              where: { id: lidProfile.id },
              data: {
                jid: phoneJid,
                phone: phoneDigits,
                lid: lidJid,
              },
            });
            console.log(`[User Sync] 🔄 Perfil migrado de LID a teléfono: ${lidProfile.primaryName} -> ${phoneDigits}`);
          } else if (lidProfile && phoneProfile && lidProfile.id !== phoneProfile.id) {
            // Fusionar saldos y dependencias en el perfil canónico sin pérdida de datos
            const mergedBalance = phoneProfile.balance + lidProfile.balance;
            const mergedJobs = (phoneProfile.jobsCompleted || 0) + (lidProfile.jobsCompleted || 0);
            const mergedRobberies = (phoneProfile.robberiesWon || 0) + (lidProfile.robberiesWon || 0);
            const mergedFood = (phoneProfile.foodEaten || 0) + (lidProfile.foodEaten || 0);
            const mergedHunger = Math.max(phoneProfile.hunger ?? 85, lidProfile.hunger ?? 85);
            const mergedBuffTurns = Math.max(phoneProfile.jobBuffTurns || 0, lidProfile.jobBuffTurns || 0);

            await prisma.userProfile.update({
              where: { id: phoneProfile.id },
              data: {
                lid: lidJid,
                balance: mergedBalance,
                jobsCompleted: mergedJobs,
                robberiesWon: mergedRobberies,
                foodEaten: mergedFood,
                hunger: mergedHunger,
                jobBuffTurns: mergedBuffTurns,
                role: phoneProfile.role === "admin" || lidProfile.role === "admin" ? "admin" : phoneProfile.role,
                profession: phoneProfile.profession || lidProfile.profession || null,
              },
            });

            // Reasignar alias de forma segura evitando colisiones de clave única
            const lidAliases = await prisma.userAlias.findMany({
              where: { userJid: lidProfile.jid },
            });
            for (const a of lidAliases) {
              try {
                const exists = await prisma.userAlias.findFirst({
                  where: { userJid: phoneProfile.jid, normalized: a.normalized },
                });
                if (!exists) {
                  await prisma.userAlias.update({
                    where: { id: a.id },
                    data: { userJid: phoneProfile.jid },
                  });
                } else {
                  await prisma.userAlias.delete({ where: { id: a.id } });
                }
              } catch (aliasErr) {
                console.warn(`[User Sync] Error conciliando alias ${a.alias}:`, aliasErr);
              }
            }

            // Migrar recuerdos y hechos aprendidos (UserFact) para evitar su eliminación en cascada
            const lidFacts = await prisma.userFact.findMany({
              where: { userJid: lidProfile.jid },
            });
            for (const fact of lidFacts) {
              try {
                const existingFact = await prisma.userFact.findFirst({
                  where: { userJid: phoneProfile.jid, clave: fact.clave },
                });
                if (!existingFact) {
                  await prisma.userFact.update({
                    where: { id: fact.id },
                    data: { userJid: phoneProfile.jid },
                  });
                } else {
                  await prisma.userFact.delete({ where: { id: fact.id } });
                }
              } catch (factErr) {
                console.warn(`[User Sync] Error conciliando hecho ${fact.clave}:`, factErr);
              }
            }

            // Migrar recordatorios creados desde el LID
            await prisma.reminder.updateMany({
              where: { creatorJid: lidProfile.jid },
              data: { creatorJid: phoneProfile.jid },
            }).catch(() => {});

            // Conciliar inventario
            const lidItems = await (prisma as any).userInventoryItem.findMany({
              where: { userJid: lidProfile.jid },
            });
            for (const item of lidItems) {
              try {
                const existingPhoneItem = await (prisma as any).userInventoryItem.findUnique({
                  where: { userJid_itemId: { userJid: phoneProfile.jid, itemId: item.itemId } },
                });
                if (existingPhoneItem) {
                  await (prisma as any).userInventoryItem.update({
                    where: { id: existingPhoneItem.id },
                    data: { quantity: { increment: item.quantity } },
                  });
                  await (prisma as any).userInventoryItem.delete({ where: { id: item.id } });
                } else {
                  await (prisma as any).userInventoryItem.update({
                    where: { id: item.id },
                    data: { userJid: phoneProfile.jid },
                  });
                }
              } catch (itemErr) {
                console.warn(`[User Sync] Error conciliando ítem ${item.itemId}:`, itemErr);
              }
            }

            await prisma.userProfile.delete({
              where: { id: lidProfile.id },
            }).catch(() => {});

            // Invalidar cachés de RAM para ambos perfiles
            userCache.delete(lidProfile.jid);
            userCache.delete(phoneProfile.jid);
            if (lidProfile.lid) userCache.delete(lidProfile.lid);
            if (phoneProfile.lid) userCache.delete(phoneProfile.lid);
            if (lidProfile.phone) userCache.delete(lidProfile.phone);
            if (phoneProfile.phone) userCache.delete(phoneProfile.phone);

            console.log(`[User Sync] 🔄 Perfil duplicado fusionado integralmente: ${lidProfile.primaryName} -> ${phoneProfile.primaryName} (${phoneDigits})`);
          } else if (phoneProfile && !phoneProfile.lid) {
            await prisma.userProfile.update({
              where: { id: phoneProfile.id },
              data: { lid: lidJid },
            });
            userCache.delete(phoneProfile.jid);
            if (phoneProfile.phone) userCache.delete(phoneProfile.phone);
          }
        }).catch((syncErr) => {
          console.warn(`[User Sync] Error migrando ${lidJid} -> ${phoneJid}:`, syncErr);
        });
      }
    }
    console.log(`[User Sync] 🔄 ${mappedCount} integrantes analizados/mapeados en DB (LID <-> Teléfono).`);
  } catch (error) {
    console.error("[User Sync] Error sincronizando grupo:", error);
  }
}

/**
 * Resuelve unívocamente un participante a su perfil canónico (@s.whatsapp.net).
 * Evita la duplicación de usuarios cuando entran vía LID o cambian su pushName.
 */
export async function resolveOrRegisterUser(
  rawJid: string,
  pushName?: string | null
): Promise<UserProfileWithFacts> {
  const canonicalJid = await resolveToCanonicalJid(rawJid);
  const cleanRaw = cleanJid(rawJid);
  const phoneDigits = extractDigits(canonicalJid);
  const isLid = isLidIdentifier(cleanRaw);

  // 1. Chequear en caché de RAM
  if (userCache.has(canonicalJid)) return userCache.get(canonicalJid)!;
  if (phoneDigits && userCache.has(phoneDigits)) return userCache.get(phoneDigits)!;
  if (userCache.has(cleanRaw)) return userCache.get(cleanRaw)!;

  try {
    return await withWriteLock(async () => {
      // 2. Buscar en base de datos por JID canónico, teléfono o LID
      let profile = await prisma.userProfile.findFirst({
        where: {
          OR: [
            { jid: canonicalJid },
            { phone: phoneDigits },
            ...(isLid ? [{ lid: cleanRaw }] : []),
          ],
        },
        include: { facts: true, aliases: true },
      });

      // Si el perfil existe pero no tenía vinculado este LID, registrar el mapeo
      if (profile && isLid && (!profile.lid || profile.lid !== cleanRaw)) {
        await registerLidMapping(cleanRaw, profile.jid);
        profile = await prisma.userProfile.update({
          where: { id: profile.id },
          data: { lid: cleanRaw },
          include: { facts: true, aliases: true },
        });
      }

      // Si viene un pushName nuevo, guardarlo como alias secundario si no existía
      if (profile && pushName && pushName.trim().length >= 2) {
        const normPush = normalizeEntityName(pushName);
        const aliasExists = profile.aliases.some((a) => a.normalized === normPush);

        if (!aliasExists && normPush !== normalizeEntityName(profile.primaryName)) {
          await prisma.userAlias.create({
            data: {
              userJid: profile.jid,
              alias: pushName.trim(),
              normalized: normPush,
              isPrimary: false,
            },
          });
          profile = await prisma.userProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: { facts: true, aliases: true },
          });
        }
      }

      // Si no existe el perfil, crearlo canónicamente
      if (!profile) {
        const isCanonicalPhone = canonicalJid.endsWith("@s.whatsapp.net");
        const realPhone = isCanonicalPhone && phoneDigits ? phoneDigits : `lid_${extractDigits(cleanRaw)}`;
        const userCanonicalJid = isCanonicalPhone && phoneDigits ? `${phoneDigits}@s.whatsapp.net` : cleanRaw;
        const displayName = pushName?.trim() || (isCanonicalPhone && phoneDigits ? `@${phoneDigits}` : "Usuario");

        profile = await prisma.userProfile.create({
          data: {
            jid: userCanonicalJid,
            lid: isLid ? cleanRaw : null,
            phone: realPhone,
            pushName: pushName?.trim() || null,
            primaryName: displayName,
            role: "member",
          },
          include: { facts: true, aliases: true },
        });

        // Crear alias inicial
        const normDisplay = normalizeEntityName(displayName);
        if (normDisplay) {
          await prisma.userAlias.create({
            data: {
              userJid: profile.jid,
              alias: displayName,
              normalized: normDisplay,
              isPrimary: true,
            },
          });
          profile = await prisma.userProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: { facts: true, aliases: true },
          });
        }

        if (isLid) {
          await registerLidMapping(cleanRaw, userCanonicalJid);
        }

        console.log(`[User DB] 👤 Nuevo perfil creado: ${displayName} (${realPhone})`);
      }

      if (!profile) {
        throw new Error(`[User DB] No se pudo encontrar ni crear el perfil para ${rawJid}`);
      }

      // Actualizar caché en RAM
      userCache.set(profile.jid, profile);
      if (profile.phone && !profile.phone.startsWith("lid_")) {
        userCache.set(profile.phone, profile);
      }
      if (profile.lid) {
        userCache.set(profile.lid, profile);
        userCache.set(extractDigits(profile.lid), profile);
      }

      return profile;
    });
  } catch (error) {
    console.error(`[User DB] Error resolviendo usuario (${rawJid}):`, error);
    throw new Error(`[User DB] Fallo al resolver usuario ${rawJid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Obtiene el nombre formateado de un usuario en negrita (*Nombre*) sin mención ni ping de WhatsApp.
 */
export function formatUserName(phoneOrJid: string): string {
  const cleaned = cleanJid(phoneOrJid);
  const user = userCache.get(cleaned) || userCache.get(extractDigits(cleaned));
  if (user?.primaryName) return `*${user.primaryName}*`;
  if (user?.realName) return `*${user.realName}*`;
  const digits = extractDigits(cleaned);
  return digits ? `*${digits}*` : "*Usuario*";
}

/**
 * Reemplaza menciones semánticas por menciones nativas de WhatsApp (@<telefono>)
 * y recopila el array de JIDs canónicos (<telefono>@s.whatsapp.net) para Baileys.
 */
export function parseOutboundMentions(text: string): {
  formattedText: string;
  mentions: string[];
} {
  const mentionsSet = new Set<string>();
  let formattedText = text;

  const uniqueUsers = Array.from(new Set(userCache.values()));
  interface MentionCandidate {
    name: string;
    phone: string;
    jid: string;
  }
  const candidates: MentionCandidate[] = [];

  for (const user of uniqueUsers) {
    if (!user.primaryName || !user.phone || user.phone.startsWith("lid_")) continue;

    const namesToCheck: string[] = [
      user.primaryName,
      ...(user.realName ? [user.realName] : []),
      ...(user.aliases ? user.aliases.map((a) => a.alias) : []),
    ];

    for (const name of namesToCheck) {
      if (!name || name.trim().length < 2) continue;
      candidates.push({
        name: name.trim(),
        phone: user.phone,
        jid: user.jid,
      });
    }
  }

  // Ordenar de mayor a menor longitud para que "matias" se reemplace antes que "mati"
  candidates.sort((a, b) => b.name.length - a.name.length);

  for (const candidate of candidates) {
    const regex = new RegExp(`@${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(formattedText)) {
      const phoneDigits = extractDigits(candidate.phone);
      const targetMentionJid = `${phoneDigits}@s.whatsapp.net`;
      mentionsSet.add(targetMentionJid);
      formattedText = formattedText.replace(regex, `@${phoneDigits}`);
    }
  }

  // Detectar también números crudos que el bot haya escrito con @ (ej: @5491100000001)
  const rawNumberMatches = formattedText.match(/@(\d{10,15})/g);
  if (rawNumberMatches) {
    for (const match of rawNumberMatches) {
      const phoneDigits = match.replace("@", "");
      mentionsSet.add(`${phoneDigits}@s.whatsapp.net`);
    }
  }

  return { formattedText, mentions: Array.from(mentionsSet) };
}

/**
 * CONTEXTO QUIRÚRGICO Y EFICIENTE:
 * Solo inyecta hechos relevantes (máximo 3-5 hechos clave por usuario activo),
 * priorizando hechos permanentes y descartando los vencidos para no inflar la ventana de tokens.
 */
export function getContextualUsersPrompt(
  speakerJid: string,
  quotedJid?: string,
  messageText = ""
): string {
  if (userCache.size === 0) return "";

  const speakerDigits = extractDigits(speakerJid);
  const speaker = userCache.get(speakerJid) || (speakerDigits ? userCache.get(speakerDigits) : undefined);

  const quotedDigits = quotedJid ? extractDigits(quotedJid) : "";
  const quoted = quotedJid
    ? userCache.get(quotedJid) || (quotedDigits ? userCache.get(quotedDigits) : undefined)
    : null;

  const relevantUsers = new Map<string, UserProfileWithFacts>();

  if (speaker) relevantUsers.set(speaker.id, speaker);
  if (quoted) relevantUsers.set(quoted.id, quoted);

  // Buscar si en el texto nombraron a alguien más
  if (messageText) {
    const cleanText = normalizeEntityName(messageText);
    for (const user of userCache.values()) {
      if (relevantUsers.has(user.id)) continue;

      const normPrimary = normalizeEntityName(user.primaryName);
      const isNamed = cleanText.includes(normPrimary);
      const isAliasNamed = user.aliases && user.aliases.some(
        (a) => a.normalized.length >= 3 && cleanText.includes(a.normalized)
      );

      if (isNamed || isAliasNamed) {
        relevantUsers.set(user.id, user);
      }
    }
  }

  if (relevantUsers.size === 0) return "";

  const now = new Date();
  const userLines: string[] = [];

  for (const user of relevantUsers.values()) {
    const isSpeaker = user.id === speaker?.id;
    const isQuoted = user.id === quoted?.id;
    const roleTag = user.role === "owner" ? " (Owner)" : user.role === "admin" ? " (Admin)" : "";
    const statusTag = isSpeaker ? " [habla ahora]" : isQuoted ? " [citado]" : "";

    // Solo inyectar hechos si el mensaje actual pregunta por la persona o menciona explícitamente el tema del hecho
    const normMsg = (messageText || "").toLowerCase();
    const isPersonalQuery = /\b(quien es|qui[eé]n es|quien era|qui[eé]n era|qu[eé] sab[eé]s?|data de|info de|contame de|hablame de|conoc[eé]s a|ubic[aá]s a)\b/i.test(normMsg);

    const relevantFacts = (user.facts || [])
      .filter((f) => !f.expiresAt || f.expiresAt > now)
      .filter((f) => {
        if (isPersonalQuery && normMsg.includes(user.primaryName.toLowerCase())) return true;
        const k = f.clave.toLowerCase();
        const v = f.valor.toLowerCase();
        if (k.length >= 3) {
          const keyRegex = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          if (keyRegex.test(normMsg)) return true;
        }
        if (v.length >= 4 && normMsg.includes(v)) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.tipo === "PERMANENTE" && b.tipo !== "PERMANENTE") return -1;
        if (b.tipo === "PERMANENTE" && a.tipo !== "PERMANENTE") return 1;
        return (b.weight || 1) - (a.weight || 1);
      })
      .slice(0, 2);

    const factsStr = relevantFacts.length > 0
      ? ` (${relevantFacts.map((f) => `${f.clave}: ${f.valor}`).join(", ")})`
      : "";

    userLines.push(`• @${user.primaryName}${roleTag}${statusTag}${factsStr}`);
  }

  return `Participantes:\n${userLines.join("\n")}\n`;
}