import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import dns from "dns";
import fs from "fs";
import path from "path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Ytdl, createPoTokenProvider, Quality, Client } from "@distube/ytdl-core";

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
      host === "metadata.google.internal" ||
      host.endsWith(".nip.io") ||
      host.endsWith(".sslip.io") ||
      host.endsWith(".localtest.me") ||
      host.endsWith(".vcap.me") ||
      host.endsWith(".lvh.me")
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
      if (o1 === 192 && o2 === 0) return false;
      if (o1 === 198 && (o2 === 18 || o2 === 19 || o2 === 51)) return false;
      if (o1 === 203 && o2 === 0) return false;
      if (o1 >= 224) return false; // Multicast y Experimental
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

  const decodeCookieEnv = (rawVal: string): string => {
    const trimmed = rawVal.trim();
    const decoded = trimmed.startsWith("base64:")
      ? Buffer.from(trimmed.slice(7), "base64").toString("utf-8")
      : trimmed;
    return decoded.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  };

  const entries: string[] = [];

  if (process.env.YOUTUBE_COOKIES) {
    const raw = decodeCookieEnv(process.env.YOUTUBE_COOKIES);
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
    const raw = decodeCookieEnv(process.env.INSTAGRAM_COOKIES);
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
    const isHttpOnly = line.startsWith("#HttpOnly_");
    if (!line || (line.startsWith("#") && !isHttpOnly)) continue;
    const normalizedLine = isHttpOnly ? line.slice("#HttpOnly_".length) : line;
    const parts = normalizedLine.split("\t");
    if (parts.length >= 7) {
      const key = `${parts[0]}\t${parts[2]}\t${parts[5]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const outDomain = isHttpOnly ? `#HttpOnly_${parts[0]}` : parts[0];
      cleanLines.push([outDomain, ...parts.slice(1, 7)].join("\t"));
    }
  }

  if (cleanLines.length > 1) {
    try {
      fs.writeFileSync(runtimeCookiesPath, `${cleanLines.join("\n")}\n`, { encoding: "utf-8", mode: 0o600 });
    } catch {}
  }

  return runtimeCookiesPath;
}

function hasUsableYouTubeCookies(cookiesPath: string): boolean {
  try {
    if (!fs.existsSync(cookiesPath)) return false;
    const content = fs.readFileSync(cookiesPath, "utf-8");
    return (
      /youtube\.com/i.test(content) &&
      /(SAPISID|__Secure-3PAPISID|PSID|LOGIN_INFO)/i.test(content)
    );
  } catch {
    return false;
  }
}

