import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import dns from "dns";
import fs from "fs";
import path from "path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const execFileAsync = promisify(execFile);

export interface MediaDownloadResult {
  url?: string;
  buffer?: Buffer;
  type: "video" | "image" | "audio";
  caption?: string;
  title?: string;
  errorNotice?: string;
}

export function isSafePublicUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }

    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "metadata.google.internal"
    ) {
      return false;
    }

    if (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc00:") ||
      host.startsWith("fd00:")
    ) {
      return false;
    }

    if (host.startsWith("::ffff:") || host.startsWith("0:0:0:0:0:ffff:")) {
      const mapped = host.split(":").pop() || "";
      if (mapped) {
        return isSafePublicUrl(`http://${mapped}`);
      }
      return false;
    }

    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      for (let i = 1; i <= 4; i++) {
        const seg = ipv4Match[i];
        if (seg.length > 1 && seg.startsWith("0")) return false; // Notación octal
      }
      const o1 = parseInt(ipv4Match[1], 10);
      const o2 = parseInt(ipv4Match[2], 10);
      if (o1 === 127) return false;
      if (o1 === 10) return false;
      if (o1 === 0) return false;
      if (o1 === 169 && o2 === 254) return false;
      if (o1 === 192 && o2 === 168) return false;
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return false;
    }

    if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function streamToBuffer(stream: any, maxBytes = 15 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new Error(`El archivo multimedia supera el límite de seguridad de ${Math.round(maxBytes / (1024 * 1024))}MB.`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

const PROJECT_ROOT = process.cwd();
const BIN_DIR = path.join(PROJECT_ROOT, "bin");
const TEMP_DIR = path.join(PROJECT_ROOT, "temp");
const YT_DLP_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp_linux";
const LOCAL_YT_DLP_PATH = path.join(BIN_DIR, YT_DLP_NAME);
const FFMPEG_PATH = ffmpegInstaller.path;
const MAX_WHATSAPP_BYTES = 50 * 1024 * 1024;
const YT_DLP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function ensureYtDlpBinary(): Promise<string> {
  if (fs.existsSync(LOCAL_YT_DLP_PATH)) {
    try {
      const stats = fs.statSync(LOCAL_YT_DLP_PATH);
      const isFresh = Date.now() - stats.mtimeMs < YT_DLP_MAX_AGE_MS;
      if (stats.size > 10 * 1024 * 1024 && isFresh) {
        if (process.platform !== "win32") {
          try {
            fs.chmodSync(LOCAL_YT_DLP_PATH, 0o755);
          } catch {}
        }
        return LOCAL_YT_DLP_PATH;
      }
      if (stats.size <= 10 * 1024 * 1024) {
        console.warn(`[Media Service] Binario yt-dlp incompleto (${stats.size} bytes). Re-descargando...`);
        try {
          fs.unlinkSync(LOCAL_YT_DLP_PATH);
        } catch {}
      }
    } catch {}
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const urls = [
    `https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/${YT_DLP_NAME}`,
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_NAME}`,
  ];

  let lastError: unknown;
  for (const downloadUrl of urls) {
    const tempPath = `${LOCAL_YT_DLP_PATH}.tmp_${Date.now()}`;
    try {
      console.log(`[Media Service] Descargando binario yt-dlp (${YT_DLP_NAME}) desde ${downloadUrl}...`);
      const response = await axios.get(downloadUrl, {
        responseType: "stream",
        timeout: 120000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        maxRedirects: 10,
      });

      await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        writer.on("finish", () => {
          writer.close();
          resolve();
        });
        writer.on("error", (err) => {
          writer.close();
          try {
            fs.unlinkSync(tempPath);
          } catch {}
          reject(err);
        });
      });

      if (fs.existsSync(LOCAL_YT_DLP_PATH)) {
        try {
          fs.unlinkSync(LOCAL_YT_DLP_PATH);
        } catch {}
      }
      fs.renameSync(tempPath, LOCAL_YT_DLP_PATH);

      if (process.platform !== "win32") {
        fs.chmodSync(LOCAL_YT_DLP_PATH, 0o755);
      }

      console.log(`[Media Service] Binario yt-dlp listo en: ${LOCAL_YT_DLP_PATH}`);
      return LOCAL_YT_DLP_PATH;
    } catch (err) {
      lastError = err;
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }
  }

  if (fs.existsSync(LOCAL_YT_DLP_PATH)) {
    return LOCAL_YT_DLP_PATH;
  }
  throw lastError;
}

export function ensureCookiesFile(): string {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const runtimeCookiesPath = path.join(TEMP_DIR, "runtime_cookies.txt");
  const rootCookiesPath = path.join(PROJECT_ROOT, "cookies.txt");
  const secretPath = "/etc/secrets/cookies.txt";

  let baseContent = "";

  if (fs.existsSync(secretPath)) {
    try {
      const stats = fs.statSync(secretPath);
      if (stats.size > 30) {
        baseContent = fs.readFileSync(secretPath, "utf-8");
      }
    } catch {}
  }

  if (!baseContent && process.env.COOKIES_TXT) {
    try {
      const raw = process.env.COOKIES_TXT.trim();
      baseContent = raw.startsWith("base64:")
        ? Buffer.from(raw.slice(7), "base64").toString("utf-8")
        : raw;
      baseContent = baseContent.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    } catch {}
  }

  if (!baseContent && fs.existsSync(rootCookiesPath)) {
    try {
      baseContent = fs.readFileSync(rootCookiesPath, "utf-8");
    } catch {}
  }

  const entries: string[] = [];

  if (process.env.YOUTUBE_COOKIES) {
    const raw = process.env.YOUTUBE_COOKIES.trim().replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    if (raw.includes("\t")) {
      entries.push(raw);
    } else {
      const pairs = raw.split(";").map((p) => p.trim()).filter(Boolean);
      for (const pair of pairs) {
        const [k, ...vParts] = pair.split("=");
        const v = vParts.join("=");
        if (k && v) {
          entries.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`);
          entries.push(`.google.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`);
        }
      }
    }
  }

  if (process.env.INSTAGRAM_COOKIES) {
    const raw = process.env.INSTAGRAM_COOKIES.trim().replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    if (raw.includes("\t")) {
      entries.push(raw);
    } else {
      const pairs = raw.split(";").map((p) => p.trim()).filter(Boolean);
      for (const pair of pairs) {
        const [k, ...vParts] = pair.split("=");
        const v = vParts.join("=");
        if (k && v) {
          entries.push(`.instagram.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`);
        }
      }
    }
  }

  const combined = [baseContent.trim(), ...entries].filter(Boolean).join("\n");
  if (!combined) {
    return runtimeCookiesPath;
  }

  const seen = new Set<string>();
  const cleanLines = ["# Netscape HTTP Cookie File"];
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length >= 7) {
      const key = `${parts[0]}\t${parts[2]}\t${parts[5]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cleanLines.push(parts.slice(0, 7).join("\t"));
    }
  }

  if (cleanLines.length > 1) {
    try {
      fs.writeFileSync(runtimeCookiesPath, `${cleanLines.join("\n")}\n`, "utf-8");
    } catch {}
  }

  return runtimeCookiesPath;
}

function hasUsableYouTubeCookies(cookiesPath: string): boolean {
  if (!process.env.COOKIES_TXT && !process.env.YOUTUBE_COOKIES && !fs.existsSync("/etc/secrets/cookies.txt")) {
    return false;
  }
  try {
    if (!fs.existsSync(cookiesPath)) return false;
    const content = fs.readFileSync(cookiesPath, "utf-8");
    return content.includes(".youtube.com") && (content.includes("SAPISID") || content.includes("PSID"));
  } catch {
    return false;
  }
}

export async function downloadWithYtDlp(
  url: string,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const binaryPath = await ensureYtDlpBinary();

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const filePrefix = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPattern = path.join(TEMP_DIR, `${filePrefix}.%(ext)s`);

  const cookiesPath = ensureCookiesFile();

  const args = [
    "-4",
    "--no-playlist",
    "--no-warnings",
    "--max-filesize",
    "50M",
    "-f",
    "b[ext=mp4]/b/bv*[ext=mp4]+ba[ext=m4a]/best",
    "-N",
    "8",
    "--http-chunk-size",
    "10M",
    "--buffer-size",
    "16M",
    "--remux-video",
    "mp4",
    "--postprocessor-args",
    "Merger:-c copy -threads 0",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "--add-header",
    "Accept-Language:en-US,en;q=0.9",
    "--js-runtimes",
    "node",
    "-o",
    outPattern,
  ];

  if (FFMPEG_PATH && fs.existsSync(FFMPEG_PATH)) {
    args.push("--ffmpeg-location", FFMPEG_PATH);
  }

  if (fs.existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  } else if (process.env.BROWSER_COOKIES) {
    args.push("--cookies-from-browser", process.env.BROWSER_COOKIES.trim());
  }

  if (!isSafePublicUrl(url)) {
    return {
      type: "video",
      errorNotice: "❌ URL no permitida por razones de seguridad.",
    };
  }

  args.push("--", url);

  try {
    await execFileAsync(binaryPath, args, { timeout: 90000 });

    const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
    if (files.length === 0) {
      return null;
    }

    const downloadedPath = path.join(TEMP_DIR, files[0]);
    const buffer = fs.readFileSync(downloadedPath);

    try {
      for (const f of files) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
    } catch {}

    const ext = path.extname(files[0]).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);

    return {
      buffer,
      type: isImage ? "image" : "video",
      caption: defaultCaption,
    };
  } catch (error: any) {
    const stderr = (error?.stderr || error?.message || "").toString();

    try {
      const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
      for (const f of files) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
    } catch {}

    if (stderr.includes("larger than max-filesize") || stderr.includes("File is larger than")) {
      return {
        type: "video",
        errorNotice: "❌ El contenido excede el límite de 50 MB permitido por WhatsApp.",
      };
    }

    return null;
  }
}

function extractYouTubeId(urlOrQuery: string): string | null {
  const match = urlOrQuery.match(
    /(?:youtu\.be\/|(?:music\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

async function searchYouTubeVideoId(query: string): Promise<string | null> {
  try {
    const res = await axios.post(
      "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
      {
        query,
        params: "EgIQAQ%3D%3D",
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "es",
          },
        },
      },
      {
        headers: {
          "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );
    const raw = JSON.stringify(res.data);
    const match = raw.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {}
  return null;
}

async function downloadStreamChunked(url: string, contentLength: number, userAgent: string): Promise<Buffer> {
  let totalLength = contentLength;
  if (!totalLength || totalLength <= 0) {
    const clenMatch = url.match(/[?&]clen=(\d+)/);
    if (clenMatch) {
      totalLength = parseInt(clenMatch[1], 10);
    }
  }

  if (totalLength > MAX_WHATSAPP_BYTES) {
    throw new Error("MAX_FILESIZE_EXCEEDED");
  }

  if (!totalLength || totalLength <= 0 || !url.includes("googlevideo.com")) {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      headers: { "User-Agent": userAgent },
      timeout: 30000,
      maxContentLength: MAX_WHATSAPP_BYTES,
      maxBodyLength: MAX_WHATSAPP_BYTES,
    });
    return Buffer.from(res.data);
  }

  const chunkSize = 5 * 1024 * 1024;
  const buffers: Buffer[] = [];
  let totalBytes = 0;

  for (let start = 0; start < totalLength; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, totalLength - 1);
    const sep = url.includes("?") ? "&" : "?";
    const res = await axios.get(`${url}${sep}range=${start}-${end}`, {
      responseType: "arraybuffer",
      headers: { "User-Agent": userAgent },
      timeout: 20000,
    });
    const chunk = Buffer.from(res.data);
    totalBytes += chunk.length;
    if (totalBytes > MAX_WHATSAPP_BYTES) {
      throw new Error("MAX_FILESIZE_EXCEEDED");
    }
    buffers.push(chunk);
  }

  return Buffer.concat(buffers);
}

async function convertBufferToMp3(inputBuffer: Buffer, ext = "m4a"): Promise<Buffer> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const id = `aud_conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(TEMP_DIR, `${id}.${ext}`);
  const outPath = path.join(TEMP_DIR, `${id}_out.m4a`);

  try {
    fs.writeFileSync(inPath, inputBuffer);
    const codecArgs =
      ext === "webm"
        ? ["-c:a", "aac", "-b:a", "128k"]
        : ["-c:a", "copy"];
    await execFileAsync(
      FFMPEG_PATH,
      ["-y", "-nostdin", "-loglevel", "error", "-i", inPath, "-vn", ...codecArgs, "-movflags", "+faststart", "-f", "ipod", outPath],
      { timeout: 25000 }
    );
    return fs.readFileSync(outPath);
  } finally {
    try {
      if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
    } catch {}
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  }
}

