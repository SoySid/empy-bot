import { prisma, withWriteLock } from "./db/prisma.js";
import { resolveOrRegisterUser } from "./db/user.service.js";
import { ProfessionType } from "../config/economy.config.js";
import { EDUCATION_CONFIG, ExamQuestion } from "../config/education.config.js";

interface ActiveExamSession {
  userJid: string;
  userId: string;
  profession: ProfessionType;
  type: "course" | "degree";
  stageNumber?: number;
  question: ExamQuestion;
  cost: number;
  expiresAt: number; // 5 minutos para responder
}

// Sesiones de examen activas en memoria
const activeExamSessions = new Map<string, ActiveExamSession>();

// Cooldown de recuperatorio por reprobar (3 minutos)
const examCooldowns = new Map<string, number>();

// Cooldown entre parciales de carrera universitaria (15 minutos)
const degreeCooldowns = new Map<string, number>();

/**
 * Obtiene los descuentos acumulados por educación (Carnet Estudiantil y Título de Grado).
 */
export async function getUserEducationDiscounts(userJid: string): Promise<{
  foodDiscountPercent: number;
  toolsDiscountPercent: number;
  hasStudentCard: boolean;
  hasDegree: boolean;
}> {
  try {
    const user = await resolveOrRegisterUser(userJid);
    const possibleJids = [user.jid];
    if (user.lid) possibleJids.push(user.lid);
    if (user.phone) possibleJids.push(user.phone);

    const inv = await (prisma as any).userInventoryItem.findMany({
      where: { userJid: { in: possibleJids }, quantity: { gt: 0 } },
    });

    let foodDiscountPercent = 0;
    let toolsDiscountPercent = 0;
    let hasStudentCard = false;
    let hasDegree = false;

    for (const item of inv) {
      if (item.itemId.startsWith("cert_")) {
        foodDiscountPercent = Math.max(foodDiscountPercent, 20); // 20% descuento en comidas/bebidas
        hasStudentCard = true;
      }
      if (item.itemId.startsWith("diploma_")) {
        toolsDiscountPercent = Math.max(toolsDiscountPercent, 15); // 15% descuento en herramientas
        hasDegree = true;
      }
    }

    return { foodDiscountPercent, toolsDiscountPercent, hasStudentCard, hasDegree };
  } catch {
    return { foodDiscountPercent: 0, toolsDiscountPercent: 0, hasStudentCard: false, hasDegree: false };
  }
}

/**
 * Obtiene los buffs de laburo por educación (Cursos y Diplomas).
 */
export async function getUserEducationBuffs(
  userJid: string,
  profession?: ProfessionType | null
): Promise<{ earningsBonusPercent: number; hungerReductionPercent: number }> {
  if (!profession) return { earningsBonusPercent: 0, hungerReductionPercent: 0 };

  try {
    const user = await resolveOrRegisterUser(userJid);
    const possibleJids = [user.jid];
    if (user.lid) possibleJids.push(user.lid);
    if (user.phone) possibleJids.push(user.phone);

    const inv = await (prisma as any).userInventoryItem.findMany({
      where: { userJid: { in: possibleJids }, quantity: { gt: 0 } },
    });

    let earningsBonusPercent = 0;
    let hungerReductionPercent = 0;

    const certId = `cert_${profession}`;
    const diplomaId = `diploma_${profession}`;

    for (const item of inv) {
      if (item.itemId === certId) {
        earningsBonusPercent += 12; // +12% por curso técnico
      }
      if (item.itemId === diplomaId) {
        earningsBonusPercent += 25; // +25% por título de grado
        hungerReductionPercent += 20; // -20% de cansancio
      }
    }

    return { earningsBonusPercent, hungerReductionPercent };
  } catch {
    return { earningsBonusPercent: 0, hungerReductionPercent: 0 };
  }
}

/**
 * Consulta el estado académico actual de un usuario.
 */
