import * as Astro from "astronomy-engine";
import { generateWithGemini } from "./ai.service.js";

export interface ZodiacSignInfo {
  name: string;
  symbol: string;
  element: "Fuego" | "Tierra" | "Aire" | "Agua";
  modality: "Cardinal" | "Fijo" | "Mutable";
  ruler: string;
}

export const ZODIAC_SIGNS: ZodiacSignInfo[] = [
  { name: "Aries", symbol: "♈", element: "Fuego", modality: "Cardinal", ruler: "Marte" },
  { name: "Tauro", symbol: "♉", element: "Tierra", modality: "Fijo", ruler: "Venus" },
  { name: "Géminis", symbol: "♊", element: "Aire", modality: "Mutable", ruler: "Mercurio" },
  { name: "Cáncer", symbol: "♋", element: "Agua", modality: "Cardinal", ruler: "Luna" },
  { name: "Leo", symbol: "♌", element: "Fuego", modality: "Fijo", ruler: "Sol" },
  { name: "Virgo", symbol: "♍", element: "Tierra", modality: "Mutable", ruler: "Mercurio" },
  { name: "Libra", symbol: "♎", element: "Aire", modality: "Cardinal", ruler: "Venus" },
  { name: "Escorpio", symbol: "♏", element: "Agua", modality: "Fijo", ruler: "Plutón / Marte" },
  { name: "Sagitario", symbol: "♐", element: "Fuego", modality: "Mutable", ruler: "Júpiter" },
  { name: "Capricornio", symbol: "♑", element: "Tierra", modality: "Cardinal", ruler: "Saturno" },
  { name: "Acuario", symbol: "♒", element: "Aire", modality: "Fijo", ruler: "Urano / Saturno" },
  { name: "Piscis", symbol: "♓", element: "Agua", modality: "Mutable", ruler: "Neptuno / Júpiter" },
];

const SIGN_ALIASES: Record<string, string> = {
  aries: "Aries",
  tauro: "Tauro",
  tauros: "Tauro",
  geminis: "Géminis",
  gemini: "Géminis",
  cancer: "Cáncer",
  leo: "Leo",
  leon: "Leo",
  virgo: "Virgo",
  libra: "Libra",
  escorpio: "Escorpio",
  escorpion: "Escorpio",
  scorpio: "Escorpio",
  sagitario: "Sagitario",
  sagittarius: "Sagitario",
  capricornio: "Capricornio",
  capri: "Capricornio",
  capricorn: "Capricornio",
  acuario: "Acuario",
  aquarius: "Acuario",
  piscis: "Piscis",
  pisces: "Piscis",
};

export function normalizeSignName(raw: string): string | null {
  const clean = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SIGN_ALIASES[clean] || null;
}

export function getSignFromDate(day: number, month: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Aries";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Tauro";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Géminis";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Cáncer";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Leo";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Virgo";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Libra";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Escorpio";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Sagitario";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Capricornio";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Acuario";
  return "Piscis";
}

export function parseDateString(str: string): { day: number; month: number; year: number } | null {
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = match[3] ? parseInt(match[3], 10) : 2000;
  const fullYear = year < 100 ? (year > 30 ? 1900 + year : 2000 + year) : year;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year: fullYear };
}

export function longitudeToSign(deg: number): { name: string; symbol: string; degree: number; element: string } {
  const norm = ((deg % 360) + 360) % 360;
  const index = Math.floor(norm / 30);
  const degree = Math.floor(norm % 30);
  const s = ZODIAC_SIGNS[index] || ZODIAC_SIGNS[0];
  return {
    name: s.name,
    symbol: s.symbol,
    degree,
    element: s.element,
  };
}