async function muxVideoAndAudioToMp4(videoBuffer: Buffer, audioBuffer: Buffer): Promise<Buffer> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const id = `vid_mux_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const vPath = path.join(TEMP_DIR, `${id}_v.mp4`);
  const aPath = path.join(TEMP_DIR, `${id}_a.m4a`);
  const outPath = path.join(TEMP_DIR, `${id}_out.mp4`);

  try {
    fs.writeFileSync(vPath, videoBuffer);
    fs.writeFileSync(aPath, audioBuffer);
    await execFileAsync(
      FFMPEG_PATH,
      ["-y", "-nostdin", "-loglevel", "error", "-i", vPath, "-i", aPath, "-c", "copy", "-movflags", "+faststart", "-threads", "0", outPath],
      { timeout: 45000 }
    );
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [vPath, aPath, outPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}

let cachedVisitorData = "";
let cachedVisitorDataExpiry = 0;

async function getYouTubeVisitorData(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedVisitorData && Date.now() < cachedVisitorDataExpiry) {
    return cachedVisitorData;
  }
  try {
    const res = await axios.post(
      "https://www.youtube.com/youtubei/v1/guide?prettyPrint=false",
      {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20261015.01.00",
          },
        },
      },
      { timeout: 5000 }
    );
    const visitor = res.data?.responseContext?.visitorData;
    if (typeof visitor === "string" && visitor.length > 5) {
      cachedVisitorData = visitor;
      cachedVisitorDataExpiry = Date.now() + 20 * 60 * 1000;
      return visitor;
    }
  } catch {}
  return "";
}

async function downloadYouTubeInnerTube(
  videoId: string,
  audioOnly: boolean,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const mediaType = audioOnly ? "audio" : "video";
  const mediaName = audioOnly ? "El audio" : "El video";
  const visitorData = await getYouTubeVisitorData();

  const clients = [
    {
      name: "VISIONOS",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      context: {
        clientName: "VISIONOS",
        clientVersion: "0.1",
        deviceMake: "Apple",
        deviceModel: "RealityDevice14,1",
        osName: "visionOS",
        osVersion: "1.3.21O771",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
        ...(visitorData ? { visitorData } : {}),
      },
    },
    {
      name: "VISIONOS_NO_VD",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      context: {
        clientName: "VISIONOS",
        clientVersion: "0.1",
        deviceMake: "Apple",
        deviceModel: "RealityDevice14,1",
        osName: "visionOS",
        osVersion: "1.3.21O771",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    {
      name: "IOS",
      ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
      context: {
        clientName: "IOS",
        clientVersion: "20.10.4",
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        osName: "iPhone",
        osVersion: "18.3.2.22D82",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    {
      name: "ANDROID",
      ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      context: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 30,
        userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
  ];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    try {
      const res = await axios.post(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: { client: client.context },
        },
        {
          headers: {
            "User-Agent": client.ua,
            "Content-Type": "application/json",
            ...(client.name === "VISIONOS" && visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
          },
          timeout: 8000,
        }
      );

      const data = res.data;
      const playStatus = data?.playabilityStatus?.status;
      const playReason = (data?.playabilityStatus?.reason || "").toString();

      if (playStatus === "LOGIN_REQUIRED" && /private|privado/i.test(playReason)) {
        return {
          type: mediaType,
          errorNotice: "❌ El video es privado y no se puede descargar.",
        };
      }

      if (playStatus === "LOGIN_REQUIRED" && /age|edad/i.test(playReason)) {
        break;
      }

      if (playStatus === "ERROR" && /unavailable|no está disponible|removed|deleted/i.test(playReason)) {
        return {
          type: mediaType,
          errorNotice: "❌ El video no está disponible o fue eliminado de YouTube.",
        };
      }

      if (playStatus !== "OK") {
        continue;
      }

      const details = data?.videoDetails;
      if (details?.isLiveContent && details?.isLive) {
        return {
          type: mediaType,
          errorNotice: "❌ No se pueden descargar transmisiones en vivo en curso.",
        };
      }

      const title: string | undefined = details?.title;
      const formats: any[] = data?.streamingData?.formats || [];
      const adaptive: any[] = data?.streamingData?.adaptiveFormats || [];

      if (audioOnly) {
        const audioCandidates = adaptive.filter(
          (f) => f.url && typeof f.mimeType === "string" && f.mimeType.startsWith("audio/")
        );
        const preferredAudio =
          audioCandidates.find((f) => f.itag === 140) ||
          audioCandidates.find((f) => f.itag === 139) ||
          audioCandidates.find((f) => f.mimeType.startsWith("audio/mp4")) ||
          audioCandidates.find((f) => f.itag === 251 || f.itag === 250 || f.itag === 249) ||
          audioCandidates[0];

        if (!preferredAudio) continue;

        const audioLen = parseInt(preferredAudio.contentLength || "0", 10);
        if (audioLen > MAX_WHATSAPP_BYTES) {
          return {
            type: "audio",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        const rawAudio = await downloadStreamChunked(preferredAudio.url, audioLen, client.ua);
        const ext = preferredAudio.mimeType.includes("webm") ? "webm" : "m4a";
        const mp3Buffer = await convertBufferToMp3(rawAudio, ext);

        if (mp3Buffer.length > MAX_WHATSAPP_BYTES) {
          return {
            type: "audio",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        return {
          buffer: mp3Buffer,
          type: "audio",
          title: title || defaultCaption,
          caption: defaultCaption || title || "Audio de YouTube",
        };
      }

      const h264Candidates = adaptive
        .filter(
          (f) =>
            f.url &&
            typeof f.mimeType === "string" &&
            f.mimeType.startsWith("video/mp4") &&
            f.mimeType.includes("avc1") &&
            typeof f.height === "number" &&
            f.height <= 720
        )
        .sort((a, b) => b.height - a.height);

      const audioTrack =
        adaptive.find((f) => f.url && f.itag === 140) ||
        adaptive.find((f) => f.url && f.itag === 139) ||
        adaptive.find((f) => f.url && typeof f.mimeType === "string" && f.mimeType.startsWith("audio/mp4"));

      if (h264Candidates.length > 0 && audioTrack) {
        const audioLen = parseInt(audioTrack.contentLength || "0", 10);
        const validPairs = h264Candidates.filter((v) => {
          const vLen = parseInt(v.contentLength || "0", 10);
          return vLen > 0 && vLen + audioLen <= MAX_WHATSAPP_BYTES;
        });

        if (validPairs.length === 0 && h264Candidates.some((v) => parseInt(v.contentLength || "0", 10) > 0)) {
          return {
            type: "video",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        const chosenVideo =
          validPairs.find((v) => v.height === 720 && parseInt(v.contentLength || "0", 10) + audioLen <= 18 * 1024 * 1024) ||
          validPairs.find((v) => v.height === 480) ||
          validPairs.find((v) => v.height === 720) ||
          validPairs[0];

        if (chosenVideo) {
          const vLen = parseInt(chosenVideo.contentLength || "0", 10);
          const [vBuf, aBuf] = await Promise.all([
            downloadStreamChunked(chosenVideo.url, vLen, client.ua),
            downloadStreamChunked(audioTrack.url, audioLen, client.ua),
          ]);
          const mp4Buffer = await muxVideoAndAudioToMp4(vBuf, aBuf);

          if (mp4Buffer.length > MAX_WHATSAPP_BYTES) {
            return {
              type: "video",
              errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
            };
          }

          return {
            buffer: mp4Buffer,
            type: "video",
            title: title || defaultCaption,
            caption: defaultCaption || title || "Acá tenés el video de YouTube",
          };
        }
      }

      const directMp4 = formats.find(
        (f) =>
          f.url &&
          typeof f.mimeType === "string" &&
          f.mimeType.startsWith("video/mp4") &&
          (!f.height || f.height <= 720)
      );

      if (directMp4) {
        const dLen = parseInt(directMp4.contentLength || "0", 10);
        if (dLen > MAX_WHATSAPP_BYTES) {
          return {
            type: "video",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }
        const mp4Buffer = await downloadStreamChunked(directMp4.url, dLen, client.ua);
        return {
          buffer: mp4Buffer,
          type: "video",
          title: title || defaultCaption,
          caption: defaultCaption || title || "Acá tenés el video de YouTube",
        };
      }
    } catch (err: any) {
      if (err?.message === "MAX_FILESIZE_EXCEEDED") {
        return {
          type: mediaType,
          errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
        };
      }
    }
  }

  return null;
}

async function downloadYouTubeApi(
  input: string,
  audioOnly = false,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  try {
    const trimmed = input.trim();
    const ytId = extractYouTubeId(trimmed);
    const isUrl = /^https?:\/\//i.test(trimmed);
    let targetUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : trimmed;

    const btch: any = await import("btch-downloader");

    if (!isUrl && !ytId) {
      const searchRes = await btch.yts(trimmed);
      const list: any[] = searchRes?.result?.videos || searchRes?.result?.all || [];
      const firstVideo = list.find((item: any) => (!item.type || item.type === "video") && item.url);
      if (firstVideo?.url) {
        targetUrl = firstVideo.url;
      } else {
        return null;
      }
    }

    const data = await btch.youtube(targetUrl);
    if (data?.status && (data.mp4 || data.mp3)) {
      const mediaUrl = data.mp4 || data.mp3;
      if (mediaUrl && typeof mediaUrl === "string" && mediaUrl.startsWith("http")) {
        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
        const rawBuf = await downloadStreamChunked(mediaUrl, 0, ua);
        if (audioOnly) {
          const isWebm = mediaUrl.includes("mime=audio%2Fwebm") || mediaUrl.includes("mime=audio/webm");
          const ext = isWebm ? "webm" : "mp4";
          const mp3Buffer = await convertBufferToMp3(rawBuf, ext);
          return {
            buffer: mp3Buffer,
            type: "audio",
            title: data.title,
            caption: defaultCaption || data.title || "Audio de YouTube",
          };
        }

        return {
          buffer: rawBuf,
          type: "video",
          title: data.title,
          caption: defaultCaption || data.title || "Acá tenés el video de YouTube",
        };
      }
    }
  } catch (err: any) {
    if (err?.message === "MAX_FILESIZE_EXCEEDED") {
      const mediaType = audioOnly ? "audio" : "video";
      const mediaName = audioOnly ? "El audio" : "El video";
      return {
        type: mediaType,
        errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
      };
    }
  }
  return null;
}

async function downloadYouTubeWithYtDlp(
  input: string,
  audioOnly: boolean,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const trimmed = input.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  let ytId = extractYouTubeId(trimmed);

  if (!ytId && !isUrl) {
    ytId = await searchYouTubeVideoId(trimmed);
  }

  if (ytId) {
    const fastResult = await downloadYouTubeInnerTube(ytId, audioOnly, defaultCaption);
    if (fastResult) return fastResult;
  }

  const apiResult = await downloadYouTubeApi(ytId ? `https://www.youtube.com/watch?v=${ytId}` : trimmed, audioOnly, defaultCaption);
  if (apiResult) return apiResult;

  if ((isUrl || ytId) && process.env.COBALT_API_URL) {
    try {
      const targetUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : trimmed;
      const cobalt = await downloadWithCobalt(targetUrl, audioOnly ? { audioOnly: true } : undefined);
      if (cobalt) {
        if (defaultCaption) cobalt.caption = defaultCaption;
        return cobalt;
      }
    } catch {}
  }

  const binaryPath = await ensureYtDlpBinary();
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const target = ytId ? `https://www.youtube.com/watch?v=${ytId}` : isUrl ? trimmed : `ytsearch1:${trimmed}`;
  const filePrefix = `yt_${audioOnly ? "aud" : "vid"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPattern = path.join(TEMP_DIR, `${filePrefix}.%(ext)s`);
  const cookiesPath = ensureCookiesFile();
  const useCookies = hasUsableYouTubeCookies(cookiesPath);

  const formatArgs = audioOnly
    ? [
        "-f", "ba[ext=m4a]/ba[acodec^=mp4a]/ba/b[height<=480]",
        "-x", "--audio-format", "m4a",
      ]
    : [
        "-f", "bv*[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][height<=720]/bv*[height<=720]+ba/b[height<=720]",
        "--merge-output-format", "mp4",
        "--postprocessor-args", "Merger:-c copy -movflags +faststart -threads 0",
      ];

  const extractorArgs = useCookies
    ? "youtube:player_client=tv,web,mweb"
    : "youtube:player_client=visionos,ios,android;player_skip=webpage,configs";

  const args = [
    "-4",
    "--no-playlist",
    "--no-warnings",
    "--max-filesize", "50M",
    ...formatArgs,
    "-N", "4",
    "--http-chunk-size", "5M",
    "--buffer-size", "16M",
    "--js-runtimes", "node",
    "--extractor-args", extractorArgs,
    "--print", "after_move:%(title)s",
    "-o", outPattern,
  ];

  if (FFMPEG_PATH && fs.existsSync(FFMPEG_PATH)) {
    if (process.platform !== "win32") {
      try { fs.chmodSync(FFMPEG_PATH, 0o755); } catch {}
    }
    args.push("--ffmpeg-location", FFMPEG_PATH);
  }

  if (useCookies) {
    args.push("--cookies", cookiesPath);
  }

  if (isUrl && !isSafePublicUrl(trimmed)) {
    return {
      type: audioOnly ? "audio" : "video",
      errorNotice: "❌ URL no permitida por razones de seguridad.",
    };
  }

  args.push("--", target);

  try {
    const { stdout } = await execFileAsync(binaryPath, args, { timeout: 90000 });
    const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
    if (files.length === 0) return null;

    const downloadedPath = path.join(TEMP_DIR, files[0]);
    const buffer = fs.readFileSync(downloadedPath);
    try {
      for (const f of files) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
    } catch {}

    const title = stdout ? stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] : undefined;
    const mediaType = audioOnly ? "audio" : "video";
    const defaultText = audioOnly ? "Audio de YouTube" : "Acá tenés el video de YouTube";

    return {
      buffer,
      type: mediaType,
      title: title || defaultCaption,
      caption: title || defaultCaption || defaultText,
    };
  } catch (error: any) {
    const stderr = (error?.stderr || error?.message || "").toString();
    try {
      const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
      for (const f of files) fs.unlinkSync(path.join(TEMP_DIR, f));
    } catch {}

    const mediaType = audioOnly ? "audio" : "video";
    const mediaName = audioOnly ? "El audio" : "El video";

    if (stderr.includes("larger than max-filesize") || stderr.includes("File is larger than")) {
      return {
        type: mediaType,
        errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
      };
    }

    if (/Private video|This video is private/i.test(stderr)) {
      return {
        type: mediaType,
        errorNotice: "❌ El video es privado y no se puede descargar.",
      };
    }

    if (/Video unavailable|This video is unavailable|has been removed/i.test(stderr)) {
      return {
        type: mediaType,
        errorNotice: "❌ El video no está disponible o fue eliminado de YouTube.",
      };
    }

    if (stderr.includes("Sign in to confirm") || stderr.includes("bot")) {
      return {
        type: mediaType,
        errorNotice:
          "⚠️ *Bloqueo de YouTube en el servidor:*\nYouTube requiere verificación para descargas desde la IP del servidor. Podés configurar la variable `COOKIES_TXT` o `YOUTUBE_COOKIES` en las variables de entorno de Render para desbloquearlo.",
      };
    }

    console.error(`[Media Service] Error al descargar ${mediaType} de YouTube:`, {
      message: error?.message,
      stderr,
    });
    return null;
  }
}

export async function downloadYouTubeVideo(
  input: string,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  return downloadYouTubeWithYtDlp(input, false, defaultCaption);
}

export async function downloadYouTubeAudio(
  input: string,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  return downloadYouTubeWithYtDlp(input, true, defaultCaption);
}

export async function downloadTikTok(rawUrl: string): Promise<MediaDownloadResult | null> {
  const url = rawUrl.trim();
  if (!/tiktok\.com/i.test(url)) return null;

  try {
    const response = await axios.post(
      "https://www.tikwm.com/api/",
      new URLSearchParams({ url, count: "12", cursor: "0", web: "1", hd: "1" }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      }
    );

    const data = response.data;
    if (data?.code === 0 && data?.data) {
      let playUrl = data.data.play || data.data.hdplay;
      if (playUrl && playUrl.startsWith("/")) {
        playUrl = `https://www.tikwm.com${playUrl}`;
      }
      if (playUrl) {
        return {
          url: playUrl,
          type: "video",
          caption: data.data.title || "Acá tenés el TikTok",
        };
      }
    }
  } catch (error) {
    console.error("[Media Service] Falló TikWM, intentando respaldo con yt-dlp:", error);
  }

  return await downloadWithYtDlp(url, "Acá tenés el TikTok");
}

