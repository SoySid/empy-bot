import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface ReactionConfig {
  apiReaction: string;
  soloTexts: (sender: string) => string[];
  targetTexts: (sender: string, target: string) => string[];
}

export const ANIME_REACTIONS: Record<string, ReactionConfig> = {
  // --- ACCIONES CON OBJETIVO / INTERACCIÓN ---
  golpear: {
    apiReaction: "slap",
    soloTexts: (s) => [`💥 *${s}* está tirando piñas al aire como loco`],
    targetTexts: (s, t) => [
      `💥 *${s}* le acomodó las ideas de un bife a *${t}*`,
      `👋 *${s}* le estampó una cachetada a *${t}*`,
      `🥊 *${s}* le metió un viaje en la pera a *${t}*`,
    ],
  },
  pegar: {
    apiReaction: "punch",
    soloTexts: (s) => [`🥊 *${s}* está boxeando con la sombra`],
    targetTexts: (s, t) => [
      `🥊 *${s}* le metió una piña limpia a *${t}*`,
      `💥 *${s}* le encajó un combo a *${t}*`,
    ],
  },
  patada: {
    apiReaction: "kick",
    soloTexts: (s) => [`🦵 *${s}* tiró una patada voladora de la nada`],
    targetTexts: (s, t) => [
      `🦵 *${s}* le encajó una patada voladora en el pecho a *${t}*`,
      `🥋 *${s}* mandó a volar de una patada a *${t}*`,
    ],
  },
  abrazar: {
    apiReaction: "hug",
    soloTexts: (s) => [`🫂 *${s}* necesita un abrazo urgente`],
    targetTexts: (s, t) => [
      `🫂 *${s}* le dio un abrazo reconfortante a *${t}*`,
      `🥺 *${s}* se colgó del cuello de *${t}* con un abrazo`,
    ],
  },
  mimos: {
    apiReaction: "cuddle",
    soloTexts: (s) => [`🥰 *${s}* anda cariñoso`],
    targetTexts: (s, t) => [
      `🥰 *${s}* se puso a hacerle mimos a *${t}*`,
      `🫂 *${s}* se acurrucó con *${t}*`,
    ],
  },
  besar: {
    apiReaction: "kiss",
    soloTexts: (s) => [`💋 *${s}* anda tirando besos a todos`],
    targetTexts: (s, t) => [
      `💋 *${s}* le encajó un re beso a *${t}*`,
      `😚 *${s}* le dio un chape tremendo a *${t}*`,
    ],
  },
  morder: {
    apiReaction: "bite",
    soloTexts: (s) => [`🦷 *${s}* tiene ganas de morder cosas`],
    targetTexts: (s, t) => [
      `🦷 *${s}* le pegó un mordiscón a *${t}*`,
      `😬 *${s}* le mordió el brazo a *${t}*`,
    ],
  },
  acariciar: {
    apiReaction: "pat",
    soloTexts: (s) => [`💆 *${s}* se acaricia la cabeza`],
    targetTexts: (s, t) => [
      `👋 *${s}* le hizo pat-pat en la cabeza a *${t}*`,
      `✨ *${s}* está mimando a *${t}*`,
    ],
  },
  chocar: {
    apiReaction: "brofist",
    soloTexts: (s) => [`🤜🤛 *${s}* deja el puño en el aire`],
    targetTexts: (s, t) => [
      `👊 *${s}* chocó los puños con *${t}*`,
      `🤝 *${s}* hizo un choque de puños con *${t}*, unos capos`,
    ],
  },
  cosquillas: {
    apiReaction: "tickle",
    soloTexts: (s) => [`👉 *${s}* anda buscando a quién hacerle cosquillas`],
    targetTexts: (s, t) => [
      `😂 *${s}* le está haciendo cosquillas a *${t}* sin parar`,
    ],
  },
  lamer: {
    apiReaction: "lick",
    soloTexts: (s) => [`👅 *${s}* anda lamiendo la pantalla`],
    targetTexts: (s, t) => [
      `👅 *${s}* le pegó una lamida en la cara a *${t}*`,
    ],
  },
  molestar: {
    apiReaction: "poke",
    soloTexts: (s) => [`👉 *${s}* anda con ganas de joder`],
    targetTexts: (s, t) => [
      `👉 *${s}* está jodiendo con el dedo a *${t}*`,
      `👀 *${s}* no para de pinchar a *${t}* para que le dé bola`,
    ],
  },
  pellizcar: {
    apiReaction: "pinch",
    soloTexts: (s) => [`🤏 *${s}* anda con los dedos rápidos`],
    targetTexts: (s, t) => [
      `🤏 *${s}* le pellizcó el cachete a *${t}*`,
    ],
  },
  matar: {
    apiReaction: "kill",
    soloTexts: (s) => [`💀 *${s}* anda modo sicario`],
    targetTexts: (s, t) => [
      `⚰️ *${s}* liquidó sin piedad a *${t}*`,
      `💀 *${s}* borró del mapa a *${t}*`,
    ],
  },

  // --- REACCIONES / ESTADOS DE ÁNIMO ---
  llorar: {
    apiReaction: "cry",
    soloTexts: (s) => [
      `😭 *${s}* se puso a llorar desconsoladamente`,
      `💧 *${s}* está llorando en una esquina`,
    ],
    targetTexts: (s, t) => [`😭 *${s}* se puso a llorar por culpa de *${t}*`],
  },
  triste: {
    apiReaction: "sad",
    soloTexts: (s) => [`😔 *${s}* anda con el corazón roto y deprimido`],
    targetTexts: (s, t) => [`😔 *${s}* se puso triste por lo que hizo *${t}*`],
  },
  bailar: {
    apiReaction: "dance",
    soloTexts: (s) => [
      `💃 *${s}* sacó los pasos prohibidos en la pista`,
      `🕺 *${s}* se puso a bailar bien cheto`,
    ],
    targetTexts: (s, t) => [`💃 *${s}* se puso a tirar unos pasos con *${t}*`],
  },
  reir: {
    apiReaction: "laugh",
    soloTexts: (s) => [
      `🤣 *${s}* se está estallando de la risa`,
      `💀 *${s}* no da más del descanso`,
    ],
    targetTexts: (s, t) => [`🤣 *${s}* se está riendo en la cara de *${t}*`],
  },
  dormir: {
    apiReaction: "sleep",
    soloTexts: (s) => [
      `💤 *${s}* se fue a mimir, no lo jodan`,
      `😴 *${s}* cayó desplomado en la cama`,
    ],
    targetTexts: (s, t) => [`💤 *${s}* se quedó dormido arriba de *${t}*`],
  },
  bostezar: {
    apiReaction: "yawn",
    soloTexts: (s) => [`🥱 *${s}* se está muriendo de sueño`],
    targetTexts: (s, t) => [`🥱 *${s}* le contagió el bostezo a *${t}*`],
  },
  festejar: {
    apiReaction: "celebrate",
    soloTexts: (s) => [`🎉 *${s}* se puso a festejar a lo loco! VAMOOO`],
    targetTexts: (s, t) => [`🎉 *${s}* está festejando junto a *${t}*`],
  },
  brindis: {
    apiReaction: "cheers",
    soloTexts: (s) => [`🍻 *${s}* levantó la copa y gritó: ¡Salud!`],
    targetTexts: (s, t) => [`🍻 *${s}* chocó las copas con *${t}*`],
  },
  enojado: {
    apiReaction: "angry",
    soloTexts: (s) => [
      `😡 *${s}* se re calentó, guarden todo`,
      `💢 *${s}* está a punto de romper el teclado de la bronca`,
    ],
    targetTexts: (s, t) => [`😡 *${s}* se re calentó con *${t}*`],
  },
  confundido: {
    apiReaction: "confused",
    soloTexts: (s) => [`❓ *${s}* no está entendiendo un carajo`],
    targetTexts: (s, t) => [`❓ *${s}* mira a *${t}* sin entender qué dice`],
  },
  facepalm: {
    apiReaction: "facepalm",
    soloTexts: (s) => [
      `🤦‍♂️ *${s}* se quiere cortar las bolas`,
      `🤦 *${s}* no puede creer semejante boludez`,
    ],
    targetTexts: (s, t) => [`🤦 *${s}* se agarra la cabeza con las burradas de *${t}*`],
  },
  aplaudir: {
    apiReaction: "clap",
    soloTexts: (s) => [`👏 *${s}* se puso de pie para aplaudir`],
    targetTexts: (s, t) => [`👏 *${s}* le aplaude la jugada a *${t}*`],
  },
  correr: {
    apiReaction: "run",
    soloTexts: (s) => [`🏃 *${s}* salió corriendo a toda velocidad`],
    targetTexts: (s, t) => [`🏃 *${s}* salió rajando escapando de *${t}*`],
  },
  sonrojar: {
    apiReaction: "blush",
    soloTexts: (s) => [`😳 *${s}* se puso colorado como un tomate`],
    targetTexts: (s, t) => [`😳 *${s}* se sonrojó por lo que dijo *${t}*`],
  },
  timido: {
    apiReaction: "shy",
    soloTexts: (s) => [`🫣 *${s}* le dio vergüenza y se escondió`],
    targetTexts: (s, t) => [`🫣 *${s}* se puso tímido al ver a *${t}*`],
  },
  miedo: {
    apiReaction: "scared",
    soloTexts: (s) => [`😱 *${s}* se pegó un cagazo bárbaro`],
    targetTexts: (s, t) => [`😱 *${s}* le tiene un cagazo terrible a *${t}*`],
  },
  saludar: {
    apiReaction: "wave",
    soloTexts: (s) => [`👋 *${s}* saluda al grupo con la mano`],
    targetTexts: (s, t) => [`👋 *${s}* le tira un saludo a *${t}*`],
  },
  guiño: {
    apiReaction: "wink",
    soloTexts: (s) => [`😉 *${s}* tiró un guiño de ojo canchero`],
    targetTexts: (s, t) => [`😉 *${s}* le tiró un guiño cómplice a *${t}*`],
  },
  fumar: {
    apiReaction: "smoke",
    soloTexts: (s) => [`🚬 *${s}* se prendió un pucho pensando en la vida`],
    targetTexts: (s, t) => [`🚬 *${s}* se prende un pucho mientras escucha a *${t}*`],
  },
  comer: {
    apiReaction: "nom",
    soloTexts: (s) => [`🍔 *${s}* se está bajando tremendo bajón`],
    targetTexts: (s, t) => [`🍕 *${s}* le robó la comida a *${t}*`],
  },
};