// Coordenadas de referencia para ciudades habituales (por defecto Buenos Aires)
const KNOWN_CITIES: Record<string, { lat: number; lon: number; name: string }> = {
  "buenos aires": { lat: -34.6037, lon: -58.3816, name: "Buenos Aires, Argentina" },
  "caba": { lat: -34.6037, lon: -58.3816, name: "CABA, Argentina" },
  "cordoba": { lat: -31.4201, lon: -64.1888, name: "Córdoba, Argentina" },
  "córdoba": { lat: -31.4201, lon: -64.1888, name: "Córdoba, Argentina" },
  "rosario": { lat: -32.9468, lon: -60.6393, name: "Rosario, Argentina" },
  "mendoza": { lat: -32.8895, lon: -68.8458, name: "Mendoza, Argentina" },
  "la plata": { lat: -34.9215, lon: -57.9545, name: "La Plata, Argentina" },
  "tucuman": { lat: -26.8083, lon: -65.2176, name: "Tucumán, Argentina" },
  "mar del plata": { lat: -38.0055, lon: -57.5562, name: "Mar del Plata, Argentina" },
  "salta": { lat: -24.7821, lon: -65.4232, name: "Salta, Argentina" },
  "asuncion": { lat: -25.2637, lon: -57.5759, name: "Asunción, Paraguay" },
  "asunción": { lat: -25.2637, lon: -57.5759, name: "Asunción, Paraguay" },
  "montevideo": { lat: -34.9011, lon: -56.1645, name: "Montevideo, Uruguay" },
  "santiago": { lat: -33.4489, lon: -70.6693, name: "Santiago, Chile" },
};

export interface AstrologicalPosition {
  name: string;
  symbol: string;
  degree: number;
  element: string;
}

export interface NatalChartData {
  sun: AstrologicalPosition;
  moon: AstrologicalPosition;
  ascendant?: AstrologicalPosition;
  mercury: AstrologicalPosition;
  venus: AstrologicalPosition;
  mars: AstrologicalPosition;
  elements: { fuego: number; tierra: number; aire: number; agua: number };
  cityName: string;
  hasExactTime: boolean;
}

export function calculateNatalChart(
  year: number,
  month: number,
  day: number,
  hourStr?: string,
  cityInput?: string
): NatalChartData {
  let hour = 12;
  let minute = 0;
  let hasExactTime = false;

  if (hourStr) {
    const timeMatch = hourStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      hasExactTime = true;
    }
  }

  const cleanCity = cityInput?.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const cityData = KNOWN_CITIES[cleanCity] || KNOWN_CITIES["buenos aires"];

  // Argentina/Paraguay/Uruguay estándar UTC-3
  // Convertir hora local a UTC para el cómputo astronómico
  const localUtcHour = (hour + 3) % 24;
  const dayOffset = hour + 3 >= 24 ? 1 : 0;

  const dateUtc = new Date(Date.UTC(year, month - 1, day + dayOffset, localUtcHour, minute, 0));
  const astroTime = new Astro.AstroTime(dateUtc);

  // 1. Sol
  const sunVec = Astro.GeoVector(Astro.Body.Sun, astroTime, true);
  const sunEcl = Astro.Ecliptic(sunVec);
  const sun = longitudeToSign(sunEcl.elon);

  // 2. Luna
  const moonVec = Astro.GeoVector(Astro.Body.Moon, astroTime, true);
  const moonEcl = Astro.Ecliptic(moonVec);
  const moon = longitudeToSign(moonEcl.elon);

  // 3. Mercurio, Venus, Marte
  const mercVec = Astro.GeoVector(Astro.Body.Mercury, astroTime, true);
  const merc = longitudeToSign(Astro.Ecliptic(mercVec).elon);

  const venVec = Astro.GeoVector(Astro.Body.Venus, astroTime, true);
  const ven = longitudeToSign(Astro.Ecliptic(venVec).elon);

  const marsVec = Astro.GeoVector(Astro.Body.Mars, astroTime, true);
  const mars = longitudeToSign(Astro.Ecliptic(marsVec).elon);

  // 4. Ascendente (si se brindó hora)
  let ascendant: AstrologicalPosition | undefined;
  if (hasExactTime) {
    const gast = Astro.SiderealTime(astroTime);
    const lstDeg = ((gast * 15 + cityData.lon) % 360 + 360) % 360;
    const lstRad = (lstDeg * Math.PI) / 180;
    const obl = (Astro.e_tilt(astroTime).tobl * Math.PI) / 180;
    const latRad = (cityData.lat * Math.PI) / 180;
    const y = Math.cos(lstRad);
    const x = -Math.sin(lstRad) * Math.cos(obl) - Math.tan(latRad) * Math.sin(obl);
    const ascRad = Math.atan2(y, x);
    const ascDeg = ((ascRad * 180) / Math.PI + 360) % 360;
    ascendant = longitudeToSign(ascDeg);
  }

  // Recuento de elementos
  const planets = [sun, moon, merc, ven, mars];
  if (ascendant) planets.push(ascendant as any);

  const elements = { fuego: 0, tierra: 0, aire: 0, agua: 0 };
  for (const p of planets) {
    const el = p.element?.toLowerCase();
    if (el === "fuego") elements.fuego++;
    else if (el === "tierra") elements.tierra++;
    else if (el === "aire") elements.aire++;
    else if (el === "agua") elements.agua++;
  }

  return {
    sun,
    moon,
    ascendant,
    mercury: merc,
    venus: ven,
    mars,
    elements,
    cityName: cityData.name,
    hasExactTime,
  };
}