export async function downloadFacebook(rawUrl: string): Promise<MediaDownloadResult | null> {
  const url = rawUrl.trim();
  if (!/(?:facebook\.com|fb\.watch)/i.test(url)) return null;

  return await downloadWithYtDlp(url, "Acá tenés el video de Facebook");
}

export async function downloadTwitter(rawUrl: string): Promise<MediaDownloadResult | null> {
  const url = rawUrl.trim();
  if (!/(?:twitter\.com|x\.com)/i.test(url)) return null;

  const dlResult = await downloadWithYtDlp(url, "Acá tenés el video de X/Twitter");
  if (dlResult && dlResult.buffer) {
    return dlResult;
  }

  const match = url.match(/(?:twitter\.com|x\.com)\/(?:[a-zA-Z0-9_]+)\/status\/(\d+)/i);
  if (match) {
    const tweetId = match[1];
    try {
      const res = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, {
        headers: {
          "User-Agent": "TelegramBot (like TwitterBot)",
        },
        timeout: 10000,
      });

      const tweet = res.data?.tweet;
      if (tweet?.media?.photos && tweet.media.photos.length > 0) {
        return {
          url: tweet.media.photos[0].url,
          type: "image",
          caption: tweet.text ? `"${tweet.text.slice(0, 150)}..."` : "Acá tenés la imagen de X/Twitter",
        };
      }

      if (tweet?.media?.videos && tweet.media.videos.length > 0) {
        return {
          url: tweet.media.videos[0].url,
          type: "video",
          caption: tweet.text ? `"${tweet.text.slice(0, 150)}..."` : "Acá tenés el video de X/Twitter",
        };
      }
    } catch {
      // noop
    }
  }

  return dlResult;
}

