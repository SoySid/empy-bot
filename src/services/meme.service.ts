import sharp from "sharp";
import fs from "fs";
import path from "path";

const MIERDA_TEMPLATE_PATH = path.resolve(process.cwd(), "src", "assets", "memes", "milei-mierda.jpg");
const CLAVE_TEMPLATE_PATH = path.resolve(process.cwd(), "src", "assets", "memes", "milei-clave.jpg");

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function wrapText(text: string, maxCharsPerLine = 22): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Determina si un sujeto o frase en castellano tiene concordancia plural ("SON" vs "ES").
 */
export function isPluralSubject(clean: string): boolean {
  const trimmed = clean.trim();
  if (!trimmed) return false;

  // 1. Artículos o pronombres plurales al inicio
  if (/^(las|los|unos|unas|esos|esas|estos|estas|aquellos|aquellas|mis|tus|sus|nuestros|nuestras)\b/i.test(trimmed)) {
    return true;
  }

  // 2. Cuantificadores plurales o números cardinales > 1 al inicio
  if (/^(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|varios|varias|muchos|muchas|pocos|pocas|algunos|algunas|tantos|tantas)\b/i.test(trimmed)) {
    return true;
  }

  // 3. Conjunciones copulativas ("X y Y", "X e Y")
  if (/\s+(y|e)\s+/i.test(trimmed)) {
    return true;
  }

  // 4. Verbos plurales explícitos
  if (/\b(son|estan|están|fueron|eran|parecen)\b/i.test(trimmed)) {
    return true;
  }

  // 5. Excepciones de sustantivos singulares comunes que terminan en 's'
  const singularExceptions = new Set([
    "lunes", "martes", "miercoles", "miércoles", "jueves", "viernes", "cumpleaños",
    "paraguas", "sacacorchos", "lavavajillas", "rompecabezas", "abrelatas", "limpiaparabrisas",
    "crisis", "tesis", "analisis", "análisis", "hipotesis", "hipótesis", "dosis", "sintesis", "síntesis",
    "pais", "país", "paris", "parís", "jesus", "jesús", "marcos", "carlos", "lucas", "matias", "matías",
    "tomas", "tomás", "nicolas", "nicolás", "corrientes", "texas", "arkansas", "kansas",
    "gas", "mes", "tos", "pus", "plus", "autobus", "autobús", "compas", "compás", "virus", "estatus", "campus", "atlas", "caos"
  ]);

  const words = trimmed.split(/\s+/).filter(Boolean);
  const firstWord = words[0].toLowerCase().replace(/[.,;:!?]+$/, "");
  const lastWord = words[words.length - 1].toLowerCase().replace(/[.,;:!?]+$/, "");

  // Si inicia con artículo/determinante singular explícito ("el", "la", "un", "una", etc.), es singular
  if (/^(el|la|un|una|este|esta|ese|esa|aquel|aquella|mi|tu|su)\b/i.test(trimmed)) {
    return false;
  }

  // Si la primera o única palabra no es excepción y termina en 's' (longitud > 3)
  if (!singularExceptions.has(firstWord) && firstWord.endsWith("s") && firstWord.length > 3) {
    return true;
  }

  // Si la última palabra termina en 's' y no es excepción singular
  if (!singularExceptions.has(lastWord) && lastWord.endsWith("s") && lastWord.length > 3) {
    return true;
  }

  return false;
}

/**
 * Normaliza y formatea el sujeto para el meme de Milei: "X ES UNA MIERDA" o "X SON UNA MIERDA".
 */
export function formatMileiMierdaPhrase(rawInput: string): string {
  let clean = rawInput.trim();

  // Limpiar signos de admiración o interrogación
  clean = clean.replace(/^[¡!¿?]+|[¡!¿?]+$/g, "").trim();

  // Si ya termina con variantes de "es una mierda" / "son una mierda", removerlas para evitar duplicados
  clean = clean.replace(/\b(es|son)\s+(una\s+)?(mierda|reverenda\s+mierda|bosta)\b/gi, "").trim();

  // Remover palabras de relleno al inicio si viene de una cita
  clean = clean.replace(/^(che|amigo|para\s+mi\s+que|la\s+verdad\s+que|odio\s+que|odio\s+a)\s+/gi, "").trim();

  if (!clean) {
    clean = "TODO";
  }

  const isPlural = isPluralSubject(clean);
  const verb = isPlural ? "SON" : "ES";

  return `${clean.toUpperCase()} ${verb} UNA MIERDA`;
}

/**
 * Normaliza y formatea el sujeto para el meme de Milei: "X ES CLAVE" o "X SON CLAVE".
 */
export function formatMileiClavePhrase(rawInput: string): string {
  let clean = rawInput.trim();

  // Limpiar signos de admiración o interrogación
  clean = clean.replace(/^[¡!¿?]+|[¡!¿?]+$/g, "").trim();

  // Si ya termina con variantes de "es clave" / "son clave", removerlas para evitar duplicados
  clean = clean.replace(/\b(es|son)\s+clave\b/gi, "").trim();

  // Remover palabras de relleno al inicio si viene de una cita
  clean = clean.replace(/^(che|amigo|para\s+mi\s+que|la\s+verdad\s+que|banco\s+que|banco\s+a)\s+/gi, "").trim();

  if (!clean) {
    clean = "ESTO";
  }

  const isPlural = isPluralSubject(clean);
  const verb = isPlural ? "SON" : "ES";

  return `${clean.toUpperCase()} ${verb} CLAVE`;
}

async function renderMemeOverlay(templatePath: string, phrase: string): Promise<Buffer> {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Plantilla no encontrada en: ${templatePath}`);
  }

  const metadata = await sharp(templatePath).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 576;

  // Ajuste tipográfico dinámico según longitud de la frase
  const maxChars = phrase.length > 34 ? 26 : 22;
  const lines = wrapText(phrase, maxChars).slice(0, 3);

  const baseFontSize = Math.floor(width * 0.058);
  const fontSize = lines.length > 2 ? Math.floor(baseFontSize * 0.82) : baseFontSize;
  const lineHeight = Math.floor(fontSize * 1.18);
  const strokeWidth = Math.max(5, Math.floor(fontSize * 0.12));

  // Ubicar el texto en la parte inferior
  const bottomMargin = Math.floor(height * 0.08);
  const totalTextHeight = lines.length * lineHeight;
  const startY = height - bottomMargin - totalTextHeight + fontSize;

  const linesSvg = lines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      return `<text x="${width / 2}" y="${y}" fill="#FFE600" font-family="Impact, 'Arial Black', sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="middle" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svgOverlay = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${linesSvg}
  </svg>
  `;

  return await sharp(templatePath)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Genera el meme de Milei furioso ("X ES UNA MIERDA").
 */
export async function generateMileiMierdaMeme(subjectInput: string): Promise<Buffer> {
  const phrase = formatMileiMierdaPhrase(subjectInput);
  return await renderMemeOverlay(MIERDA_TEMPLATE_PATH, phrase);
}

/**
 * Genera el meme de Milei cósmico/pensativo ("X ES CLAVE").
 */
export async function generateMileiClaveMeme(subjectInput: string): Promise<Buffer> {
  const phrase = formatMileiClavePhrase(subjectInput);
  return await renderMemeOverlay(CLAVE_TEMPLATE_PATH, phrase);
}
