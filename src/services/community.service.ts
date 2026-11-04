import type { WASocket } from "@whiskeysockets/baileys";
import { prisma, withKeyLock } from "./db/prisma.js";
import { resolveOrRegisterUser, formatUserName } from "./db/user.service.js";
import { modifyBalance, getUserProfession, getUserProfessionBuffs } from "./economy.service.js";
import { ProfessionType, PROFESSIONS } from "../config/economy.config.js";
import { isUserEconomyFrozen } from "./admin-economy.service.js";
import { generateEmergencyAlertCard } from "./community-card.service.js";

export interface EmergencyTemplate {
  profession: ProfessionType;
  professionTitle: string;
  emoji: string;
  situations: string[];
}

export const EMERGENCY_TEMPLATES: Record<ProfessionType, EmergencyTemplate> = {
  mecanico: {
    profession: "mecanico",
    professionTitle: "Mecánico",
    emoji: "🚗🔧",
    situations: [
      "¡A {victim} se le fundió la junta de la tapa del Duna en plena avenida y larga una humareda negra tóxica!",
      "¡La moto de {victim} se quedó sin compresión en una subida, le escupe fuego el escape y no arranca ni a patadas!",
      "¡A {victim} se le cortó la correa de distribución a 5 cuadras del laburo y necesita auxilio mecánico urgente!",
      "¡A {victim} le empezó a zapatear el embrague en pleno semáforo y quedó cruzado en medio del tránsito!",
    ],
  },
  enfermero: {
    profession: "enfermero",
    professionTitle: "Enfermero",
    emoji: "🏥🩺",
    situations: [
      "¡{victim} se descompensó por el calorazo de 41°C, le bajó la presión y está tirado/a en el cordón pidiendo auxilio!",
      "¡{victim} se cortó feo la mano abriendo una lata de picadillo oxidada y no para de sangrar!",
      "¡A {victim} le agarró un golpe de calor fulminante con 39° de fiebre tras podar el paraíso al mediodía!",
      "¡A {victim} le picó una avispa brava en el cuello, se le hinchó todo y necesita primeros auxilios ya!",
    ],
  },
  programador: {
    profession: "programador",
    professionTitle: "Programador",
    emoji: "💻👾",
    situations: [
      "¡A {victim} le saltó un ransomware ruso en la compu que le encriptó las fotos del perro y le drena la billetera virtual!",
      "¡A {victim} se le pinchó la base de datos en producción por un DELETE sin WHERE y necesita rollback de emergencia!",
      "¡A {victim} le tiró pantalla azul de la muerte con loop infinito de reinicio a media hora de entregar un proyecto!",
      "¡A {victim} le hackearon el mail y están pidiendo transferencias en su nombre, necesita un parche de seguridad urgente!",
    ],
  },
  albanil: {
    profession: "albanil",
    professionTitle: "Albañil",
    emoji: "🧱🔨",
    situations: [
      "¡A {victim} se le reventó el caño maestro del baño y tiene el agua hasta los tobillos en todo el living!",
      "¡A {victim} se le rajó la medianera de punta a punta y se le viene abajo el tinglado del patio!",
      "¡El techo de losa de {victim} se fisuró con la tormenta y cae una catarata directo sobre el televisor!",
      "¡A {victim} se le desmoronó el pozo ciego y necesita apuntalar los cimientos antes de que se hunda la cocina!",
    ],
  },
  modelo: {
    profession: "modelo",
    professionTitle: "Modelo",
    emoji: "✨💅",
    situations: [
      "¡{victim} tiene una fiesta de gala en una hora pero combinó bermuda de baño hawaiana con mocasines de cuero y medias blancas!",
      "¡{victim} tiene una sesión de fotos urgente para el pasaporte pero posa con la rigidez de un poste de luz!",
      "¡A {victim} le tiñeron mal las cejas y tiene un casting en Ramos Mejía, necesita estilismo y asesoría de imagen salvadora!",
      "¡A {victim} se le desgarró el pantalón justo antes de subir a dar una charla y necesita un arreglo de vestuario glamoroso!",
    ],
  },
  preventista: {
    profession: "preventista",
    professionTitle: "Preventista",
    emoji: "📋🚚",
    situations: [
      "¡El almacén de {victim} se quedó sin stock de birras ni fernet un viernes a la noche y la cuadra entera está haciendo fila furiosa!",
      "¡{victim} necesita mercadería a precio mayorista urgente para abastecer la fiesta del barrio antes de que cierren las distribuidoras!",
      "¡A {victim} le falló el repartidor de gaseosas y necesita que un preventista le baje 10 cajones de promo de inmediato!",
      "¡El kiosco de {victim} se quedó sin cigarrillos ni alfajores y los clientes le están pateando la persiana!",
    ],
  },
  recepcionista: {
    profession: "recepcionista",
    professionTitle: "Recepcionista",
    emoji: "📦📬",
    situations: [
      "¡A {victim} le retuvieron una encomienda crítica en el Correo de Limpio y no le dan el número de seguimiento ni el remito!",
      "¡{victim} perdió el número de turno en la mesa de entrada central y lo mandaron al fondo de una cola de 80 personas!",
      "¡A {victim} le traspapelaron un paquete con repuestos importados en el depósito y necesita que alguien destrabe el despacho!",
      "¡El trámite de urgencia de {victim} quedó encajonado en el despacho 4 y se vence en 15 minutos!",
    ],
  },
  espia: {
    profession: "espia",
    professionTitle: "Espía / Agente Secreto",
    emoji: "🕵️‍♂️🕶️",
    situations: [
      "¡A {victim} le clonaron la cuenta de WhatsApp y le están pidiendo guita a sus contactos, necesita un contraespionaje urgente!",
      "¡{victim} sospecha que le plantaron un micrófono en el auto y necesita un barrido electrónico para no quedar regalado/a!",
      "¡A {victim} lo están extorsionando por privado con fotos truchas y necesita que un espía rastree la IP del chantajista!",
      "¡{victim} necesita investigar urgentemente los antecedentes dudosos de un socio antes de firmar un contrato en la escribanía!",
    ],
  },
  manicura: {
    profession: "manicura",
    professionTitle: "Manicura / Nails Artist",
    emoji: "💅✨",
    situations: [
      "¡A {victim} se le arrancó una uña esculpida de cuajo antes de entrar al boliche y le sangra el dedo pidiendo auxilio estético!",
      "¡{victim} tiene una fiesta de 15 en dos horas y le quedó el esmalte todo saltado con cutículas desastrosas!",
      "¡A {victim} se le partió la uña del pulgar al ras abriendo una lata y necesita reconstrucción con acrílico urgente!",
      "¡{victim} se hizo las uñas en un local trucho, se le infectaron los bordes y necesita auxilio de manicura profesional ya!",
    ],
  },
  tatuadora: {
    profession: "tatuadora",
    professionTitle: "Tatuadora / Piercer",
    emoji: "💉🖤",
    situations: [
      "¡A {victim} se le enganchó el piercing nuevo de la oreja con el buzo de lana y necesita desinfección y cambio de aro urgente!",
      "¡{victim} se tatuó el nombre de la ex en el cuello en pedo anoche y necesita un cover-up o asesoría antes de que lo vean!",
      "¡A {victim} se le infectó un tatuaje por no ponerse crema y necesita auxilio de curación y cuidados intensivos!",
      "¡A {victim} se le cerró la perforación de la nariz a mitad de camino con el aro trabado y no aguanta el dolor!",
    ],
  },
  macumbero: {
    profession: "macumbero",
    professionTitle: "Macumbero / Brujo",
    emoji: "🔮🕯️",
    situations: [
      "¡A {victim} le dejaron una bolsa con pochoclo, cintas rojas y velas negras en la puerta de la casa y tiene pánico de salir!",
      "¡{victim} siente una pesadez infernal en la espalda desde que cruzó la plaza y jura que le tiraron un mal de ojo pesadísimo!",
      "¡A {victim} se le apagan las luces de la casa solas y escucha susurros en el pasillo, necesita una limpieza espiritual ya!",
      "¡{victim} descubrió que le hicieron un amarre en el trabajo porque no para de soñar con el jefe y pide auxilio de corte de brujería!",
    ],
  },
  profesora_especial: {
    profession: "profesora_especial",
    professionTitle: "Prof. de Educación Especial",
    emoji: "🧩📚",
    situations: [
      "¡El hermanito de {victim} tuvo una sobrecarga sensorial por los ruidos de la calle y necesita contención y pictogramas urgente!",
      "¡{victim} tiene que presentar una adaptación curricular de emergencia para su hijo antes de que cierre la escuela y no sabe cómo redactarla!",
      "¡Un nene no verbal se perdió en la plaza cerca de {victim} y necesita un docente con tablero aumentativo para comunicarse y calmarlo!",
      "¡A {victim} se le desreguló un alumno en el cumpleaños y necesita alguien con juguetes sensoriales y contención especializada ya!",
    ],
  },
};