export async function resolveInstagramRedirects(rawUrl: string): Promise<string> {
  if (!/(?:instagram\.com|instagr\.am)\/share\//i.test(rawUrl)) {
    return rawUrl;
  }
  if (!isSafePublicUrl(rawUrl)) return rawUrl;
  try {
    const res = await axios.get(rawUrl, {
      maxRedirects: 5,
      timeout: 8000,
      maxContentLength: 1024 * 1024,
      beforeRedirect: (options: any) => {
        if (options?.href && !isSafePublicUrl(options.href)) {
          throw new Error("Redirección bloqueada por política SSRF.");
        }
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      validateStatus: (status: number) => status < 400,
    });
    if (res.request?.res?.responseUrl && isSafePublicUrl(res.request.res.responseUrl)) {
      return res.request.res.responseUrl;
    }
  } catch {
    // Si falla la resolución de la redirección, continuar con la url original
  }
  return rawUrl;
}

export function normalizeInstagramUrl(rawUrl: string): string {
  let url = rawUrl.trim();

  // 1. Convertir links de compartir de la app móvil (/share/reel/, /share/r/, /share/p/) a rutas estándar
  const shareMatch = url.match(/(?:instagram\.com|instagr\.am)\/share\/(reel|r|p)\/([a-zA-Z0-9_-]+)/i);
  if (shareMatch) {
    const type = shareMatch[1].toLowerCase() === "p" ? "p" : "reel";
    return `https://www.instagram.com/${type}/${shareMatch[2]}/`;
  }

  // 2. Normalizar reels plural
  const reelsMatch = url.match(/(?:instagram\.com|instagr\.am)\/reels\/([a-zA-Z0-9_-]+)/i);
  if (reelsMatch) {
    return `https://www.instagram.com/reel/${reelsMatch[1]}/`;
  }

  // 3. Normalizar reel singular, post o tv
  const standardMatch = url.match(/(?:instagram\.com|instagr\.am)\/(reel|p|tv)\/([a-zA-Z0-9_-]+)/i);
  if (standardMatch) {
    return `https://www.instagram.com/${standardMatch[1]}/${standardMatch[2]}/`;
  }

  // 4. Limpiar query params de tracking si es instagram
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("instagram.com") || parsed.hostname.includes("instagr.am")) {
      parsed.search = "";
      return parsed.toString();
    }
  } catch {
    // Si falla el parseo, devolver url limpia
  }

  return url;
}