// -----------------------------------------------------------------------------
// Baraja del Tarot (22 Arcanos Mayores)
// -----------------------------------------------------------------------------
export interface TarotCard {
  name: string;
  numeral: string;
  icon: string;
  keywords: string;
}

export const TAROT_DECK: TarotCard[] = [
  { numeral: "0", name: "El Loco", icon: "🃏", keywords: "Nuevos comienzos, espontaneidad, troleo puro, saltar al vacío" },
  { numeral: "I", name: "El Mago", icon: "🪄", keywords: "Habilidad, recursos, iniciativa, chamuyo convincente" },
  { numeral: "II", name: "La Sacerdotisa", icon: "🔮", keywords: "Intuición, misterio, saber callar, secretos del chat" },
  { numeral: "III", name: "La Emperatriz", icon: "👑", keywords: "Abundancia, creatividad, fertilidad, mimitos" },
  { numeral: "IV", name: "El Emperador", icon: "🏛️", keywords: "Estructura, autoridad, orden, mano dura de admin" },
  { numeral: "V", name: "El Sumo Sacerdote", icon: "📜", keywords: "Tradición, consejo sabio, moralina, códigos de potrero" },
  { numeral: "VI", name: "Los Enamorados", icon: "❤️", keywords: "Dilemas, elecciones del corazón, dúo bot, tentación" },
  { numeral: "VII", name: "El Carro", icon: "🏎️", keywords: "Victoria, determinación, avance a fondo, carril libre" },
  { numeral: "VIII", name: "La Justicia", icon: "⚖️", keywords: "Karma, verdad, fallos que duelen, rendición de cuentas" },
  { numeral: "IX", name: "El Ermitaño", icon: "🕯️", keywords: "Introspección, soledad, modo afk, búsqueda de paz" },
  { numeral: "X", name: "La Rueda de la Fortuna", icon: "🎡", keywords: "Ciclos, giros del destino, suerte loca en ruleta" },
  { numeral: "XI", name: "La Fuerza", icon: "🦁", keywords: "Paciencia, coraje, domar a las fieras, aguantar los trapos" },
  { numeral: "XII", name: "El Colgado", icon: "🙃", keywords: "Pausa obligada, ver las cosas al revés, sacrificio" },
  { numeral: "XIII", name: "La Muerte", icon: "💀", keywords: "Transformación radical, fin de un ciclo, respawn" },
  { numeral: "XIV", name: "La Templanza", icon: "🏺", keywords: "Equilibrio, moderación, no tilt, mezclar birra con soda" },
  { numeral: "XV", name: "El Diablo", icon: "😈", keywords: "Tentación, toxicidad, bardo asegurado, vicios nocturnos" },
  { numeral: "XVI", name: "La Torre", icon: "⚡", keywords: "Derrumbe repentino, pantalla rota, bardo inesperado" },
  { numeral: "XVII", name: "La Estrella", icon: "⭐", keywords: "Esperanza, inspiración, luz al final del túnel" },
  { numeral: "XVIII", name: "La Luna", icon: "🌙", keywords: "Ilusiones, fantasmas mentales, paranoia, sobrepensar" },
  { numeral: "XIX", name: "El Sol", icon: "☀️", keywords: "Éxito pleno, alegría, claridad, carry legendario" },
  { numeral: "XX", name: "El Juicio", icon: "🎺", keywords: "Despertar, llamado final, renacimiento, sin apelación" },
  { numeral: "XXI", name: "El Mundo", icon: "🌍", keywords: "Completitud, viaje cumplido, victoria total en la partida" },
];

