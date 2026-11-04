import sharp from "sharp";

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

export interface EmergencyAlertOptions {
  professionTitle: string;
  emoji: string;
  situation: string;
  rewardFichas: number;
}

export async function generateEmergencyAlertCard(options: EmergencyAlertOptions): Promise<Buffer> {
  const { professionTitle, emoji, situation, rewardFichas } = options;

  const situationLines = wrapText(situation, 34).slice(0, 4);
  const situationSvg = situationLines
    .map((line, idx) => `<text x="425" y="${250 + idx * 34}" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("\n");

  const svg = `
  <svg width="850" height="500" viewBox="0 0 850 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Fondo Alarma -->
      <linearGradient id="alarmBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#C62828"/>
        <stop offset="50%" stop-color="#8E0000"/>
        <stop offset="100%" stop-color="#490000"/>
      </linearGradient>

      <!-- Patrón de franjas de advertencia (Hazard stripes) -->
      <pattern id="hazard" width="30" height="30" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="15" height="30" fill="#FFD600" />
        <rect x="15" width="15" height="30" fill="#000000" />
      </pattern>
    </defs>

    <!-- Marco exterior de advertencia -->
    <rect width="100%" height="100%" fill="url(#hazard)" />
    <!-- Fondo principal -->
    <rect x="16" y="16" width="818" height="468" fill="url(#alarmBg)" rx="12" stroke="#FFD600" stroke-width="3" />

    <!-- Barra superior -->
    <rect x="16" y="16" width="818" height="60" fill="#1A0000" rx="12" />
    <text x="425" y="54" fill="#FFD600" font-family="Impact, Arial Black, sans-serif" font-size="24" font-weight="900" text-anchor="middle" letter-spacing="2">🚨 ALERTA COMUNITARIA: AUXILIO VECINAL 🚨</text>

    <!-- Pastilla de Profesión Solicitada -->
    <g transform="translate(175, 95)">
      <rect x="0" y="0" width="500" height="70" rx="35" fill="#FFD600" stroke="#000000" stroke-width="3" />
      <text x="250" y="47" fill="#000000" font-family="Impact, Arial Black, sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="1">SE BUSCA: ${escapeXml(professionTitle.toUpperCase())} ${emoji}</text>
    </g>

    <!-- Recuadro del Incidente / Situación -->
    <rect x="50" y="185" width="750" height="175" rx="14" fill="#000000" opacity="0.65" stroke="#E53935" stroke-width="2" />
    <text x="425" y="215" fill="#FF8A80" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" letter-spacing="1.5">REPORTE DE INCIDENCIA EN VÍA PÚBLICA</text>
    <line x1="280" y1="225" x2="570" y2="225" stroke="#FF8A80" stroke-width="1" opacity="0.5" />
    ${situationSvg}

    <!-- Zócalo de Acción y Recompensa -->
    <g transform="translate(50, 385)">
      <!-- Box Honorarios -->
      <rect x="0" y="0" width="360" height="75" rx="12" fill="#1A0505" stroke="#FFD600" stroke-width="2" />
      <text x="180" y="30" fill="#FFD600" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">HONORARIOS DE RESCATE</text>
      <text x="180" y="60" fill="#FFFFFF" font-family="Impact, Arial Black, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">+$${rewardFichas.toLocaleString("es-AR")} FICHAS</text>

      <!-- Box Comando -->
      <rect x="390" y="0" width="360" height="75" rx="12" fill="#FFD600" stroke="#000000" stroke-width="2" />
      <text x="570" y="30" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">PARA ASISTIR AL VECINO</text>
      <text x="570" y="60" fill="#B71C1C" font-family="Impact, Arial Black, sans-serif" font-size="24" font-weight="900" text-anchor="middle">ESCRIBÍ !asistir YA</text>
    </g>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface EmergencyResolvedOptions {
  helperName: string;
  victimName: string;
  professionTitle: string;
  rewardHelper: number;
}

export async function generateEmergencyResolvedCard(options: EmergencyResolvedOptions): Promise<Buffer> {
  const { helperName, victimName, professionTitle, rewardHelper } = options;

  const svg = `
  <svg width="850" height="480" viewBox="0 0 850 480" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="successBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1B5E20"/>
        <stop offset="50%" stop-color="#0E3813"/>
        <stop offset="100%" stop-color="#051B08"/>
      </linearGradient>
    </defs>

    <rect width="100%" height="100%" fill="url(#successBg)" rx="24" stroke="#4CAF50" stroke-width="4" />
    <rect x="18" y="18" width="814" height="444" fill="none" stroke="#81C784" stroke-width="1.5" rx="18" opacity="0.6" />

    <!-- Título Header -->
    <rect x="150" y="35" width="550" height="50" rx="25" fill="#4CAF50" />
    <text x="425" y="70" fill="#000000" font-family="Impact, Arial Black, sans-serif" font-size="24" font-weight="900" text-anchor="middle" letter-spacing="1">🏆 URGENCIA COMUNITARIA RESUELTA 🏆</text>

    <!-- Contenido Central -->
    <g transform="translate(50, 115)">
      <rect x="0" y="0" width="750" height="210" rx="16" fill="#000000" opacity="0.5" stroke="#2E7D32" stroke-width="2" />
      
      <text x="375" y="45" fill="#C8E6C9" font-family="Arial, Helvetica, sans-serif" font-size="16" text-anchor="middle">RESCATE EXITOSO EN EL BARRIO</text>
      <line x1="250" y1="58" x2="500" y2="58" stroke="#81C784" stroke-width="1" opacity="0.4" />

      <text x="375" y="105" fill="#FFFFFF" font-family="Impact, Arial Black, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${escapeXml(helperName)}</text>
      <text x="375" y="140" fill="#FFEB3B" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">intervino volando como ${escapeXml(professionTitle)}</text>
      <text x="375" y="180" fill="#E8F5E9" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">¡y le salvó las papas a ${escapeXml(victimName)}! 🤝</text>
    </g>

    <!-- Panel de Beneficios y Honorarios -->
    <g transform="translate(50, 350)">
      <!-- Cobro -->
      <rect x="0" y="0" width="360" height="85" rx="14" fill="#08230D" stroke="#4CAF50" stroke-width="2" />
      <text x="180" y="32" fill="#81C784" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">HONORARIOS COBRADOS</text>
      <text x="180" y="66" fill="#FFD700" font-family="Impact, Arial Black, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">+$${rewardHelper.toLocaleString("es-AR")} FICHAS</text>

      <!-- Beneficio víctima -->
      <rect x="390" y="0" width="360" height="85" rx="14" fill="#08230D" stroke="#4CAF50" stroke-width="2" />
      <text x="570" y="32" fill="#81C784" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">BENEFICIO PARA LA VÍCTIMA</text>
      <text x="570" y="66" fill="#FFFFFF" font-family="Impact, Arial Black, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">+15% PAGA EN LABUROS</text>
    </g>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
