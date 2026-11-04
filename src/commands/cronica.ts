import { Command, CommandContext } from "./types.js";
import sharp from "sharp";
import { escapeXml } from "./tweet.js";

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

export const cronicaCommand: Command = {
  name: "cronica",
  aliases: ["placa", "placaraoja", "urgente", "cronicafirme"],
  description: "Genera una placa roja urgente de Crónica TV con texto propio o respondiendo a un mensaje.",
  execute: async ({ sock, msg, remoteJid, cleanText, quotedMsg }: CommandContext) => {
    let rawText = cleanText.trim();

    // Si no se proporcionó texto, buscar en el mensaje citado (reply)
    if (!rawText && quotedMsg) {
      rawText =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption ||
        "";
      rawText = rawText.trim();
    }

    if (!rawText) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            "🔴 *Placa Roja de Crónica TV*\n\n" +
            "Escribí el texto de la noticia o respondé a un mensaje del grupo con *!cronica*.\n\n" +
            "*Formato con bajada opcional:*\n" +
            "`!cronica TITULO PRINCIPAL | Bajada o subtítulo en amarillo`\n\n" +
            "*Ejemplos:*\n" +
            "• `!cronica SE QUEDÓ DORMIDO | NO LLEGA AL PARCIAL`\n" +
            "• `!cronica CHOCÓ UNA PALOMA CONTRA EL METROBUS`",
        },
        { quoted: msg as any }
      );
      return;
    }

    try {
      if (msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: "🔴", key: msg.key } });
      }

      // Separación de Título y Bajada mediante "|"
      let headlinePart = rawText;
      let subtitlePart = "";

      if (rawText.includes("|")) {
        const parts = rawText.split("|");
        headlinePart = parts[0].trim();
        subtitlePart = parts.slice(1).join("|").trim();
      }

      headlinePart = headlinePart.toUpperCase();
      subtitlePart = subtitlePart.toUpperCase();

      // Ajuste tipográfico dinámico según longitud
      const headlineLines = wrapText(headlinePart, headlinePart.length > 50 ? 24 : 20).slice(0, 5);
      const subtitleLines = subtitlePart ? wrapText(subtitlePart, 28).slice(0, 3) : [];

      let headlineFontSize = 46;
      let headlineLineHeight = 52;
      if (headlineLines.length >= 4) {
        headlineFontSize = 38;
        headlineLineHeight = 44;
      } else if (headlineLines.length === 1 && !subtitlePart && headlinePart.length < 25) {
        headlineFontSize = 54;
        headlineLineHeight = 60;
      }

      const subtitleFontSize = 32;
      const subtitleLineHeight = 38;

      const totalHeadlineHeight = headlineLines.length * headlineLineHeight;
      const totalSubtitleHeight = subtitleLines.length > 0 ? (subtitleLines.length * subtitleLineHeight) + 30 : 0;
      const totalTextBlockHeight = totalHeadlineHeight + totalSubtitleHeight;

      // Centrado vertical dinámico
      const contentCenterY = 250;
      const startHeadlineY = Math.max(150, Math.floor(contentCenterY - (totalTextBlockHeight / 2) + 35));

      const headlineSvg = headlineLines
        .map((line, idx) => {
          const y = startHeadlineY + idx * headlineLineHeight;
          return `<text x="425" y="${y}" fill="#FFFFFF" font-family="Impact, 'Arial Black', sans-serif" font-size="${headlineFontSize}" font-weight="900" text-anchor="middle" stroke="#000000" stroke-width="2.5" paint-order="stroke fill">${escapeXml(line)}</text>`;
        })
        .join("\n");

      let subtitleSvg = "";
      if (subtitleLines.length > 0) {
        const startSubtitleY = startHeadlineY + totalHeadlineHeight + 25;
        subtitleSvg = subtitleLines
          .map((line, idx) => {
            const y = startSubtitleY + idx * subtitleLineHeight;
            return `<text x="425" y="${y}" fill="#FFDE00" font-family="Impact, 'Arial Black', sans-serif" font-size="${subtitleFontSize}" font-weight="900" text-anchor="middle" stroke="#000000" stroke-width="2" paint-order="stroke fill">${escapeXml(line)}</text>`;
          })
          .join("\n");
      }

      // Hora y temperatura actual en vivo
      const now = new Date();
      const timeStr = now.toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const randomTemp = (20 + (now.getHours() % 8) + Math.random() * 2).toFixed(1);

      const svg = `
      <svg width="850" height="500" viewBox="0 0 850 500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgRed" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#E50000"/>
            <stop offset="50%" stop-color="#C70000"/>
            <stop offset="100%" stop-color="#930000"/>
          </linearGradient>
          <pattern id="scanlines" width="10" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="10" y2="0" stroke="#000000" stroke-width="1.2" opacity="0.18"/>
          </pattern>
        </defs>

        <!-- Fondo rojo degradado -->
        <rect width="100%" height="100%" fill="url(#bgRed)" />

        <!-- Efecto CRT Scanlines -->
        <rect width="100%" height="100%" fill="url(#scanlines)" />

        <!-- Marcos característicos de TV -->
        <rect x="20" y="20" width="810" height="460" fill="none" stroke="#FFFFFF" stroke-width="3" />
        <rect x="26" y="26" width="798" height="448" fill="none" stroke="#FFDE00" stroke-width="1.5" />

        <!-- Barra superior de noticias -->
        <g transform="translate(35, 38)">
          <!-- Pastilla URGENTE -->
          <rect x="0" y="0" width="150" height="40" fill="#FFDE00" rx="4" />
          <text x="75" y="29" fill="#000000" font-family="Impact, 'Arial Black', sans-serif" font-size="26" font-weight="900" text-anchor="middle">URGENTE</text>

          <!-- Pastilla Reloj y Temperatura -->
          <rect x="585" y="0" width="195" height="40" fill="#000000" opacity="0.75" rx="4" stroke="#FFDE00" stroke-width="1.2" />
          <text x="682" y="27" fill="#FFFFFF" font-family="'Courier New', Courier, monospace" font-size="18" font-weight="bold" text-anchor="middle">${timeStr} | ${randomTemp}°</text>
        </g>

        <!-- Contenido Central: Título y Bajada -->
        ${headlineSvg}
        ${subtitleSvg}

        <!-- Zócalo inferior estilo Crónica TV -->
        <g transform="translate(35, 420)">
          <!-- Barra azul base -->
          <rect x="0" y="0" width="780" height="46" fill="#001B6B" rx="3" stroke="#FFFFFF" stroke-width="1.5" />
          <!-- Acento rojo de logo -->
          <rect x="0" y="0" width="165" height="46" fill="#C70000" rx="3" />

          <!-- Logo CRONICA -->
          <text x="82" y="33" fill="#FFFFFF" font-family="Impact, 'Arial Black', sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="1.5">CRONICA</text>

          <!-- Eslogan institucional -->
          <text x="472" y="31" fill="#FFDE00" font-family="Impact, 'Arial Black', sans-serif" font-size="21" font-weight="bold" text-anchor="middle" letter-spacing="2">FIRME JUNTO AL PUEBLO</text>

          <!-- Indicador EN VIVO -->
          <circle cx="745" cy="23" r="6" fill="#FF0000" />
          <circle cx="745" cy="23" r="6" fill="#FF0000" opacity="0.6">
            <animate attributeName="r" values="6;9;6" dur="1.5s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
      `;

      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      await sock.sendMessage(
        remoteJid,
        {
          image: pngBuffer,
          caption: "🔴 *CRÓNICA: FIRME JUNTO AL PUEBLO*",
        },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Cronica Command] Error al generar placa roja:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al generar la placa de Crónica." },
        { quoted: msg as any }
      );
    }
  },
};
