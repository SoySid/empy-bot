import sharp from "sharp";
import { FishDefinition } from "../../config/fish.config.js";

function escapeXml(unsafe: string): string {
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

function wrapText(text: string, maxCharsPerLine: number): string[] {
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

export interface FishCardOptions {
  fish: FishDefinition;
  weightKg?: number;
  price?: number;
  equippedRodName?: string;
  isNewSpecies?: boolean;
  isNewRecord?: boolean;
}

export async function generateFishCard(options: FishCardOptions): Promise<Buffer> {
  const { fish, isNewSpecies, isNewRecord } = options;
  const weightKg = options.weightKg ?? 1.0;
  const price = options.price ?? fish.basePrice;
  const equippedRodName = options.equippedRodName || "Caña Básica";

  // Paleta de colores e identidad según la rareza (Tier 1 a 5)
  let borderColor = "#78909C";
  let borderGradientStart = "#90A4AE";
  let borderGradientEnd = "#546E7A";
  let tierLabel = "COMÚN ⭐";
  let tierBadgeColor = "#455A64";
  let bgGradientStart = "#102027";
  let bgGradientEnd = "#000a12";
  let glowColor = "#37474F";

  if (fish.tier === 6) {
    borderColor = "#00E5FF";
    borderGradientStart = "#00FFFF";
    borderGradientEnd = "#0052D4";
    tierLabel = "ABISAL 🌌⭐⭐⭐⭐⭐⭐";
    tierBadgeColor = "#005577";
    bgGradientStart = "#001020";
    bgGradientEnd = "#00050a";
    glowColor = "#00E5FF";
  } else if (fish.tier === 5) {
    borderColor = "#FF1493";
    borderGradientStart = "#FF007F";
    borderGradientEnd = "#7928CA";
    tierLabel = "MÍTICO ⭐⭐⭐⭐⭐";
    tierBadgeColor = "#D81B60";
    bgGradientStart = "#20002c";
    bgGradientEnd = "#07000d";
    glowColor = "#FF0080";
  } else if (fish.tier === 4) {
    borderColor = "#FFD700";
    borderGradientStart = "#FFE066";
    borderGradientEnd = "#FF9900";
    tierLabel = "LEGENDARIO ⭐⭐⭐⭐";
    tierBadgeColor = "#B78103";
    bgGradientStart = "#2c1c00";
    bgGradientEnd = "#0c0800";
    glowColor = "#FFB300";
  } else if (fish.tier === 3) {
    borderColor = "#BA68C8";
    borderGradientStart = "#CE93D8";
    borderGradientEnd = "#6A1B9A";
    tierLabel = "ÉPICO ⭐⭐⭐";
    tierBadgeColor = "#8E24AA";
    bgGradientStart = "#1a0826";
    bgGradientEnd = "#090110";
    glowColor = "#9C27B0";
  } else if (fish.tier === 2) {
    borderColor = "#4FC3F7";
    borderGradientStart = "#81D4FA";
    borderGradientEnd = "#0277BD";
    tierLabel = "RARO ⭐⭐";
    tierBadgeColor = "#0288D1";
    bgGradientStart = "#051829";
    bgGradientEnd = "#010811";
    glowColor = "#00BCD4";
  }

  // Tags especiales
  let specialBadgeSvg = "";
  if (isNewSpecies && isNewRecord) {
    specialBadgeSvg = `
      <rect x="150" y="475" width="300" height="34" rx="17" fill="#FFD700" stroke="#FFFFFF" stroke-width="2"/>
      <text x="300" y="498" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="900" text-anchor="middle">👑 ¡NUEVA ESPECIE Y RÉCORD! 🏆</text>
    `;
  } else if (isNewRecord) {
    specialBadgeSvg = `
      <rect x="160" y="475" width="280" height="34" rx="17" fill="#FFB300" stroke="#FFFFFF" stroke-width="2"/>
      <text x="300" y="498" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="900" text-anchor="middle">🏆 ¡NUEVO RÉCORD DE PESO!</text>
    `;
  } else if (isNewSpecies) {
    specialBadgeSvg = `
      <rect x="160" y="475" width="280" height="34" rx="17" fill="#00E5FF" stroke="#FFFFFF" stroke-width="2"/>
      <text x="300" y="498" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="900" text-anchor="middle">✨ ¡NUEVA ESPECIE DESCUBIERTA!</text>
    `;
  }

  // Líneas del lore de la carta
  const loreLines = wrapText(`"${fish.lore}"`, 36).slice(0, 3);
  const loreSvg = loreLines
    .map((line, idx) => `<text x="300" y="${685 + idx * 24}" fill="#B0BEC5" font-family="Arial, Georgia, serif" font-size="15" font-style="italic" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("\n");

  const fishNameUpper = escapeXml(fish.name.toUpperCase());
  const rodNameEscaped = escapeXml(equippedRodName);

  const svg = `
  <svg width="600" height="820" viewBox="0 0 600 820" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Gradientes dinámicos -->
      <linearGradient id="cardBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${borderGradientStart}"/>
        <stop offset="50%" stop-color="${borderColor}"/>
        <stop offset="100%" stop-color="${borderGradientEnd}"/>
      </linearGradient>

      <linearGradient id="cardBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${bgGradientStart}"/>
        <stop offset="100%" stop-color="${bgGradientEnd}"/>
      </linearGradient>

      <linearGradient id="artBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#00182E"/>
        <stop offset="100%" stop-color="#000912"/>
      </linearGradient>

      <radialGradient id="portalGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="${glowColor}" stop-opacity="0"/>
      </radialGradient>

      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Fondo general -->
    <rect width="100%" height="100%" rx="32" fill="#0A0E14" />

    <!-- Marco exterior brillante -->
    <rect x="12" y="12" width="576" height="796" rx="26" fill="url(#cardBg)" stroke="url(#cardBorder)" stroke-width="5" />
    <rect x="22" y="22" width="556" height="776" rx="20" fill="none" stroke="${borderColor}" stroke-width="1.5" opacity="0.6" />

    <!-- Encabezado: Tipo de colección y Caña -->
    <g transform="translate(40, 52)">
      <text x="0" y="0" fill="#90A4AE" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" letter-spacing="2">EMPY-BOT • ÁLBUM DEL ACUARIO</text>
      <text x="520" y="0" fill="#ECEFF1" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" text-anchor="end">🎣 ${rodNameEscaped}</text>
    </g>

    <!-- Nombre del Pez -->
    <text x="300" y="105" fill="#FFFFFF" font-family="Impact, 'Arial Black', sans-serif" font-size="34" font-weight="900" text-anchor="middle" letter-spacing="1.5">${fishNameUpper}</text>

    <!-- Pastilla de Rareza -->
    <rect x="200" y="122" width="200" height="28" rx="14" fill="${tierBadgeColor}" stroke="${borderColor}" stroke-width="1.5" />
    <text x="300" y="141" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="900" text-anchor="middle" letter-spacing="1">${tierLabel}</text>

    <!-- Marco de Ilustración Central -->
    <rect x="50" y="165" width="500" height="320" rx="18" fill="url(#artBg)" stroke="${borderColor}" stroke-width="2.5" />
    <circle cx="300" cy="325" r="130" fill="url(#portalGlow)" />
    <circle cx="300" cy="325" r="90" fill="none" stroke="${borderColor}" stroke-width="1" opacity="0.4" stroke-dasharray="6,6" />

    <!-- Ícono / Ilustración Central del Pez -->
    <text x="300" y="370" font-size="120" text-anchor="middle">${fish.icon}</text>

    <!-- Badge especial sobrepuesto -->
    ${specialBadgeSvg}

    <!-- Panel de Estadísticas (Peso y Precio) -->
    <g transform="translate(50, 530)">
      <!-- Box Peso -->
      <rect x="0" y="0" width="240" height="90" rx="14" fill="#0D1926" stroke="#1E324A" stroke-width="2" />
      <text x="120" y="32" fill="#90A4AE" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">PESO REGISTRADO</text>
      <text x="120" y="68" fill="#FFFFFF" font-family="Impact, Arial Black, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${weightKg.toFixed(2)} KG</text>

      <!-- Box Valor -->
      <rect x="260" y="0" width="240" height="90" rx="14" fill="#0D1926" stroke="#1E324A" stroke-width="2" />
      <text x="380" y="32" fill="#90A4AE" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">VALOR DE VENTA</text>
      <text x="380" y="68" fill="#FFD700" font-family="Impact, Arial Black, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">$${price.toLocaleString("es-AR")}</text>
    </g>

    <!-- Caja de Lore / Descripción -->
    <rect x="50" y="640" width="500" height="110" rx="12" fill="#09131C" stroke="#182A3E" stroke-width="1.5" />
    <line x1="220" y1="655" x2="380" y2="655" stroke="${borderColor}" stroke-width="1" opacity="0.6" />
    ${loreSvg}

    <!-- Pie de página / Sello -->
    <text x="300" y="785" fill="#546E7A" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" text-anchor="middle" letter-spacing="1.5">★ PESCA DEPORTIVA • COFRE DE COLECCIÓN • EMPY-BOT ★</text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