export async function scrapeInstagramOg(url: string): Promise<MediaDownloadResult | null> {
  if (!isSafePublicUrl(url)) return null;
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024,
    });

    const html = res.data;
    if (typeof html !== "string") return null;

    // Buscar og:video si existe
    const videoMatch =
      html.match(/<meta\s+(?:property|name)=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["']\s+(?:property|name)=["']og:video(?::secure_url)?["']/i);

    // Buscar og:image
    const imageMatch =
      html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);

    // Buscar descripción
    const descMatch =
      html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/i);

    const caption = descMatch
      ? descMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      : undefined;

    if (videoMatch && videoMatch[1]) {
      const videoUrl = videoMatch[1].replace(/&amp;/g, "&");
      if (!isSafePublicUrl(videoUrl)) return null;
      const videoRes = await axios.get(videoUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: MAX_WHATSAPP_BYTES,
        maxBodyLength: MAX_WHATSAPP_BYTES,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      });
      return {
        buffer: Buffer.from(videoRes.data),
        type: "video",
        caption: caption || "Acá tenés el video de Instagram",
      };
    }

    if (imageMatch && imageMatch[1]) {
      const imageUrl = imageMatch[1].replace(/&amp;/g, "&");
      if (!isSafePublicUrl(imageUrl)) return null;
      const imgRes = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: 20 * 1024 * 1024,
        maxBodyLength: 20 * 1024 * 1024,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      });
      return {
        buffer: Buffer.from(imgRes.data),
        type: "image",
        caption: caption || "Acá tenés la imagen de Instagram",
      };
    }
  } catch {
    // Continuar al siguiente fallback
  }

  return null;
}