function hasYtdlAuthCookies(content: string): boolean {
  return /(?:^|\t|;|\s)(?:SAPISID|__Secure-3PAPISID)(?:\t|=)/m.test(content);
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
    const stat = fs.statSync(downloadedPath);
    if (stat.size > MAX_WHATSAPP_BYTES) {
      throw new Error("MAX_FILESIZE_EXCEEDED");
    }
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
      maxContentLength: chunkSize + 1024 * 1024,
      maxBodyLength: chunkSize + 1024 * 1024,
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
  const safeExt = ext === "webm" ? "webm" : ext === "mp4" ? "mp4" : "m4a";
  const id = `aud_conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(TEMP_DIR, `${id}.${safeExt}`);
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
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      context: {
        clientName: "VISIONOS",
        clientVersion: "1.02",
        deviceMake: "Apple",
        deviceModel: "RealityDevice17,1",
        osName: "visionOS",
        osVersion: "26.5.23O471",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
        ...(visitorData ? { visitorData } : {}),
      },
    },
    {
      name: "VISIONOS_NO_VD",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      context: {
        clientName: "VISIONOS",
        clientVersion: "1.02",
        deviceMake: "Apple",
        deviceModel: "RealityDevice17,1",
        osName: "visionOS",
        osVersion: "26.5.23O471",
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

const PIPED_INSTANCES = [
  "https://pipedapi.ducks.party",
  "https://api.piped.private.coffee",
];

async function downloadYouTubePiped(
  videoId: string,
  audioOnly: boolean,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const mediaType = audioOnly ? "audio" : "video";
  const mediaName = audioOnly ? "El audio" : "El video";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  for (const inst of PIPED_INSTANCES) {
    try {
      const res = await axios.get(`${inst}/streams/${videoId}`, {
        timeout: 10000,
        headers: { "User-Agent": ua },
      });

      const title: string = res.data?.title || defaultCaption || "YouTube Media";
      const videoStreams: any[] = res.data?.videoStreams || [];
      const audioStreams: any[] = res.data?.audioStreams || [];

      if (audioOnly) {
        const audioCandidate =
          audioStreams.find(
            (a) => a.url && isSafePublicUrl(a.url) && (a.mimeType?.includes("audio/mp4") || a.format === "M4A")
          ) ||
          audioStreams.find((a) => a.url && isSafePublicUrl(a.url));

        if (audioCandidate?.url) {
          const aLen = parseInt(audioCandidate.contentLength || "0", 10);
          if (aLen > MAX_WHATSAPP_BYTES) {
            return {
              type: "audio",
              errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
            };
          }
          const rawAudio = await downloadStreamChunked(audioCandidate.url, aLen > 0 ? aLen : 0, ua);
          const ext = audioCandidate.mimeType?.includes("webm") ? "webm" : "m4a";
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
            title,
            caption: defaultCaption || title || "Audio de YouTube",
          };
        }

        const muxedForAudio = videoStreams
          .filter(
            (v) =>
              v.url &&
              !v.videoOnly &&
              isSafePublicUrl(v.url) &&
              (v.format === "MPEG_4" || v.mimeType?.includes("video/mp4"))
          )
          .sort((a, b) => (parseInt(a.quality, 10) || 999) - (parseInt(b.quality, 10) || 999))[0];

        if (muxedForAudio?.url) {
          const vLen = parseInt(muxedForAudio.contentLength || "0", 10);
          if (vLen > MAX_WHATSAPP_BYTES) {
            return {
              type: "audio",
              errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
            };
          }
          const mp4Buf = await downloadStreamChunked(muxedForAudio.url, vLen > 0 ? vLen : 0, ua);
          const mp3Buffer = await convertBufferToMp3(mp4Buf, "mp4");
          if (mp3Buffer.length > MAX_WHATSAPP_BYTES) {
            return {
              type: "audio",
              errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
            };
          }
          return {
            buffer: mp3Buffer,
            type: "audio",
            title,
            caption: defaultCaption || title || "Audio de YouTube",
          };
        }
        continue;
      }

      const muxedCandidates = videoStreams
        .filter(
          (v) =>
            v.url &&
            !v.videoOnly &&
            isSafePublicUrl(v.url) &&
            (v.format === "MPEG_4" || v.mimeType?.includes("video/mp4")) &&
            (!parseInt(v.quality, 10) || parseInt(v.quality, 10) <= 720)
        )
        .sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));

      for (const candidate of muxedCandidates) {
        const cLen = parseInt(candidate.contentLength || "0", 10);
        if (cLen > MAX_WHATSAPP_BYTES) continue;
        try {
          const mp4Buffer = await downloadStreamChunked(candidate.url, cLen > 0 ? cLen : 0, ua);
          if (mp4Buffer.length > MAX_WHATSAPP_BYTES) continue;
          return {
            buffer: mp4Buffer,
            type: "video",
            title,
            caption: defaultCaption || title || "Acá tenés el video de YouTube",
          };
        } catch (dlErr: any) {
          if (dlErr?.message === "MAX_FILESIZE_EXCEEDED") continue;
        }
      }
    } catch (err: any) {
      if (err?.message === "MAX_FILESIZE_EXCEEDED") {
        return {
          type: mediaType,
          errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
        };
      }
      console.warn(`[Media Service] Piped (${inst}) falló para ${videoId}:`, err?.response?.status || err?.message);
    }
  }

  return null;
}

const INVIDIOUS_INSTANCES = [
  "https://yt.chocolatemoo53.com",
];

async function downloadYouTubeInvidious(
  videoId: string,
  audioOnly: boolean,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const mediaType = audioOnly ? "audio" : "video";
  const mediaName = audioOnly ? "El audio" : "El video";

  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${inst}/api/v1/videos/${videoId}`, {
        timeout: 8000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      });

      const title: string = res.data?.title || defaultCaption || "YouTube Media";
      const formatStreams: any[] = res.data?.formatStreams || [];
      const adaptive: any[] = res.data?.adaptiveFormats || [];

      if (audioOnly) {
        const audioCandidates = adaptive.filter(
          (f) => f.url && typeof f.type === "string" && f.type.startsWith("audio/")
        );
        const preferredAudio =
          audioCandidates.find((f) => f.itag === "140" || f.itag === 140) ||
          audioCandidates.find((f) => f.type?.includes("audio/mp4")) ||
          audioCandidates.find((f) => f.itag === "251" || f.itag === 251) ||
          audioCandidates[0] ||
          formatStreams[0];

        if (!preferredAudio?.url || !isSafePublicUrl(preferredAudio.url)) continue;

        const audioLen = parseInt(preferredAudio.clen || preferredAudio.contentLength || "0", 10);
        if (audioLen > MAX_WHATSAPP_BYTES) {
          return {
            type: "audio",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        const rawAudio = await downloadStreamChunked(
          preferredAudio.url,
          audioLen,
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        );
        const ext = preferredAudio.type?.includes("webm") ? "webm" : "m4a";
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
          title,
          caption: defaultCaption || title || "Audio de YouTube",
        };
      }

      // Modo Video
      const directMp4 = formatStreams.find(
        (f) =>
          f.url &&
          isSafePublicUrl(f.url) &&
          (f.container === "mp4" || (typeof f.type === "string" && f.type.includes("video/mp4"))) &&
          (!f.resolution || parseInt(f.resolution, 10) <= 720)
      );

      if (directMp4?.url) {
        const dLen = parseInt(directMp4.size || directMp4.contentLength || "0", 10);
        if (dLen > MAX_WHATSAPP_BYTES) {
          return {
            type: "video",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        const mp4Buffer = await downloadStreamChunked(
          directMp4.url,
          dLen,
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        );

        return {
          buffer: mp4Buffer,
          type: "video",
          title,
          caption: defaultCaption || title || "Acá tenés el video de YouTube",
        };
      }

      // Si formatStreams no tiene MP4 multiplexado, intentar multiplexar video H264 + audio AAC de adaptive
      const h264Candidates = adaptive
        .filter(
          (f) =>
            f.url &&
            isSafePublicUrl(f.url) &&
            typeof f.type === "string" &&
            f.type.includes("video/mp4") &&
            f.type.includes("avc1") &&
            (!f.resolution || parseInt(f.resolution, 10) <= 720)
        )
        .sort((a, b) => (parseInt(b.resolution, 10) || 0) - (parseInt(a.resolution, 10) || 0));

      const aacAudio = adaptive.find(
        (f) =>
          f.url &&
          isSafePublicUrl(f.url) &&
          typeof f.type === "string" &&
          (f.type.includes("audio/mp4") || f.itag === "140" || f.itag === 140)
      );

      if (h264Candidates.length > 0 && aacAudio?.url) {
        const aLen = parseInt(aacAudio.clen || aacAudio.contentLength || "0", 10);
        const validPairs = h264Candidates.filter((v) => {
          const vLen = parseInt(v.clen || v.contentLength || "0", 10);
          return vLen > 0 && vLen + aLen <= MAX_WHATSAPP_BYTES;
        });

        if (validPairs.length === 0 && h264Candidates.some((v) => parseInt(v.clen || v.contentLength || "0", 10) > 0)) {
          return {
            type: "video",
            errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
          };
        }

        const chosenVideo = validPairs[0] || h264Candidates[h264Candidates.length - 1];
        const vLen = parseInt(chosenVideo.clen || chosenVideo.contentLength || "0", 10);

        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        const [vBuf, aBuf] = await Promise.all([
          downloadStreamChunked(chosenVideo.url, vLen, ua),
          downloadStreamChunked(aacAudio.url, aLen, ua),
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
          title,
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
      console.warn(`[Media Service] Invidious (${inst}) falló para ${videoId}:`, err?.response?.status || err?.message);
    }
  }

  return null;
}

type PoTokenFn = Awaited<ReturnType<typeof createPoTokenProvider>>;
let sharedPoTokenProviderPromise: Promise<PoTokenFn | null> | null = null;
let ytdlAuthClientPromise: Promise<Ytdl> | null = null;
let ytdlAnonClientPromise: Promise<Ytdl> | null = null;

async function getSharedPoTokenProvider(): Promise<PoTokenFn | null> {
  if (!sharedPoTokenProviderPromise) {
    sharedPoTokenProviderPromise = createPoTokenProvider({ timeoutMs: 45000 }).catch((err: any) => {
      console.warn("[Media Service] Falló inicialización de PO token provider:", err?.message || err);
      sharedPoTokenProviderPromise = null;
      return null;
    });
  }
  return sharedPoTokenProviderPromise;
}

async function mintPoTokenForVideo(videoId: string): Promise<string | null> {
  try {
    const provider = await getSharedPoTokenProvider();
    if (!provider) return null;
    return await provider({
      contentBinding: videoId,
      client: Client.Mweb,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return null;
  }
}

async function getYtdlClient(useCookies = true): Promise<Ytdl> {
  if (useCookies) {
    const cookiesPath = ensureCookiesFile();
    let cookies: string | undefined = undefined;
    if (hasUsableYouTubeCookies(cookiesPath)) {
      try {
        const raw = fs.readFileSync(cookiesPath, "utf-8");
        if (hasYtdlAuthCookies(raw)) {
          cookies = raw;
        }
      } catch {}
    }

    if (cookies) {
      if (!ytdlAuthClientPromise) {
        ytdlAuthClientPromise = (async () => {
          const poTokenProvider = await getSharedPoTokenProvider();
          return new Ytdl({
            ...(poTokenProvider ? { getPoToken: poTokenProvider } : {}),
            cookie: cookies,
          });
        })().catch((err) => {
          ytdlAuthClientPromise = null;
          throw err;
        });
      }
      return ytdlAuthClientPromise;
    }
  }

  if (!ytdlAnonClientPromise) {
    ytdlAnonClientPromise = (async () => {
      const poTokenProvider = await getSharedPoTokenProvider();
      return new Ytdl(poTokenProvider ? { getPoToken: poTokenProvider } : {});
    })().catch((err) => {
      ytdlAnonClientPromise = null;
      throw err;
    });
  }
  return ytdlAnonClientPromise;
}

async function downloadYouTubeWithYtdlCore(
  videoId: string,
  audioOnly: boolean,
  defaultCaption?: string
): Promise<MediaDownloadResult | null> {
  const mediaType = audioOnly ? "audio" : "video";
  const mediaName = audioOnly ? "El audio" : "El video";
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const attemptWithClient = async (yt: Ytdl) => {
    const info = await yt.getInfo(targetUrl);
    const title = info.videoDetails.title || defaultCaption || "YouTube Media";

    if (audioOnly) {
      const aStream = yt.download(info, {
        quality: Quality.HighestAudio,
        filter: { hasAudio: true, hasVideo: false },
      });
      const rawAudio = await streamToBuffer(aStream, MAX_WHATSAPP_BYTES);
      const mp3Buffer = await convertBufferToMp3(rawAudio, "m4a");

      if (mp3Buffer.length > MAX_WHATSAPP_BYTES) {
        return {
          type: "audio" as const,
          errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
        };
      }

      return {
        buffer: mp3Buffer,
        type: "audio" as const,
        title,
        caption: defaultCaption || title || "Audio de YouTube",
      };
    }

    const muxedCandidate = info.formats.find(
      (f: any) =>
        f.hasAudio &&
        f.hasVideo &&
        f.container === "mp4" &&
        (!f.height || f.height <= 720) &&
        (!f.contentLength || parseInt(f.contentLength, 10) <= MAX_WHATSAPP_BYTES)
    );

    if (muxedCandidate) {
      const vStream = yt.download(info, {
        format: muxedCandidate,
      });
      const buffer = await streamToBuffer(vStream, MAX_WHATSAPP_BYTES);
      return {
        buffer,
        type: "video" as const,
        title,
        caption: defaultCaption || title || "Acá tenés el video de YouTube",
      };
    }

    const aStream = yt.download(info, {
      quality: Quality.HighestAudio,
      filter: { hasAudio: true, hasVideo: false },
    });
    const vStream = yt.download(info, {
      quality: Quality.HighestVideo,
      filter: (f: any) => f.hasVideo && !f.hasAudio && f.container === "mp4" && (!f.height || f.height <= 720),
    });

    const [vBuf, aBuf] = await Promise.all([
      streamToBuffer(vStream, MAX_WHATSAPP_BYTES),
      streamToBuffer(aStream, MAX_WHATSAPP_BYTES),
    ]);

    const mp4Buffer = await muxVideoAndAudioToMp4(vBuf, aBuf);
    if (mp4Buffer.length > MAX_WHATSAPP_BYTES) {
      return {
        type: "video" as const,
        errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
      };
    }

    return {
      buffer: mp4Buffer,
      type: "video" as const,
      title,
      caption: defaultCaption || title || "Acá tenés el video de YouTube",
    };
  };

  try {
    const yt = await getYtdlClient(true);
    return await attemptWithClient(yt);
  } catch (err: any) {
    if (err?.code === "AUTH_FAILED" || err?.code === "INVALID_ARGUMENT") {
      ytdlAuthClientPromise = null;
      try {
        const anonYt = await getYtdlClient(false);
        return await attemptWithClient(anonYt);
      } catch (anonErr: any) {
        console.warn(`[Media Service] ytdl-core anónimo falló para ${videoId}:`, anonErr?.message || anonErr);
        return null;
      }
    }
    if (err?.message?.includes("supera el límite de seguridad") || err?.message === "MAX_FILESIZE_EXCEEDED") {
      return {
        type: mediaType,
        errorNotice: `❌ ${mediaName} excede el límite de 50 MB permitido por WhatsApp.`,
      };
    }
    console.warn(`[Media Service] ytdl-core no pudo procesar ${videoId}:`, err?.message || err);
    return null;
  }
}

async function runYtDlpYouTubeAttempt(options: {
  binaryPath: string;
  target: string;
  audioOnly: boolean;
  cookiesPath?: string;
  poToken?: string | null;
  defaultCaption?: string;
}): Promise<{ result?: MediaDownloadResult; stderr?: string; error?: any }> {
  const { binaryPath, target, audioOnly, cookiesPath, poToken, defaultCaption } = options;
  const filePrefix = `yt_${audioOnly ? "aud" : "vid"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPattern = path.join(TEMP_DIR, `${filePrefix}.%(ext)s`);

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

  const extractorArgs = cookiesPath
    ? "youtube:player_client=tv,web,mweb"
    : poToken
      ? `youtube:player_client=mweb,web_safari,ios,android;po_token=mweb.gvs+${poToken}`
      : "youtube:player_client=mweb,web_safari,ios,android";

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
    "--remote-components", "ejs:github",
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

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push("--", target);

  try {
    const { stdout } = await execFileAsync(binaryPath, args, { timeout: 90000 });
    const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
    if (files.length === 0) return {};

    const downloadedPath = path.join(TEMP_DIR, files[0]);
    const stat = fs.statSync(downloadedPath);
    if (stat.size > MAX_WHATSAPP_BYTES) {
      throw new Error("MAX_FILESIZE_EXCEEDED");
    }
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
      result: {
        buffer,
        type: mediaType,
        title: title || defaultCaption,
        caption: title || defaultCaption || defaultText,
      },
    };
  } catch (error: any) {
    try {
      const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(filePrefix));
      for (const f of files) fs.unlinkSync(path.join(TEMP_DIR, f));
    } catch {}
    return {
      error,
      stderr: (error?.stderr || error?.message || "").toString(),
    };
  }
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

  if (isUrl && !isSafePublicUrl(trimmed)) {
    return {
      type: audioOnly ? "audio" : "video",
      errorNotice: "❌ URL no permitida por razones de seguridad.",
    };
  }

  if (ytId) {
    const ytdlResult = await downloadYouTubeWithYtdlCore(ytId, audioOnly, defaultCaption);
    if (ytdlResult) return ytdlResult;

    const fastResult = await downloadYouTubeInnerTube(ytId, audioOnly, defaultCaption);
    if (fastResult) return fastResult;

    const pipedResult = await downloadYouTubePiped(ytId, audioOnly, defaultCaption);
    if (pipedResult) return pipedResult;

    const invidiousResult = await downloadYouTubeInvidious(ytId, audioOnly, defaultCaption);
    if (invidiousResult) return invidiousResult;
  }

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
  const cookiesPath = ensureCookiesFile();
  const useCookies = hasUsableYouTubeCookies(cookiesPath);

  let attempt = await runYtDlpYouTubeAttempt({
    binaryPath,
    target,
    audioOnly,
    cookiesPath: useCookies ? cookiesPath : undefined,
    poToken: useCookies || !ytId ? null : await mintPoTokenForVideo(ytId),
    defaultCaption,
  });

  if (attempt.result) return attempt.result;

  const firstStderr = attempt.stderr || "";
  if (useCookies && (firstStderr.includes("Sign in to confirm") || firstStderr.includes("bot"))) {
    console.warn("[Media Service] yt-dlp con cookies falló por verificación; reintentando sin cookies con PO token...");
    attempt = await runYtDlpYouTubeAttempt({
      binaryPath,
      target,
      audioOnly,
      poToken: ytId ? await mintPoTokenForVideo(ytId) : null,
      defaultCaption,
    });
    if (attempt.result) return attempt.result;
  }

  const stderr = attempt.stderr || "";
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
    message: attempt.error?.message,
    stderr,
  });
  return null;
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