// Aliases directos para que respondan con la misma acción
export const REACTION_ALIASES: Record<string, string> = {
  slap: "golpear",
  punch: "pegar",
  bife: "golpear",
  pinia: "pegar",
  piña: "pegar",
  kick: "patada",
  hug: "abrazar",
  abrazo: "abrazar",
  kiss: "besar",
  beso: "besar",
  chape: "besar",
  bite: "morder",
  mordisco: "morder",
  pat: "acariciar",
  mimo: "mimos",
  kill: "matar",
  muerte: "matar",
  cry: "llorar",
  llanto: "llorar",
  dance: "bailar",
  baile: "bailar",
  laugh: "reir",
  risa: "reir",
  sleep: "dormir",
  mimir: "dormir",
  yawn: "bostezar",
  festejo: "festejar",
  cheers: "brindis",
  angry: "enojado",
  mad: "enojado",
  caliente: "enojado",
  poke: "molestar",
  clap: "aplaudir",
  run: "correr",
  escape: "correr",
  blush: "sonrojar",
  shy: "timido",
  scared: "miedo",
  cagazo: "miedo",
  wave: "saludar",
  hola: "saludar",
  wink: "guiño",
  nom: "comer",
};

/**
 * Consulta OtakuGIFs y convierte el GIF a MP4 compatible con WhatsApp en bucle
 */