export async function downloadInstagram(rawUrl: string): Promise<MediaDownloadResult | null> {
  const resolvedUrl = await resolveInstagramRedirects(rawUrl);
  const url = normalizeInstagramUrl(resolvedUrl);
  if (!/(?:instagram\.com|instagr\.am)/i.test(url)) return null;

  // 1. Intentar con yt-dlp usando la URL normalizada
  const dlResult = await downloadWithYtDlp(url, "Acá tenés el contenido de Instagram");
  if (dlResult && (dlResult.buffer || dlResult.url)) {
    return dlResult;
  }

  // 2. Si yt-dlp falló (ej: post de foto/carrusel o bloqueo de video), intentar scraper de OpenGraph
  const ogResult = await scrapeInstagramOg(url);
  if (ogResult && (ogResult.buffer || ogResult.url)) {
    return ogResult;
  }

  // 3. Fallback con Cobalt si está configurado
  const cobaltResult = await downloadWithCobalt(url);
  if (cobaltResult) {
    return cobaltResult;
  }

  // 4. Si todas las opciones fallan
  return {
    type: "video",
    errorNotice:
      "⚠️ *No se pudo descargar de Instagram:*\nInstagram bloqueó las descargas anónimas para este enlace o requiere sesión. Podés colocar un archivo `cookies.txt` en la raíz del bot o configurar `INSTAGRAM_COOKIES` en `.env` para desbloquearlo.",
  };
}

