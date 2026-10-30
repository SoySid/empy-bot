import { Command, CommandContext } from "../types.js";
import {
  getAcademicStatus,
  startExam,
  submitExamAnswer,
  getUserEducationDiscounts,
} from "../../services/education.service.js";
import { ProfessionType } from "../../config/economy.config.js";

export const universidadCommand: Command = {
  name: "universidad",
  aliases: ["uni", "facultad", "estudiar", "cursos", "carrera", "rendir"],
  description: "Accedé a la universidad y cursos técnicos para obtener títulos y buffs permanentes (!uni, !uni curso, !uni carrera, !rendir <opción>).",
  execute: async ({ sock, msg, remoteJid, body, cleanText, args, senderProfile }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";

    const invokedCmd = body.trim().replace(/^[!/]/, "").split(/\s+/)[0]?.toLowerCase() || "";
    const firstArg = (args[0] || "").toLowerCase();
    const secondArg = (args[1] || "").toUpperCase();

    // Si el usuario usó directamente el comando !rendir <opción> o !uni rendir <opción>
    if (invokedCmd === "rendir" && args[0]) {
      await handleAnswer(sock, remoteJid, msg, senderJid, args[0]);
      return;
    }

    if (firstArg === "rendir" && args[1]) {
      await handleAnswer(sock, remoteJid, msg, senderJid, args[1]);
      return;
    }

    if ((firstArg === "responder" || firstArg === "respuesta") && secondArg) {
      await handleAnswer(sock, remoteJid, msg, senderJid, secondArg);
      return;
    }

    if (firstArg === "a" || firstArg === "b" || firstArg === "c") {
      await handleAnswer(sock, remoteJid, msg, senderJid, firstArg);
      return;
    }

    // 1. Iniciar examen de Curso Técnico
    if (firstArg === "curso" || firstArg === "tecnico" || firstArg === "tecnicatura") {
      const res = await startExam(senderJid, "course");
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
        return;
      }

      const q = res.question!;
      const text =
        `📝 *EXAMEN DE CERTIFICACIÓN TÉCNICA* 📝\n` +
        `🏛️ *${res.facultyName}*\n` +
        `📚 *Programa:* ${res.stageName}\n` +
        `💵 *Arancel de examen:* *$${res.cost}* fichas (se abona al aprobar)\n\n` +
        `❓ *CONSIGNA DE EVALUACIÓN:*\n` +
        `_${q.question}_\n\n` +
        `*A)* ${q.options.A}\n\n` +
        `*B)* ${q.options.B}\n\n` +
        `*C)* ${q.options.C}\n\n` +
        `⏱️ Tenés 5 minutos para responder.\n` +
        `✍️ *Para responder:* enviá \`!rendir A\`, \`!rendir B\` o \`!rendir C\`.`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // 2. Iniciar examen de Carrera de Grado Universitaria
    if (firstArg === "carrera" || firstArg === "grado" || firstArg === "parcial" || firstArg === "rendir") {
      const res = await startExam(senderJid, "degree");
      if (!res.success) {
        await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
        return;
      }

      const q = res.question!;
      const text =
        `🏛️ *MESA DE EXAMEN UNIVERSITARIO* 🏛️\n` +
        `📍 *${res.facultyName}*\n` +
        `📖 *Materia:* ${res.stageName}\n` +
        `💵 *Derecho de examen:* *$${res.cost}* fichas (se descuenta al aprobar)\n\n` +
        `❓ *PREGUNTA DEL TRIBUNAL:*\n` +
        `_${q.question}_\n\n` +
        `*A)* ${q.options.A}\n\n` +
        `*B)* ${q.options.B}\n\n` +
        `*C)* ${q.options.C}\n\n` +
        `⏱️ Tenés 5 minutos para responder.\n` +
        `✍️ *Para responder:* enviá \`!rendir A\`, \`!rendir B\` o \`!rendir C\`.`;

      await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
      return;
    }

    // 3. Menú principal de la Universidad / Panel del Estudiante
    const prof = senderProfile?.profession as ProfessionType | undefined;
    if (!prof) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🏛️ *UNIVERSIDAD NACIONAL DE EMPYREAL*\n\n` +
            `Para inscribirte en cursos técnicos o carreras de grado, primero tenés que tener un oficio activo.\n\n` +
            `Elegí tu oficio con \`!profesion\` y volvé a consultar la oferta académica con \`!uni\`.`,
        },
        { quoted: msg as any }
      );
      return;
    }

    const academic = await getAcademicStatus(senderJid, prof);
    if (!academic) {
      await sock.sendMessage(remoteJid, { text: "❌ Error cargando información académica." }, { quoted: msg as any });
      return;
    }

    const { edu, hasCourse, hasDegree, degreeStage } = academic;
    const discounts = await getUserEducationDiscounts(senderJid);

    const courseStatus = hasCourse
      ? "✅ *[CERTIFICADO OBTENIDO]* (+12% cobro y 20% OFF en comidas)"
      : `(\`!uni curso\`) — *$${edu.technicalCourse.cost}* fichas`;

    let degreeStatus = "";
    if (hasDegree) {
      degreeStatus = `👑 *[GRADUADO OFICIAL]* — *"${edu.universityDegree.titleName}"* (+25% cobro, -20% cansancio y 15% OFF en herramientas)`;
    } else {
      const nextStage = edu.universityDegree.stages[degreeStage];
      degreeStatus = `Etapa ${degreeStage}/3 cursada.\n  Próxima materia: *${nextStage?.name || "Final"}* (\`!uni carrera\`) — *$${nextStage?.cost || 4000}* fichas`;
    }

    const discountsText =
      discounts.hasStudentCard || discounts.hasDegree
        ? `\n💳 *TUS DESCUENTOS ACTIVOS:*\n` +
          `${discounts.hasStudentCard ? "• 🍔 *20% de descuento* en rotisería y comidas (!tienda morfi)\n" : ""}` +
          `${discounts.hasDegree ? "• 🧰 *15% de descuento* en herramientas y equipamiento\n" : ""}`
        : "";

    const message =
      `🏛️ *${edu.facultyName.toUpperCase()}*\n` +
      `Estudiante: *${senderProfile?.primaryName || "Alumno"}* | Carrera de: *${edu.profession.toUpperCase()}*\n\n` +
      `🎓 *1. CURSO TÉCNICO / TERCIARIO:*\n` +
      `• *${edu.technicalCourse.name}*\n` +
      `  Estado: ${courseStatus}\n\n` +
      `🏛️ *2. CARRERA DE GRADO UNIVERSITARIA:*\n` +
      `• *Título habilitante:* *${edu.universityDegree.titleName}*\n` +
      `  Estado: ${degreeStatus}\n` +
      discountsText +
      `\n📚 *CÓMO CURSAR Y RENDIR:*\n` +
      `• Para rendir el curso técnico: \`!uni curso\`\n` +
      `• Para rendir tu materia/parcial universitario: \`!uni carrera\`\n` +
      `• Para responder un examen en curso: \`!rendir <A, B o C>\``;

    await sock.sendMessage(remoteJid, { text: message }, { quoted: msg as any });
  },
};

async function handleAnswer(
  sock: any,
  remoteJid: string,
  msg: any,
  senderJid: string,
  chosenOption: string
) {
  const res = await submitExamAnswer(senderJid, chosenOption);

  if (!res.success) {
    await sock.sendMessage(remoteJid, { text: `❌ ${res.error}` }, { quoted: msg as any });
    return;
  }

  if (!res.isCorrect) {
    const text =
      `❌ *¡EXAMEN REPROBADO!* ❌\n\n` +
      `La opción elegida no era la correcta.\n\n` +
      `📖 *Explicación del docente:*\n` +
      `_${res.explanation}_\n\n` +
      `⏳ El profesor te mandó a recuperatorio. No perdiste tus fichas. Podés volver a rendir tras un repaso de *3 minutos* con \`!uni curso\` o \`!uni carrera\`.`;
    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
    return;
  }

  // APROBÓ
  const text = `🎓 *¡FELICITACIONES!*\n\n${res.rewardMessage}`;
  await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
}
