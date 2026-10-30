import fs from "fs";
import path from "path";
import axios from "axios";
import { convertToWhatsAppPtt } from "./tts.service.js";

const SOUNDS_DIR = path.resolve(process.cwd(), "sounds");

// Catálogo base de efectos de sonido con URLs de descarga directa (CDN/GitHub)
export const DEFAULT_SOUNDS: Record<string, { url: string; aliases: string[]; description: string }> = {
  bocina: {
    url: "https://raw.githubusercontent.com/octalmage/AirHorn/master/airhorn.mp3",
    aliases: ["airhorn", "corneta"],
    description: "Bocina de aire de cancha / reggaetón",
  },
  aplauso: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/applause.mp3",
    aliases: ["aplausos", "clap", "claps"],
    description: "Aplausos de multitud",
  },
  golpe: {
    url: "https://raw.githubusercontent.com/vikrambenipal/super-smash-js/master/punch.mp3",
    aliases: ["punch", "trompada", "piña", "hit"],
    description: "Golpe seco / trompazo",
  },
  bruh: {
    url: "https://raw.githubusercontent.com/anushmutyala/BCI-Web-Browsing/master/Bruh.mp3",
    aliases: [],
    description: "Meme 'Bruh' clásico",
  },
  alerta: {
    url: "https://raw.githubusercontent.com/vikrambenipal/super-smash-js/master/alert.mp3",
    aliases: ["alert", "metalgear"],
    description: "Sonido de alerta (!) de Metal Gear",
  },
  victoria: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/victory.mp3",
    aliases: ["win", "ganador"],
    description: "Fanfarria épica de victoria",
  },
  error: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/wrong.mp3",
    aliases: ["fail", "incorrecto"],
    description: "Bichito de respuesta incorrecta / error",
  },
  abucheo: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/boo.mp3",
    aliases: ["boo", "tomate"],
    description: "Abucheo del público / desaprobación",
  },
  festejo: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/tada.mp3",
    aliases: ["tada", "felicidades"],
    description: "Celebración '¡Ta-dá!'",
  },
  sorpresa: {
    url: "https://raw.githubusercontent.com/bradtraversy/50projects50days/master/sound-board/sounds/gasp.mp3",
    aliases: ["gasp", "asombro"],
    description: "Respiración contenida de asombro / gasp",
  },
  triste: {
    url: "https://raw.githubusercontent.com/vikrambenipal/super-smash-js/master/aww.mp3",
    aliases: ["aww", "pena"],
    description: "Coro 'Awwww' de lástima",
  },
  homerun: {
    url: "https://raw.githubusercontent.com/vikrambenipal/super-smash-js/master/homerun.mp3",
    aliases: ["bate", "bat"],
    description: "Bate de béisbol mandándolo a volar",
  },
  hongo: {
    url: "https://raw.githubusercontent.com/vikrambenipal/super-smash-js/master/mushroom.mp3",
    aliases: ["mario", "levelup"],
    description: "Sonido de hongo / level up de Mario",
  },
};

/**
 * Inicializa el directorio de sonidos y descarga los efectos base que falten en segundo plano.
 */
export async function initSoundsDirectory(): Promise<void> {
  try {
    if (!fs.existsSync(SOUNDS_DIR)) {
      fs.mkdirSync(SOUNDS_DIR, { recursive: true });
    }

    // Comprobar y descargar en paralelo si no existen
    for (const [name, config] of Object.entries(DEFAULT_SOUNDS)) {
      const targetPath = path.join(SOUNDS_DIR, `${name}.mp3`);
      if (!fs.existsSync(targetPath)) {
        downloadSoundFile(config.url, targetPath).catch((err) => {
          console.warn(`[Sound Service] No se pudo precargar sonido "${name}":`, err?.message || err);
        });
      }
    }
  } catch (err) {
    console.error("[Sound Service] Error inicializando directorio:", err);
  }
}

async function downloadSoundFile(url: string, destPath: string): Promise<Buffer> {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  const buffer = Buffer.from(res.data);
  await fs.promises.writeFile(destPath, buffer);
  return buffer;
}

/**
 * Resuelve el nombre del sonido (incluyendo aliases y nombres de archivos locales)
 */
function resolveSoundKey(query: string): string | null {
  const clean = query.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!clean) return null;

  // 1. Coincidencia exacta con clave base
  if (DEFAULT_SOUNDS[clean]) return clean;

  // 2. Coincidencia por alias
  for (const [key, val] of Object.entries(DEFAULT_SOUNDS)) {
    if (val.aliases.includes(clean)) return key;
  }

  // 3. Coincidencia en archivos locales existentes
  if (fs.existsSync(SOUNDS_DIR)) {
    const files = fs.readdirSync(SOUNDS_DIR);
    for (const f of files) {
      const nameWithoutExt = path.parse(f).name.toLowerCase();
      if (nameWithoutExt === clean) return f;
    }
  }

  return null;
}

/**
 * Obtiene el buffer de audio en formato WhatsApp PTT Opus para el efecto solicitado.
 */
export async function getSoundBuffer(query: string): Promise<Buffer | null> {
  try {
    const resolvedKey = resolveSoundKey(query);
    if (!resolvedKey) return null;

    if (!fs.existsSync(SOUNDS_DIR)) {
      fs.mkdirSync(SOUNDS_DIR, { recursive: true });
    }

    // 1. Si existe un archivo local con ese nombre exacto o extensión
    const possibleFiles = [
      path.join(SOUNDS_DIR, resolvedKey),
      path.join(SOUNDS_DIR, `${resolvedKey}.mp3`),
      path.join(SOUNDS_DIR, `${resolvedKey}.ogg`),
      path.join(SOUNDS_DIR, `${resolvedKey}.wav`),
    ];

    for (const p of possibleFiles) {
      if (fs.existsSync(p)) {
        const raw = await fs.promises.readFile(p);
        return await convertToWhatsAppPtt(raw);
      }
    }

    // 2. Si está en el catálogo predefinido y aún no se descargó
    const defaultConf = DEFAULT_SOUNDS[resolvedKey];
    if (defaultConf) {
      const targetPath = path.join(SOUNDS_DIR, `${resolvedKey}.mp3`);
      const downloaded = await downloadSoundFile(defaultConf.url, targetPath);
      return await convertToWhatsAppPtt(downloaded);
    }

    return null;
  } catch (err) {
    console.error(`[Sound Service] Error obteniendo sonido "${query}":`, err);
    return null;
  }
}

/**
 * Retorna la lista de nombres de sonidos disponibles (base + locales agregados por el usuario).
 */
export function getAvailableSoundNames(): { name: string; description: string; aliases: string[] }[] {
  const result = new Map<string, { name: string; description: string; aliases: string[] }>();

  // 1. Agregar catálogo por defecto
  for (const [key, val] of Object.entries(DEFAULT_SOUNDS)) {
    result.set(key, { name: key, description: val.description, aliases: val.aliases });
  }

  // 2. Agregar cualquier archivo extra colocado en sounds/
  if (fs.existsSync(SOUNDS_DIR)) {
    const files = fs.readdirSync(SOUNDS_DIR);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if ([".mp3", ".ogg", ".wav", ".m4a"].includes(ext)) {
        const baseName = path.parse(f).name.toLowerCase();
        if (!result.has(baseName)) {
          result.set(baseName, {
            name: baseName,
            description: "Sonido personalizado del servidor",
            aliases: [],
          });
        }
      }
    }
  }

  return Array.from(result.values());
}
