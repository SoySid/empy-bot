import { Command, CommandContext } from "./types.js";
import sharp from "sharp";
import axios from "axios";
import { resolveOrRegisterUser } from "../services/db/user.service.js";
import { getValidName, escapeXml } from "./tweet.js";


const FUNNY_STATUSES = [
  "Soltero crónico",
  "Enemigo de la pala",
  "Casado con el vicio",
  "En situación de meme",
  "Candidato a mute",
  "Deudor de asados",
  "Viviendo a base de chipá",
  "Fantasma nocturno",
];

const FUNNY_DONOR = [
  "Hígado liquidado",
  "Cerebro 0km sin uso",
  "Solo si pagan en fichas",
  "Pulmones ahumados",
  "Todo donable menos la Play",
  "Apto para repuesto",
];

export const dniCommand: Command = {
  name: "dni",
  aliases: ["carnet", "cedula", "identidad"],
  description: "Genera una tarjeta de DNI argentino humorística con la foto del usuario.",
  execute: async ({ sock, msg, remoteJid, senderProfile, quotedSenderProfile, contextInfo }: CommandContext) => {
    const senderJid = senderProfile?.jid || msg.key?.participant || msg.key?.remoteJid || "";
    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipant = contextInfo?.participant;

    let targetJid = senderJid;

    if (mentionedJids && mentionedJids.length > 0) {
      targetJid = mentionedJids[0];
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
      targetName = "Ciudadano";
    }

    try {
      // 1. Obtener foto de perfil de WhatsApp
      let avatarBase64 = "";
      try {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image");
        if (ppUrl) {
          const imgRes = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 4000 });
          const pngBuffer = await sharp(Buffer.from(imgRes.data))
            .resize(170, 210, { fit: "cover" })
            .png()
            .toBuffer();
          avatarBase64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;
        }
      } catch {
        // Fallback si no tiene foto accesible
      }

      const phoneDigits = targetJid.replace(/\D/g, "");
      const fakeDniNum = phoneDigits.length >= 8 ? phoneDigits.slice(-8) : String(Math.floor(20000000 + Math.random() * 25000000));
      const formattedDni = `${fakeDniNum.slice(0, 2)}.${fakeDniNum.slice(2, 5)}.${fakeDniNum.slice(5, 8)}`;

      const status = FUNNY_STATUSES[Math.floor(Math.random() * FUNNY_STATUSES.length)];
      const donor = FUNNY_DONOR[Math.floor(Math.random() * FUNNY_DONOR.length)];
      const year = 1995 + Math.floor(Math.random() * 12);
      const birthDate = `${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}/${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}/${year}`;

      const avatarElement = avatarBase64
        ? `<image href="${avatarBase64}" x="40" y="110" width="170" height="210" rx="8" />`
        : `<rect x="40" y="110" width="170" height="210" rx="8" fill="#d0dbe5" />
           <text x="125" y="225" font-family="Arial" font-size="48" font-weight="bold" fill="#7a8b99" text-anchor="middle">${escapeXml(targetName.charAt(0).toUpperCase())}</text>`;

      const svg = `
      <svg width="780" height="480" viewBox="0 0 780 480" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dniBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#bfe0f8" />
            <stop offset="50%" stop-color="#eaf3fb" />
            <stop offset="100%" stop-color="#b8dbf5" />
          </linearGradient>
        </defs>

        <!-- Base Tarjeta -->
        <rect width="100%" height="100%" rx="24" fill="url(#dniBg)" stroke="#8cb5d9" stroke-width="3" />

        <!-- Encabezado Oficial -->
        <rect x="0" y="0" width="780" height="85" rx="24" fill="#0b538c" />
        <rect x="0" y="60" width="780" height="25" fill="#0b538c" />
        
        <text x="40" y="38" fill="#ffffff" font-family="Arial, sans-serif" font-size="20" font-weight="bold" letter-spacing="1">REPÚBLICA ARGENTINA</text>
        <text x="40" y="65" fill="#e0effc" font-family="Arial, sans-serif" font-size="14" letter-spacing="2">REGISTRO NACIONAL DE LAS PERSONAS</text>
        <text x="740" y="52" fill="#ffd54f" font-family="Arial, sans-serif" font-size="18" font-weight="bold" text-anchor="end">DNI</text>

        <!-- Foto de Perfil -->
        <rect x="36" y="106" width="178" height="218" rx="10" fill="#ffffff" stroke="#8cb5d9" stroke-width="2" />
        ${avatarElement}

        <!-- Datos Personales -->
        <g font-family="Arial, Helvetica, sans-serif">
          <!-- Apellido y Nombres -->
          <text x="240" y="130" fill="#0b538c" font-size="12" font-weight="bold">APELLIDO Y NOMBRES</text>
          <text x="240" y="155" fill="#111111" font-size="22" font-weight="bold">${escapeXml(targetName.toUpperCase())}</text>

          <!-- DNI -->
          <text x="240" y="190" fill="#0b538c" font-size="12" font-weight="bold">DOCUMENTO / DNI N°</text>
          <text x="240" y="215" fill="#0b538c" font-size="24" font-weight="bold">${formattedDni}</text>

          <!-- Nacionalidad y Nacimiento -->
          <text x="240" y="250" fill="#0b538c" font-size="11" font-weight="bold">NACIONALIDAD</text>
          <text x="240" y="270" fill="#222222" font-size="15">ARGENTINA</text>

          <text x="390" y="250" fill="#0b538c" font-size="11" font-weight="bold">FECHA NACIMIENTO</text>
          <text x="390" y="270" fill="#222222" font-size="15">${birthDate}</text>

          <!-- Estado y Condición -->
          <text x="240" y="305" fill="#0b538c" font-size="11" font-weight="bold">ESTADO CIVIL</text>
          <text x="240" y="325" fill="#d32f2f" font-size="15" font-weight="bold">${escapeXml(status)}</text>

          <text x="240" y="360" fill="#0b538c" font-size="11" font-weight="bold">CONDICIÓN DE DONANTE</text>
          <text x="240" y="380" fill="#222222" font-size="14">${escapeXml(donor)}</text>

          <!-- Huella dactilar decorativa -->
          <g transform="translate(620, 240)" opacity="0.45" stroke="#0b538c" stroke-width="2.5" fill="none">
            <ellipse cx="40" cy="50" rx="35" ry="45" />
            <ellipse cx="40" cy="50" rx="25" ry="35" />
            <ellipse cx="40" cy="50" rx="15" ry="25" />
            <ellipse cx="40" cy="50" rx="6" ry="12" />
          </g>

          <!-- Firma inventada -->
          <text x="40" y="365" fill="#0b538c" font-size="11" font-weight="bold">FIRMA DEL TITULAR</text>
          <path d="M 40 405 Q 80 370 120 410 T 190 395" stroke="#111111" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g>

        <!-- Pie de tarjeta estilo código MRZ -->
        <rect x="0" y="425" width="780" height="55" fill="#08385e" />
        <text x="40" y="455" fill="#7ec0ee" font-family="Courier New, monospace" font-size="17" font-weight="bold" letter-spacing="3">IDARG${fakeDniNum}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
        <text x="40" y="472" fill="#7ec0ee" font-family="Courier New, monospace" font-size="15" letter-spacing="3">${year}01010ARG&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;${fakeDniNum.slice(-4)}</text>
      </svg>
      `;

      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      await sock.sendMessage(
        remoteJid,
        {
          image: pngBuffer,
          caption: `🪪 DNI de *${targetName}*`,
        },
        { quoted: msg as any }
      );
    } catch (err) {
      console.error("[DNI Command] Error:", err);
      await sock.sendMessage(
        remoteJid,
        { text: "❌ Ocurrió un error al emitir el DNI." },
        { quoted: msg as any }
      );
    }
  },
};