export async function getAcademicStatus(userJid: string, profession: ProfessionType) {
  const edu = EDUCATION_CONFIG[profession];
  if (!edu) return null;

  const user = await resolveOrRegisterUser(userJid);
  const possibleJids = [user.jid];
  if (user.lid) possibleJids.push(user.lid);
  if (user.phone) possibleJids.push(user.phone);

  const inv = await (prisma as any).userInventoryItem.findMany({
    where: { userJid: { in: possibleJids }, quantity: { gt: 0 } },
  });

  const ownedItems = new Set(inv.map((i: any) => i.itemId));

  const hasCourse = ownedItems.has(edu.technicalCourse.certificateItem);
  const hasDegree = ownedItems.has(edu.universityDegree.diplomaItem);

  let degreeStage = 0;
  if (ownedItems.has(`parcial_${profession}_1`)) degreeStage = 1;
  if (ownedItems.has(`parcial_${profession}_2`)) degreeStage = 2;
  if (hasDegree) degreeStage = 3;

  return {
    edu,
    hasCourse,
    hasDegree,
    degreeStage,
  };
}

/**
 * Inicia una sesión de examen para Curso Técnico o Parcial de Carrera.
 */
export async function startExam(
  userJid: string,
  type: "course" | "degree"
): Promise<{
  success: boolean;
  error?: string;
  question?: ExamQuestion;
  stageName?: string;
  facultyName?: string;
  cost?: number;
}> {
  const user = await resolveOrRegisterUser(userJid);
  const profession = (user as any).profession as ProfessionType | null;

  if (!profession || !EDUCATION_CONFIG[profession]) {
    return {
      success: false,
      error: "Para ingresar a la Universidad o realizar cursos técnicos primero debés elegir una profesión con `!profesion`.",
    };
  }

  const edu = EDUCATION_CONFIG[profession];

  // Verificar cooldown de recuperatorio (por reprobar)
  const now = Date.now();
  const failCooldown = examCooldowns.get(userJid);
  if (failCooldown && now < failCooldown) {
    const sec = Math.ceil((failCooldown - now) / 1000);
    return {
      success: false,
      error: `⏳ Estás en período de recuperatorio. El profesor te mandó a repasar las fotocopias. Esperá *${sec} segundos* para volver a rendir.`,
    };
  }

  const academic = await getAcademicStatus(userJid, profession);
  if (!academic) {
    return { success: false, error: "Error cargando legajo universitario." };
  }

  if (type === "course") {
    if (academic.hasCourse) {
      return {
        success: false,
        error: `Ya completaste el *${edu.technicalCourse.name}* y tenés tu Carnet Estudiantil activo. ¡Anotate en la carrera universitaria con \`!uni carrera\`!`,
      };
    }

    const cost = edu.technicalCourse.cost;
    if (user.balance < cost) {
      return {
        success: false,
        error: `No te alcanza para la matrícula del curso técnico. Cuesta *$${cost}* fichas (tu saldo: *$${user.balance}*).`,
      };
    }

    const qPool = edu.technicalCourse.questions;
    const question = qPool[Math.floor(Math.random() * qPool.length)];

    await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: { decrement: cost } },
    });

    activeExamSessions.set(userJid, {
      userJid,
      userId: user.id,
      profession,
      type: "course",
      question,
      cost,
      expiresAt: now + 5 * 60 * 1000,
    });

    return {
      success: true,
      question,
      stageName: edu.technicalCourse.name,
      facultyName: edu.facultyName,
      cost,
    };
  } else {
    // Carrera universitaria
    if (academic.hasDegree) {
      return {
        success: false,
        error: `🎓 ¡Ya estás graduado/a de *${edu.universityDegree.titleName}*! Ya alcanzaste el máximo grado académico de tu oficio.`,
      };
    }

    // Verificar cooldown entre parciales (15 min)
    const degCooldown = degreeCooldowns.get(userJid);
    if (degCooldown && now < degCooldown) {
      const min = Math.ceil((degCooldown - now) / (60 * 1000));
      return {
        success: false,
        error: `⏳ Estás en cursada regular. Debés esperar el recreo universitario entre parciales (*${min} minutos restantes*) antes de rendir la siguiente materia.`,
      };
    }

    const nextStageIdx = academic.degreeStage; // 0, 1 o 2
    const stage = edu.universityDegree.stages[nextStageIdx];

    if (!stage) {
      return { success: false, error: "No hay más etapas pendientes en la carrera." };
    }

    const cost = stage.cost;
    if (user.balance < cost) {
      return {
        success: false,
        error: `No te alcanza para rendir esta materia (*${stage.name}*). Cuesta *$${cost}* fichas (tu saldo: *$${user.balance}*).`,
      };
    }

    const qPool = stage.questions;
    const question = qPool[Math.floor(Math.random() * qPool.length)];

    await prisma.userProfile.update({
      where: { id: user.id },
      data: { balance: { decrement: cost } },
    });

    activeExamSessions.set(userJid, {
      userJid,
      userId: user.id,
      profession,
      type: "degree",
      stageNumber: nextStageIdx + 1,
      question,
      cost,
      expiresAt: now + 5 * 60 * 1000,
    });

    return {
      success: true,
      question,
      stageName: stage.name,
      facultyName: edu.facultyName,
      cost,
    };
  }
}

