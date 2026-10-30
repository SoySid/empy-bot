import { Command, CommandContext } from "./types.js";
import sharp from "sharp";
import axios from "axios";
import { resolveOrRegisterUser } from "../services/db/user.service.js";

export function getValidName(name?: string | null): string | null {
  if (!name) return null;
  const clean = name.trim().replace(/^@/, "");
  if (!clean || /^\d{6,}$/.test(clean)) return null;
  return clean;
}

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

export const tweetCommand: Command = {
  name: "tweet",
  aliases: ["faketweet", "tweetfalso"],
  description: "Genera una imagen simulando un tweet verificado de Twitter/X.",
  execute: async ({ sock, msg, remoteJid, senderProfile, quotedSenderProfile, cleanText, contextInfo }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipant = contextInfo?.participant;

    let targetJid = senderJid;
    let tweetBody = cleanText.trim();

    if (mentionedJids && mentionedJids.length > 0) {
      targetJid = mentionedJids[0];
      tweetBody = tweetBody.replace(/@\d+/g, "").trim();
    } else if (quotedParticipant) {
      targetJid = quotedParticipant;
    }

    let targetName: string | null = null;
    if (targetJid === senderJid) {
      targetName =
        getValidName(senderProfile?.primaryName) ||
        getValidName(senderProfile?.realName) ||
        getValidName(senderProfile?.pushName) ||
        getValidName(msg.pushName);
    } else {
      if (quotedParticipant && targetJid === quotedParticipant && quotedSenderProfile) {
        targetName =
          getValidName(quotedSenderProfile.primaryName) ||
          getValidName(quotedSenderProfile.realName) ||
          getValidName(quotedSenderProfile.pushName);
      }
      if (!targetName) {
        const profile = await resolveOrRegisterUser(targetJid).catch(() => null);
        targetName =
          getValidName(profile?.primaryName) ||
          getValidName(profile?.realName) ||
          getValidName(profile?.pushName);
      }
    }

    if (!targetName) {
      targetName = "Usuario";
    }

    if (!tweetBody) {
      await sock.sendMessage(
        remoteJid,
        { text: "✍️ Escribí el texto del tweet. Ej: *!tweet No llego a fin de mes pero me compré una Play 5*" },
        { quoted: msg as any }
      );
      return;
    }

    try {
      // 1. Intentar obtener avatar de perfil de WhatsApp
      let avatarBase64 = "";
      try {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image");
        if (ppUrl) {
          const imgRes = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 4000 });
          const pngBuffer = await sharp(Buffer.from(imgRes.data))
            .resize(100, 100)
            .png()
            .toBuffer();
          avatarBase64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;
        }
      } catch {
        // En caso de privacidad activada o error, se usará el avatar SVG por defecto
      }

      const handle = `@${targetName.toLowerCase().replace(/[^a-z0-9_]/gi, "").slice(0, 15) || "usuario"}`;
      const lines = wrapText(tweetBody, 38).slice(0, 8); // Máximo 8 líneas
      const textLineHeight = 34;
      const textStartY = 160;
      const totalTextHeight = lines.length * textLineHeight;
      const cardHeight = Math.max(380, 260 + totalTextHeight);

      const textSvgLines = lines
        .map((line, idx) => `<text x="50" y="${textStartY + idx * textLineHeight}" fill="#e7e9ea" font-family="Arial, Helvetica, sans-serif" font-size="24">${escapeXml(line)}</text>`)
        .join("\n");

      const now = new Date();
      const timeStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const dateStr = now.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
      const statsY = textStartY + totalTextHeight + 45;
      const footerY = statsY + 45;

      const randomRetweets = (Math.floor(Math.random() * 85) + 12).toFixed(1) + "K";
      const randomLikes = (Math.floor(Math.random() * 320) + 40).toFixed(1) + "K";
      const randomViews = (Math.floor(Math.random() * 9) + 1.2).toFixed(1) + "M";

      const avatarElement = avatarBase64
        ? `<image href="${avatarBase64}" x="50" y="40" width="70" height="70" clip-path="url(#avatarClip)" />`
        : `<circle cx="85" cy="75" r="35" fill="#333639" />
           <text x="85" y="85" font-family="Arial" font-size="28" font-weight="bold" fill="#71767b" text-anchor="middle">${escapeXml(targetName.charAt(0).toUpperCase())}</text>`;

      const svg = `
      <svg width="750" height="${cardHeight}" viewBox="0 0 750 ${cardHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="avatarClip">
            <circle cx="85" cy="75" r="35" />
          </clipPath>
        </defs>

        <!-- Fondo estilo X Dark Mode -->
        <rect width="100%" height="100%" rx="20" fill="#000000" />
        <rect width="100%" height="100%" rx="20" fill="none" stroke="#2f3336" stroke-width="2" />

        <!-- Avatar -->
        ${avatarElement}

        <!-- Nombre y Badge verificado -->
        <text x="135" y="66" fill="#e7e9ea" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold">${escapeXml(targetName)}</text>
        
        <!-- Icono Verificado (Azul) -->
        <g transform="translate(135, 78)">
          <!-- Handle -->
          <text x="0" y="14" fill="#71767b" font-family="Arial, Helvetica, sans-serif" font-size="18">${escapeXml(handle)}</text>
        </g>

        <!-- Logo X en la esquina superior derecha -->
        <path d="M 680 45 L 695 65 L 680 85 M 695 45 L 680 65 L 695 85" stroke="#71767b" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.6"/>

        <!-- Texto del Tweet -->
        ${textSvgLines}

        <!-- Fecha y Hora -->
        <text x="50" y="${statsY}" fill="#71767b" font-family="Arial, Helvetica, sans-serif" font-size="16">${timeStr} · ${dateStr} · <tspan fill="#1d9bf0" font-weight="bold">Twitter for Android</tspan></text>
        <line x1="50" y1="${statsY + 18}" x2="700" y2="${statsY + 18}" stroke="#2f3336" stroke-width="1" />

        <!-- Métricas (Retweets, Likes, Vistas) -->
        <g transform="translate(50, ${footerY})" font-family="Arial, Helvetica, sans-serif" font-size="16">
          <text x="0" y="0" fill="#e7e9ea" font-weight="bold">${randomRetweets} <tspan fill="#71767b" font-weight="normal">Reposts</tspan></text>
          <text x="180" y="0" fill="#e7e9ea" font-weight="bold">${randomLikes} <tspan fill="#71767b" font-weight="normal">Me gusta</tspan></text>
          <text x="360" y="0" fill="#e7e9ea" font-weight="bold">${randomViews} <tspan fill="#71767b" font-weight="normal">Vistas</tspan></text>
        </g>
      </svg>
      `;

      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      await sock.sendMessage(
        remoteJid,
        {
          image: pngBuffer,
          caption: `🐦 Tweet de *${targetName}*`,
        },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[Tweet Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al generar la imagen del tweet." },
        { quoted: msg as any }
      );
    }
  },
};