export interface ActiveEmergency {
  id: string;
  remoteJid: string;
  victimJid: string;
  requiredProfession: ProfessionType;
  professionTitle: string;
  text: string;
  rewardHelper: number;
  rewardBuffTurns: number;
  createdAt: number;
  expiresAt: number;
}

// Almacén en memoria de emergencias activas indexadas por remoteJid
const activeEmergencies = new Map<string, ActiveEmergency>();

/**
 * Obtiene la emergencia activa actual en el chat si no ha expirado.
 */
export function getActiveEmergency(remoteJid: string): ActiveEmergency | null {
  const em = activeEmergencies.get(remoteJid);
  if (!em) return null;
  if (Date.now() > em.expiresAt) {
    activeEmergencies.delete(remoteJid);
    return null;
  }
  return em;
}

/**
 * Dispara una emergencia inteligente asegurando:
 * 1. La profesión requerida existe actualmente en al menos un integrante registrado en la base de datos.
 * 2. La víctima seleccionada NO tiene esa profesión (el mecánico no rompe su auto, el enfermero no se desmaya).
 */
export async function triggerSmartEmergency(
  sock: WASocket,
  remoteJid: string,
  candidateJids: string[]
): Promise<boolean> {
  // Si ya hay una emergencia en curso, no solapar
  const existing = getActiveEmergency(remoteJid);
  if (existing) return false;

  try {
    // 1. Obtener todos los usuarios con profesión asignada en la BD
    const rows = await prisma.userProfile.findMany({
      where: {
        profession: { not: null },
      },
      select: { jid: true, profession: true },
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return false;
    }

    // Conjunto de profesiones disponibles en la comunidad
    const availableProfessions = Array.from(
      new Set(rows.map((u) => u.profession as ProfessionType).filter(Boolean))
    ).filter((p) => EMERGENCY_TEMPLATES[p] !== undefined);

    if (availableProfessions.length === 0) return false;

    // 2. Elegir una profesión requerida al azar entre las que existen
    const selectedProfession =
      availableProfessions[Math.floor(Math.random() * availableProfessions.length)];
    const template = EMERGENCY_TEMPLATES[selectedProfession];

    // Mapear JIDs a su profesión actual
    const profMap = new Map<string, string>();
    for (const u of rows) {
      if (u.profession) profMap.set(u.jid, u.profession);
    }

    // 3. Filtrar víctimas candidatas: integrantes recientes que NO tengan la profesión requerida
    let potentialVictims = candidateJids.filter(
      (jid) => profMap.get(jid) !== selectedProfession
    );

    // Si no hay entre los recientes, buscar en la BD usuarios que no tengan esa profesión
    if (potentialVictims.length === 0) {
      const dbVictims = await prisma.userProfile.findMany({
        where: {
          OR: [
            { profession: null },
            { profession: { not: selectedProfession } },
          ],
        },
        select: { jid: true },
        take: 20,
      });

      potentialVictims = dbVictims.map((u) => u.jid);
    }

    if (potentialVictims.length === 0) return false;

    const victimJid = potentialVictims[Math.floor(Math.random() * potentialVictims.length)];
    const victimName = formatUserName(victimJid);

    const situation =
      template.situations[Math.floor(Math.random() * template.situations.length)];
    const formattedSituation = situation.replace("{victim}", victimName);

    const baseRewardHelper = 4000;
    const rewardBuffTurns = 2; // +15% de cobro por 2 turnos de changa
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos para responder

    const emergency: ActiveEmergency = {
      id: `em_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      remoteJid,
      victimJid,
      requiredProfession: selectedProfession,
      professionTitle: template.professionTitle,
      text: formattedSituation,
      rewardHelper: baseRewardHelper,
      rewardBuffTurns,
      createdAt: Date.now(),
      expiresAt,
    };

    activeEmergencies.set(remoteJid, emergency);

    const announcement =
      `🚨 *¡URGENCIA COMUNITARIA EN EL BARRIO!* 🚨\n\n` +
      `${formattedSituation}\n\n` +
      `🆘 *Se busca urgente:* Un/a *${template.professionTitle}* ${template.emoji}\n` +
      `💵 *Honorarios de rescate:* +*$${baseRewardHelper.toLocaleString("es-AR")} fichas base* en mano (+ tus buffs de herramientas, reliquias y comida).\n` +
      `💪 *Beneficio para la víctima:* +15% de cobro en sus próximos ${rewardBuffTurns} laburos.\n\n` +
      `👉 _Si sos *${template.professionTitle}*, escribí *!asistir* (o !auxilio, !curar, !reparar) para intervenir ya._\n` +
      `⏳ _Tenés 5 minutos antes de que la situación pase a mayores._`;

    try {
      const cardBuffer = await generateEmergencyAlertCard({
        professionTitle: template.professionTitle,
        emoji: template.emoji,
        situation: formattedSituation,
        rewardFichas: baseRewardHelper,
      });

      await sock.sendMessage(remoteJid, {
        image: cardBuffer,
        caption: announcement,
      });
    } catch (cardErr) {
      console.error("[Community Alert Card Error]:", cardErr);
      await sock.sendMessage(remoteJid, {
        text: announcement,
      });
    }

    return true;
  } catch (err) {
    console.error("[triggerSmartEmergency Error]:", err);
    return false;
  }
}

/**
 * Resuelve la urgencia comunitaria activa cuando un profesional compatible usa !asistir.
 */
export async function assistCommunityEmergency(
  remoteJid: string,
  helperJid: string
): Promise<{
  success: boolean;
  error?: string;
  helperJid?: string;
  victimJid?: string;
  professionTitle?: string;
  rewardHelper?: number;
  baseReward?: number;
  toolBonusPercent?: number;
  hadFoodBuff?: boolean;
  rewardBuffTurns?: number;
  newHelperBalance?: number;
}> {
  return await withKeyLock(`emergency:${remoteJid}`, async () => {
    const freezeCheck = isUserEconomyFrozen(helperJid);
    if (freezeCheck.frozen) {
      const mins = Math.ceil((freezeCheck.remainingSeconds || 60) / 60);
      return {
        success: false,
        error: `🧊 *¡ECONOMÍA CONGELADA!* No podés asistir emergencias porque tu cuenta está suspendida por la patronal (*${mins}m* restantes).`,
      };
    }

    const emergency = getActiveEmergency(remoteJid);
    if (!emergency) {
      return {
        success: false,
        error: "💨 No hay ninguna urgencia comunitaria activa en este barrio (o ya expiró y se arreglaron como pudieron).",
      };
    }

    // La víctima no puede asistirse a sí misma
    if (helperJid === emergency.victimJid) {
      return {
        success: false,
        error: "🤦‍♂️ ¡No te podés auto-asistir! Necesitás que un vecino con el oficio adecuado venga a salvarte las papas.",
      };
    }

    // Verificar la profesión del asistente
    const helperUser = await resolveOrRegisterUser(helperJid);
    const helperProfession = await getUserProfession(helperUser.id);

    if (helperProfession !== emergency.requiredProfession) {
      const helperProfMeta = helperProfession ? PROFESSIONS[helperProfession] : null;
      const currentName = helperProfMeta ? helperProfMeta.name : "Desempleado";
      return {
        success: false,
        error:
          `❌ Esta urgencia requiere un/a *${emergency.professionTitle}* capacitado/a.\n` +
          `Tu oficio actual es *${currentName}* y no tenés las herramientas ni el conocimiento para resolver este problema.`,
      };
    }

    // Resolver la urgencia y limpiar el slot
    activeEmergencies.delete(remoteJid);

    // Computar buffs del profesional (herramientas, sede, reliquias, educación)
    const buffs = await getUserProfessionBuffs(helperJid, emergency.requiredProfession);
    let toolMultiplier = 1.0;
    if (buffs.earningsBonusPercent > 0) {
      toolMultiplier += buffs.earningsBonusPercent / 100;
    }

    // Buff de comida activa (+25%)
    const curBuffTurns = typeof (helperUser as any).jobBuffTurns === "number" ? (helperUser as any).jobBuffTurns : 0;
    let foodMultiplier = 1.0;
    const hadFoodBuff = curBuffTurns > 0;
    if (hadFoodBuff) {
      foodMultiplier = 1.25;
    }

    const baseReward = emergency.rewardHelper || 4000;
    const finalReward = Math.max(baseReward, Math.round(baseReward * toolMultiplier * foodMultiplier));

    // 1. Pagar recompensa potenciada al profesional
    const modRes = await modifyBalance(helperJid, finalReward);

    // Descontar turno de comida si lo usó
    if (hadFoodBuff) {
      await prisma.userProfile.update({
        where: { id: helperUser.id },
        data: { jobBuffTurns: { decrement: 1 } },
      });
    }

    // 2. Otorgar buff de laburo a la víctima (+2 turnos)
    await prisma.userProfile.update({
      where: { jid: emergency.victimJid },
      data: {
        jobBuffTurns: { increment: emergency.rewardBuffTurns },
      },
    });

    return {
      success: true,
      helperJid,
      victimJid: emergency.victimJid,
      professionTitle: emergency.professionTitle,
      rewardHelper: finalReward,
      baseReward,
      toolBonusPercent: buffs.earningsBonusPercent > 0 ? buffs.earningsBonusPercent : undefined,
      hadFoodBuff,
      rewardBuffTurns: emergency.rewardBuffTurns,
      newHelperBalance: modRes.newBalance,
    };
  });
}