export function drawTarotCards(count = 3): { card: TarotCard; isReversed: boolean }[] {
  const shuffled = [...TAROT_DECK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((card) => ({
    card,
    isReversed: Math.random() < 0.35, // 35% de probabilidad invertida
  }));
}

// -----------------------------------------------------------------------------
// Generadores con Gemini (Voz y Personalidad de Empy)
// -----------------------------------------------------------------------------

export async function getDailyHoroscope(signName: string, userName?: string): Promise<string> {
  const sign = ZODIAC_SIGNS.find((s) => s.name.toLowerCase() === signName.toLowerCase()) || ZODIAC_SIGNS[0];
  const targetUser = userName ? ` para @${userName}` : "";

  const prompt = `Sos Empy, el bot de WhatsApp del grupo Empyreal (Argentina).
Armá el horóscopo del día para el signo *${sign.name}* (${sign.symbol} - Elemento ${sign.element}, regido por ${sign.ruler})${targetUser}.

TONO Y ESTILO OBLIGATORIO:
- Pibe de 20-25 años, porteño, picante, compinche, con humor argentino y psicología astrológica real del signo (sus mañas, defectos, virtudes y costumbres cotidianas).
- Cero formalismos aburridos ni frases new-age acartonadas.
- NO hagas foco en videojuegos (prohibido forzar menciones a LoL, MLBB, rankeds o tilteo de juegos). Enfocate en la vida real, el chat, la calle, la guita y las relaciones.
- Máximo 90-130 palabras en total. Que entre en una pantalla de celular sin scrollear.
- Negrita con un solo asterisco (*texto*).

ESTRUCTURA OBLIGATORIA:
✨ *HORÓSCOPO DE EMPY | ${sign.symbol} ${sign.name.toUpperCase()}*

💘 *Amor & Chamuyo:* [1 oración sobre levante, histeriqueo o si te van a clavar visto]
💸 *Billetera & La Pala:* [1 oración sobre plata, gastos compulsivos o cómo sobrevivir al día]
⚡ *Ánimo & Mecha:* [1 oración sobre paciencia, humor o energía mental hoy]
🚨 *Alerta del Día:* [Consejo o advertencia picante de potrero sin filtro]
🍀 *Cábala:* [Número de 1 o 2 cifras con remate en joda]`.trim();

  const res = await generateWithGemini(prompt, 380, 0.7, "astrology");
  return res || `✨ *HORÓSCOPO: ${sign.symbol} ${sign.name}*\nHoy los astros andan medio desconectados che. Cuidá la billetera y no te regales en el amor.`;
}

export async function getNatalChartReading(chart: NatalChartData, userName: string): Promise<string> {
  const ascText = chart.ascendant
    ? `Ascendente en ${chart.ascendant.name} (${chart.ascendant.symbol} a ${chart.ascendant.degree}°)`
    : `Ascendente no calculado (no se especificó hora exacta de nacimiento)`;

  const summary = `
Datos Astrales Reales Calculados:
- Sol: ${chart.sun.name} (${chart.sun.symbol} a ${chart.sun.degree}°) - Elemento ${chart.sun.element}
- Luna: ${chart.moon.name} (${chart.moon.symbol} a ${chart.moon.degree}°)
- Ascendente: ${ascText}
- Mercurio (comunicación/forma de hablar): ${chart.mercury.name} (${chart.mercury.symbol})
- Venus (amor/gustos): ${chart.venus.name} (${chart.venus.symbol})
- Marte (impulso/carácter/furia): ${chart.mars.name} (${chart.mars.symbol})
- Balance de elementos: Fuego ${chart.elements.fuego}, Tierra ${chart.elements.tierra}, Aire ${chart.elements.aire}, Agua ${chart.elements.agua}
- Ubicación: ${chart.cityName}
`.trim();

  const prompt = `Sos Empy, el bot de WhatsApp del grupo Empyreal (Argentina).
Analizá la Carta Astral de @${userName} a partir de las siguientes posiciones astronómicas reales y redactá una lectura personalizada, picante y divertida:

${summary}

REGLAS DE FORMATO Y ESTILO:
- Tono pibe argentino, porteño, irónico y cariñoso de grupo de amigos.
- Mencioná qué significa su Sol, Luna y Ascendente (si está disponible), sumando cómo discute en WhatsApp (Mercurio) y cómo es su carácter cuando se le salta la térmica (Marte).
- Cero tecnicismos densos, explicalo con fakta, remates y metáforas graciosas de la vida cotidiana (sin forzar videojuegos).
- Longitud: 120 a 180 palabras totales. Formato WhatsApp (*un solo asterisco*).

ESTRUCTURA SUGERIDA:
🌌 *CARTA ASTRAL DE @${userName}* 🌌
📍 _Ubicación de referencia: ${chart.cityName}_

☀️ *Sol en ${chart.sun.name}:* [Tu ego y esencia en 1 oración]
🌙 *Luna en ${chart.moon.name}:* [Tu drama emocional interno]
${chart.ascendant ? `🌅 *Ascendente en ${chart.ascendant.name}:* [La careta que mostrás antes de entrar en confianza]\n` : ""}🗣️ *Mercurio en ${chart.mercury.name}:* [Cómo te expresás y discutís en el grupo]
⚔️ *Marte en ${chart.mars.name}:* [Nivel de mecha corta y carácter]

⚖️ *Veredicto Cósmico de Empy:* [Remate de 2 oraciones sentenciando qué clase de espécimen astral es]`.trim();

  const res = await generateWithGemini(prompt, 550, 0.7, "astrology");
  return res || `🌌 *CARTA ASTRAL DE @${userName}*\nSol en ${chart.sun.name} ${chart.sun.symbol}, Luna en ${chart.moon.name} ${chart.moon.symbol}.\nTenés alta mezcla cósmica hermano, puro peligro para el grupo.`;
}

export async function getSynastryReading(
  nameA: string,
  signA: string,
  nameB: string,
  signB: string
): Promise<string> {
  const sA = ZODIAC_SIGNS.find((s) => s.name.toLowerCase() === signA.toLowerCase()) || { name: signA, symbol: "⭐", element: "Fuego" };
  const sB = ZODIAC_SIGNS.find((s) => s.name.toLowerCase() === signB.toLowerCase()) || { name: signB, symbol: "⭐", element: "Agua" };

  const prompt = `Sos Empy, el bot del grupo Empyreal (Argentina).
Hacé una sinastría y compatibilidad astral entre @${nameA} (${sA.name} ${sA.symbol} - Elemento ${sA.element}) y @${nameB} (${sB.name} ${sB.symbol} - Elemento ${sB.element}).

ESTILO:
- Pibe argentino de grupo, picante, humor de grupo de amigos, salidas, asados y convivencia diaria.
- NADA de videojuegos forzados (prohibido hablar de LoL, MLBB, support/adc).
- Decí la posta de si se llevan bien, si se van a agarrar de los pelos o si son almas gemelas para la joda o el drama.
- Máximo 100-140 palabras. Formato WhatsApp.

ESTRUCTURA OBLIGATORIA:
💫 *SINASTRÍA: @${nameA} (${sA.symbol}) ⚡ @${nameB} (${sB.symbol})*

🔥 *Química & Convivencia:* [Cómo fluyen juntos en el grupo o en persona]
💣 *Zona de Bardo:* [Por qué cosas se van a putear o dónde chocan sus personalidades]
🤝 *En la Vida Real:* [Cómo funcionan como compinches de salidas, confidencias o joda]
📊 *Compatibilidad Cósmica:* [Porcentaje del 1% al 100% + Veredicto final contundente en 1 frase]`.trim();

  const res = await generateWithGemini(prompt, 380, 0.7, "astrology");
  return res || `💫 *SINASTRÍA: ${sA.name} y ${sB.name}*\nCompatibilidad: 50% - Si no se matan discutiendo, zafan como compinches.`;
}

export async function getTarotReading(question: string | undefined, userName: string): Promise<string> {
  const cards = drawTarotCards(3);
  const cardDescriptions = cards
    .map(
      (c, i) =>
        `${i + 1}. ${c.card.icon} *${c.card.name}* (${c.card.numeral}) [${c.isReversed ? "INVERTIDA / AL REVÉS" : "AL DERECHO"}] - Claves: ${c.card.keywords}`
    )
    .join("\n");

  const questionPrompt = question ? `Consulta del usuario: "${question}"` : `Consulta general sobre el presente y futuro inmediato`;

  const prompt = `Sos Empy, el bot del grupo Empyreal (Argentina).
Acabás de tirar las cartas del Tarot para @${userName}.
${questionPrompt}

Cartas que salieron:
${cardDescriptions}

Posición 1: Pasado / De dónde viene la energía.
Posición 2: Presente / La situación actual en carne viva.
Posición 3: Futuro / Desenlace inmediato o consecuencias.

INSTRUCCIONES CLAVE:
- Tono pibe de confianza, mitad místico, mitad compinche sin filtro.
- Explicá brevemente qué significa cada carta en relación directa a la consulta, prestando mucha atención a si salió al derecho o invertida.
- JUGÁTELA CON UNA RESPUESTA DIRECTA: Si el usuario hizo una pregunta concreta (de decisión, futuro, sí/no, vínculos, estudio, trabajo o dudas personales), ESTÁ TOTALMENTE PROHIBIDO SER TIBIO, EVASIVO O VAGO. Mirá el balance de las cartas (si predominan arcanos luminosos y al derecho como El Sol, El Mundo o La Estrella es un SÍ o pronóstico favorable; si predominan cartas densas o invertidas como La Torre, El Diablo, La Luna o arcanos invertidos es un NO o advertencia tajante).
- En la sección "El Veredicto de Empy" sentenciá una respuesta clara, jugada y directa a su pregunta.
- Máximo 120-170 palabras. Formato WhatsApp (*un solo asterisco*).

ESTRUCTURA OBLIGATORIA:
🃏 *TIRADA DE TAROT PARA @${userName}*
🔮 _Consulta: ${question ? `"${question}"` : "Destino inmediato"}_

1️⃣ ${cards[0].card.icon} *${cards[0].card.name}* (${cards[0].isReversed ? "Invertida" : "Derecho"}): [Lectura de 1 oración conectada a la pregunta]
2️⃣ ${cards[1].card.icon} *${cards[1].card.name}* (${cards[1].isReversed ? "Invertida" : "Derecho"}): [Lectura de 1 oración conectada a la pregunta]
3️⃣ ${cards[2].card.icon} *${cards[2].card.name}* (${cards[2].isReversed ? "Invertida" : "Derecho"}): [Lectura de 1 oración conectada a la pregunta]

🎯 *El Veredicto de Empy:* [Respuesta jugada, contundente y directa a la pregunta planteada: qué dicen las cartas sin rodeos ni tibiezas]
💡 *Consejo de Potrero:* [Remate final en una frase]`.trim();

  const res = await generateWithGemini(prompt, 500, 0.7, "astrology");
  return res || `🃏 *TAROT*\n${cardDescriptions}\n\nLos arcanos dicen que dejes de dar vueltas y encares las cosas de frente.`;
}