export async function downloadWithCobalt(
  rawUrl: string,
  options?: { audioOnly?: boolean }
): Promise<MediaDownloadResult | null> {
  const url = rawUrl.trim();
  const instances = process.env.COBALT_API_URL
    ? [process.env.COBALT_API_URL]
    : [];

  if (instances.length === 0) return null;

  const isAudio = options?.audioOnly ?? false;

  for (const instance of instances) {
    try {
      const payload: Record<string, any> = {
        url,
        filenameStyle: "basic",
      };

      if (isAudio) {
        payload.downloadMode = "audio";
        payload.audioFormat = "mp3";
      } else {
        payload.videoQuality = "720";
      }

      const res = await axios.post(
        instance,
        payload,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "EmpyBot/1.0",
          },
          timeout: 6000,
        }
      );

      const data = res.data;
      if (data?.url) {
        return {
          url: data.url,
          type: isAudio ? "audio" : "video",
          caption: isAudio ? "Audio descargado" : "Acá tenés tu video descargado",
        };
      } else if (data?.picker && Array.isArray(data.picker) && data.picker.length > 0) {
        const first = data.picker[0];
        return {
          url: first.url,
          type: first.type === "photo" ? "image" : (isAudio ? "audio" : "video"),
          caption: "Acá tenés el contenido descargado",
        };
      }
    } catch {
      // Ignorar fallos de instancia
    }
  }

  return null;
}

export async function downloadUniversalMedia(rawUrl: string): Promise<MediaDownloadResult | null> {
  const url = rawUrl.trim();

  if (!isSafePublicUrl(url)) {
    return {
      type: "video",
      errorNotice: "❌ URL no permitida por razones de seguridad.",
    };
  }

  // 1. YouTube
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) {
    return await downloadYouTubeVideo(url);
  }

  // 2. Handlers específicos optimizados por plataforma (alta velocidad)
  if (/tiktok\.com/i.test(url)) {
    const res = await downloadTikTok(url);
    if (res) return res;
  }

  if (/(?:twitter\.com|x\.com)/i.test(url)) {
    const res = await downloadTwitter(url);
    if (res) return res;
  }

  if (/(?:facebook\.com|fb\.watch)/i.test(url)) {
    const res = await downloadFacebook(url);
    if (res) return res;
  }

  if (/(?:instagram\.com|instagr\.am)/i.test(url)) {
    return await downloadInstagram(url);
  }

  // 2. Intentar con instancia privada de Cobalt si está configurada
  const cobaltResult = await downloadWithCobalt(url);
  if (cobaltResult) {
    return cobaltResult;
  }

  // 3. Fallback universal con yt-dlp
  return await downloadWithYtDlp(url);
}