/**
 * Responde a un examen activo con la opción elegida (A, B o C).
 */
export async function submitExamAnswer(
  userJid: string,
  chosenOption: string
): Promise<{
  success: boolean;
  isCorrect?: boolean;
  error?: string;
  explanation?: string;
  isGraduated?: boolean;
  degreeTitle?: string;
  rewardMessage?: string;
}> {
  const session = activeExamSessions.get(userJid);
  if (!session) {
    return {
      success: false,
      error: "No tenés ningún examen en curso. Iniciá uno con `!uni curso` (técnico) o `!uni carrera` (universidad).",
    };
  }

  const now = Date.now();
  if (now > session.expiresAt) {
    activeExamSessions.delete(userJid);
    return {
      success: false,
      error: "⏱️ ¡Se te venció el tiempo de examen! El profesor te sacó la hoja. Podés volver a intentarlo cuando quieras.",
    };
  }

  const cleanAnswer = chosenOption.trim().toUpperCase() as "A" | "B" | "C";
  if (!["A", "B", "C"].includes(cleanAnswer)) {
    return {
      success: false,
      error: "Opción inválida. Respondé con `!rendir A`, `!rendir B` o `!rendir C`.",
    };
  }

  activeExamSessions.delete(userJid);

  const isCorrect = cleanAnswer === session.question.correctOption;

  if (!isCorrect) {
    // Sanción leve: 3 minutos de recuperatorio
    examCooldowns.set(userJid, now + 3 * 60 * 1000);
    return {
      success: true,
      isCorrect: false,
      explanation: session.question.explanation,
    };
  }

  // APROBÓ EL EXAMEN: Aplicar certificados y títulos en DB (la matrícula ya fue cobrada al iniciar)
  const user = await resolveOrRegisterUser(userJid);
  const profession = session.profession || ((user as any).profession as ProfessionType);
  const edu = EDUCATION_CONFIG[profession];

  if (!edu) {
    return { success: false, error: "No se encontró la configuración académica para tu profesión." };
  }

  return await withWriteLock(async () => {

    if (session.type === "course") {
      // Guardar certificado técnico
      await (prisma as any).userInventoryItem.upsert({
        where: { userJid_itemId: { userJid: user.jid, itemId: edu.technicalCourse.certificateItem } },
        update: { quantity: 1 },
        create: { userJid: user.jid, itemId: edu.technicalCourse.certificateItem, quantity: 1 },
      });

      return {
        success: true,
        isCorrect: true,
        explanation: session.question.explanation,
        rewardMessage:
          `🎉 *¡FELICITACIONES! APROBASTE LA CERTIFICACIÓN TÉCNICA* 🎉\n\n` +
          `Completaste con éxito: *${edu.technicalCourse.name}*.\n\n` +
          `🎖️ *Beneficios Activos Permanentes:*\n` +
          `• 💳 *Carnet de Estudiante Universitario:* *20% de descuento* en todas las comidas y bebidas de la tienda.\n` +
          `• 💪 *Capacitación Profesional:* *+12% de cobro* en cada changa de tu oficio.\n` +
          `• 📜 Certificado oficial añadido a tu \`!inventario\`.\n\n` +
          `🎓 _¿Listo para el título mayor? Anotate a la carrera de grado con \`!uni carrera\`._`,
      };
    } else {
      // Carrera universitaria
      const stageNum = session.stageNumber || 1;

      if (stageNum < 3) {
        // Aprobó parcial intermedio (1 o 2)
        await (prisma as any).userInventoryItem.upsert({
          where: { userJid_itemId: { userJid: user.jid, itemId: `parcial_${profession}_${stageNum}` } },
          update: { quantity: 1 },
          create: { userJid: user.jid, itemId: `parcial_${profession}_${stageNum}`, quantity: 1 },
        });

        // Cooldown de 15 min para el próximo parcial
        degreeCooldowns.set(userJid, now + 15 * 60 * 1000);

        return {
          success: true,
          isCorrect: true,
          explanation: session.question.explanation,
          rewardMessage:
            `📚 *¡MATERIA APROBADA!* 📚\n\n` +
            `Aprobaste la etapa *${stageNum}/3* de tu carrera universitaria.\n` +
            `• El tribunal firmó tu libreta universitaria con un 10 felicitado.\n` +
            `• Podés rendir la siguiente materia tras el recreo académico de 15 minutos (\`!uni carrera\`).`,
        };
      } else {
        // Aprobó la Tesis Final (Etapa 3) -> ¡GRADUACIÓN SUPREMA!
        await (prisma as any).userInventoryItem.upsert({
          where: { userJid_itemId: { userJid: user.jid, itemId: edu.universityDegree.diplomaItem } },
          update: { quantity: 1 },
          create: { userJid: user.jid, itemId: edu.universityDegree.diplomaItem, quantity: 1 },
        });

        // Actualizar título formal en el perfil
        await prisma.userProfile.update({
          where: { id: user.id },
          data: {
            title: edu.universityDegree.titleName,
          },
        });

        return {
          success: true,
          isCorrect: true,
          isGraduated: true,
          degreeTitle: edu.universityDegree.titleName,
          explanation: session.question.explanation,
          rewardMessage:
            `🎓🥚 *¡HABEMUS GRADUADO/A UNIVERSITARIO/A!* 🥚🎓\n\n` +
            `¡Aplausos y lluvia de huevos, harina y papel picado en el grupo!\n` +
            `Acaba de defender con honores su tesis final y recibe su título de grado oficial de:\n\n` +
            `👑 *${edu.universityDegree.titleName.toUpperCase()}* 👑\n\n` +
            `📜 *BENEFICIOS LEGENDARIOS DE EGRESADO:*\n` +
            `• 🎖️ *Título de Honor Social:* Asignado a tu perfil público y changas.\n` +
            `• 💰 *Sueldo Profesional:* *+25% de cobro permanente* en todos tus laburos.\n` +
            `• 🔋 *Rendimiento Ergonómico:* *-20% de cansancio/hambre* al trabajar.\n` +
            `• 🧰 *Matrícula Habilitante:* *15% de descuento permanente* en herramientas y equipamiento en la \`!tienda\`.\n` +
            `• 📜 Diploma de honor enmarcado en tu \`!inventario\`.`,
        };
      }
    }
  });
}