export async function fetchOtakuGifBuffer(apiReaction: string): Promise<Buffer | null> {
  try {
    const { data } = await axios.get(
      `https://api.otakugifs.xyz/gif?reaction=${apiReaction}&format=gif`,
      { timeout: 12000 }
    );

    if (!data?.url) return null;

    const fileRes = await axios.get(data.url, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    const gifBuffer = Buffer.from(fileRes.data);

    // Convertimos el GIF a MP4 optimizado para WhatsApp gifPlayback
    const tempId = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(os.tmpdir(), `gif_${tempId}.gif`);
    const outputPath = path.join(os.tmpdir(), `vid_${tempId}.mp4`);

    fs.writeFileSync(inputPath, gifBuffer);

    return await new Promise((resolve) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-pix_fmt yuv420p",
          "-c:v libx264",
          "-preset ultrafast",
          "-movflags +faststart",
          "-an",
          "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ])
        .toFormat("mp4")
        .save(outputPath)
        .on("end", () => {
          try {
            const outBuffer = fs.readFileSync(outputPath);
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            resolve(outBuffer);
          } catch {
            resolve(null);
          }
        })
        .on("error", (err) => {
          console.error("[OtakuGIFs Service] Error converting GIF to MP4 via ffmpeg:", err);
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          resolve(null);
        });
    });
  } catch (err) {
    console.error("[OtakuGIFs Service] Error obteniendo GIF:", err);
    return null;
  }
}