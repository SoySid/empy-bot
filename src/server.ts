import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { z } from "zod";
import { clearAuthFromDb } from "./services/db/auth-sync.service.js";

export interface BotController {
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  unlink: () => Promise<void>;
  isSuspended: () => boolean;
}

let botController: BotController | null = null;

export function registerBotController(controller: BotController) {
  botController = controller;
}

interface ServerState {
  isConnected: boolean;
  isSuspended: boolean;
  userPhone?: string;
  userName?: string;
  qrCode?: string;
  lastConnectedAt?: Date;
}

const state: ServerState = {
  isConnected: false,
  isSuspended: false,
};

export function updateServerBotState(partial: Partial<ServerState>) {
  Object.assign(state, partial);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isConstantTimeMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

const IS_ADMIN_AUTH_CONFIGURED = Boolean(process.env.ADMIN_PASSWORD || process.env.RESET_AUTH_SECRET);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.RESET_AUTH_SECRET || "";

if (!IS_ADMIN_AUTH_CONFIGURED) {
  console.warn(
    "[Server Security] 🔒 ADMIN_PASSWORD no está configurado en .env. El panel administrativo web permanece deshabilitado por seguridad (Fail-Closed)."
  );
}

const SERVER_SESSION_SECRET = crypto.randomBytes(32);
const ADMIN_SESSION_TOKEN = IS_ADMIN_AUTH_CONFIGURED
  ? crypto.createHmac("sha256", SERVER_SESSION_SECRET).update(ADMIN_PASSWORD).digest("hex")
  : "";

const LoginPayloadSchema = z.object({
  password: z.string().min(1).max(256),
});

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join("="));
      }
    });
  }
  return list;
}

function isSameOriginRequest(req: http.IncomingMessage, host: string): boolean {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    const cookies = parseCookies(req);
    if (cookies.admin_session && req.method && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return false;
    }
    return true;
  }
  try {
    const originUrl = new URL(origin);
    return originUrl.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function checkAdminAuth(req: http.IncomingMessage, _parsedUrl: URL): boolean {
  if (!IS_ADMIN_AUTH_CONFIGURED || !ADMIN_PASSWORD) {
    return false;
  }
  const cookies = parseCookies(req);
  if (cookies.admin_session && isConstantTimeMatch(cookies.admin_session, ADMIN_SESSION_TOKEN)) {
    return true;
  }
  const token =
    (req.headers["x-reset-token"] as string) ||
    (req.headers["authorization"]?.replace(/^Bearer\s+/i, "")) ||
    "";
  if (token && (isConstantTimeMatch(token, ADMIN_PASSWORD) || isConstantTimeMatch(token, ADMIN_SESSION_TOKEN))) {
    return true;
  }
  return false;
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50000) {
        req.destroy();
        resolve({});
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const MAX_RATE_LIMIT_KEYS = 2000;
function pruneRateLimitMap(map: Map<string, { count: number; resetAt: number }>, now: number) {
  if (map.size <= MAX_RATE_LIMIT_KEYS) return;
  for (const [key, val] of map.entries()) {
    if (now > val.resetAt) map.delete(key);
  }
  if (map.size > MAX_RATE_LIMIT_KEYS) {
    const keysToDelete = Array.from(map.keys()).slice(0, 500);
    for (const k of keysToDelete) map.delete(k);
  }
}

// Rate Limiter estricto para intentos de login (máx 5 intentos en 15 minutos)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function isLoginRateLimited(ip: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  pruneRateLimitMap(loginAttempts, now);
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxAttempts;
}

// Rate Limiter por IP para el servidor web (máx 60 req/min por IP)
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
function isIpRateLimited(ip: string, maxRequests = 60, windowMs = 60000): boolean {
  const now = Date.now();
  pruneRateLimitMap(ipRequestCounts, now);
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxRequests;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const STATIC_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

function setSecurityHeaders(res: http.ServerResponse, contentType: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';"
  );
}

/**
 * Sirve de forma segura un archivo estático dentro de `PUBLIC_DIR` validando traversal, symlinks y whitelist MIME.
 */
async function tryServePublicFile(
  res: http.ServerResponse,
  method: string | undefined,
  pathname: string
): Promise<boolean> {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\")) {
    return false;
  }

  const safeRelPath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  if (!safeRelPath) {
    return false;
  }

  const segments = safeRelPath.split("/");
  if (segments.some((seg) => seg === "" || seg === "." || seg === "..")) {
    return false;
  }

  const resolvedPath = path.resolve(PUBLIC_DIR, safeRelPath);
  const publicPrefix = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : `${PUBLIC_DIR}${path.sep}`;
  if (!resolvedPath.startsWith(publicPrefix)) {
    return false;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STATIC_MIME_TYPES, ext)) {
    return false;
  }
  const mimeType = STATIC_MIME_TYPES[ext];

  let realPublicDir: string;
  let realFilePath: string;
  let lstat: fs.Stats;
  try {
    realPublicDir = fs.realpathSync(PUBLIC_DIR);
    lstat = fs.lstatSync(resolvedPath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      return false;
    }
    realFilePath = fs.realpathSync(resolvedPath);
  } catch {
    return false;
  }

  const realPrefix = realPublicDir.endsWith(path.sep) ? realPublicDir : `${realPublicDir}${path.sep}`;
  if (!realFilePath.startsWith(realPrefix)) {
    return false;
  }

  let content: Buffer | null = null;
  if (method === "GET") {
    try {
      content = await fs.promises.readFile(realFilePath);
    } catch {
      return false;
    }
  }

  setSecurityHeaders(res, mimeType);
  res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=300");
  res.setHeader("Content-Length", String(content ? content.byteLength : lstat.size));
  res.writeHead(200);
  res.end(content ?? undefined);
  return true;
}

/**
 * Inicia el servidor HTTP para Render y monitores de Uptime.
 */
export function startHttpServer(port = Number(process.env.PORT) || 3000): http.Server {
  const server = http.createServer(async (req, res) => {
    const socketIp = req.socket.remoteAddress || "127.0.0.1";
    const forwardedHeader = req.headers["x-forwarded-for"] as string;
    const hops = forwardedHeader ? forwardedHeader.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const clientIp = hops.length > 0 ? (hops[hops.length - 1] || socketIp) : socketIp;
    const rawIp = `${clientIp}#${socketIp}`;

    if (isIpRateLimited(rawIp)) {
      setSecurityHeaders(res, "application/json");
      res.writeHead(429);
      res.end(JSON.stringify({ error: "Demasiadas peticiones. Intenta más tarde." }));
      return;
    }

    const host = req.headers.host || "localhost";
    const parsedUrl = new URL(req.url || "/", `http://${host}`);
    const pathname = parsedUrl.pathname;

    // 1. Health check público para Render, UptimeRobot, cron-job.org
    if (pathname === "/health" || pathname === "/ping") {
      setSecurityHeaders(res, "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "ok",
          bot: "Empy Bot",
          connected: state.isConnected,
          suspended: state.isSuspended,
          uptime: formatUptime(process.uptime()),
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Validación preventiva de CSRF para métodos que alteran estado
    if (req.method === "POST" && pathname.startsWith("/api/")) {
      if (!isSameOriginRequest(req, host)) {
        setSecurityHeaders(res, "application/json");
        res.writeHead(403);
        res.end(JSON.stringify({ error: "Origen no permitido (CSRF check fallido)." }));
        return;
      }
    }

    // 2. API: Login con contraseña
    if (req.method === "POST" && pathname === "/api/login") {
      setSecurityHeaders(res, "application/json");
      if (!IS_ADMIN_AUTH_CONFIGURED) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "Panel de administración deshabilitado por seguridad (ADMIN_PASSWORD no configurado)." }));
        return;
      }
      if (isLoginRateLimited(rawIp)) {
        res.writeHead(429);
        res.end(JSON.stringify({ error: "Demasiados intentos fallidos. Intenta nuevamente en 15 minutos." }));
        return;
      }
      const rawBody = await parseJsonBody(req);
      const parsedPayload = LoginPayloadSchema.safeParse(rawBody);
      if (!parsedPayload.success) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Formato de contraseña inválido." }));
        return;
      }
      const provided = parsedPayload.data.password;
      if (isConstantTimeMatch(provided, ADMIN_PASSWORD)) {
        loginAttempts.delete(rawIp);
        const isSecure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
        const secureFlag = isSecure ? "; Secure" : "";
        res.setHeader("Set-Cookie", `admin_session=${ADMIN_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=86400`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Acceso autorizado." }));
      } else {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Contraseña incorrecta." }));
      }
      return;
    }

    // 3. API: Logout
    if (req.method === "POST" && pathname === "/api/logout") {
      setSecurityHeaders(res, "application/json");
      res.setHeader("Set-Cookie", "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 4. API: Estado en vivo del bot
    if (req.method === "GET" && pathname === "/api/bot/status") {
      setSecurityHeaders(res, "application/json");
      const isAuthorized = checkAdminAuth(req, parsedUrl);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          isConnected: state.isConnected,
          isSuspended: state.isSuspended,
          qrCode: isAuthorized && !state.isSuspended ? state.qrCode : undefined,
          userPhone: isAuthorized ? state.userPhone : undefined,
          userName: isAuthorized ? state.userName : undefined,
          uptime: formatUptime(process.uptime()),
          uptimeSeconds: Math.floor(process.uptime()),
          heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          targetGroup: isAuthorized ? (process.env.GROUP_JID ? "Exclusivo" : "Global") : "Protegido",
          isAuthorized,
        })
      );
      return;
    }

    // 5. API: Suspender / Apagar el Bot
    if (req.method === "POST" && pathname === "/api/bot/suspend") {
      setSecurityHeaders(res, "application/json");
      if (!checkAdminAuth(req, parsedUrl)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "No autorizado." }));
        return;
      }
      try {
        if (botController) {
          await botController.suspend();
        } else {
          updateServerBotState({ isSuspended: true, isConnected: false });
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Bot suspendido correctamente." }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err?.message || "Error al suspender." }));
      }
      return;
    }

    // 6. API: Reanudar / Encender el Bot
    if (req.method === "POST" && pathname === "/api/bot/resume") {
      setSecurityHeaders(res, "application/json");
      if (!checkAdminAuth(req, parsedUrl)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "No autorizado." }));
        return;
      }
      try {
        if (botController) {
          await botController.resume();
        } else {
          updateServerBotState({ isSuspended: false });
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Bot reanudado correctamente." }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err?.message || "Error al reanudar." }));
      }
      return;
    }

    // 7. API: Desvincular / Cambiar Número
    if (req.method === "POST" && (pathname === "/api/bot/unlink" || pathname === "/reset-auth" || pathname === "/api/reset-session")) {
      setSecurityHeaders(res, "application/json");
      if (!checkAdminAuth(req, parsedUrl)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "No autorizado." }));
        return;
      }
      try {
        if (botController) {
          await botController.unlink();
        } else {
          await clearAuthFromDb().catch(() => {});
          try {
            fs.rmSync("auth_info", { recursive: true, force: true });
          } catch {}
          updateServerBotState({ isConnected: false, isSuspended: false, qrCode: undefined, userPhone: undefined, userName: undefined });
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Sesión eliminada. Generando nuevo código QR..." }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err?.message || "Error al desvincular sesión." }));
      }
      return;
    }

    // 8. Panel de Control Web y Visor de QR
    if (pathname === "/admin" || pathname === "/qr") {
      setSecurityHeaders(res, "text/html; charset=utf-8");
      res.writeHead(200);

      const isAuthorized = checkAdminAuth(req, parsedUrl);
      const safeHost = escapeHtml(host);

      if (!isAuthorized) {
        // Pantalla de Login limpia y protegida
        const loginHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Empy Bot - Acceso Administrador</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #111827;
      border: 1px solid #1f293d;
      border-radius: 16px;
      padding: 32px 28px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .logo {
      font-size: 38px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.4;
    }
    .input-group {
      margin-bottom: 16px;
      text-align: left;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      background: #090d16;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #f8fafc;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      border-color: #3b82f6;
    }
    .btn {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    .error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 10px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🤖</div>
    <h1>Panel Empy Bot</h1>
    <p>Ingresá la contraseña para gestionar el estado, vincular número o suspender el bot.</p>
    
    <div id="errorBox" class="error"></div>
    
    ${
      !IS_ADMIN_AUTH_CONFIGURED
        ? `<div class="error" style="display:block; background:rgba(239,68,68,0.15); color:#fca5a5; padding:12px; border-radius:8px; line-height:1.4;">
            🔒 <strong>Panel administrativo deshabilitado.</strong><br>
            Para habilitar la gestión web, configure la variable de entorno <code>ADMIN_PASSWORD</code>.
          </div>`
        : `<form id="loginForm" onsubmit="handleLogin(event)">
      <div class="input-group">
        <label for="password">Contraseña</label>
        <input type="password" id="password" required autofocus placeholder="Contraseña de administrador">
      </div>
      <button type="submit" class="btn" id="submitBtn">Acceder</button>
    </form>`
    }
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const pwd = document.getElementById("password").value;
      const errBox = document.getElementById("errorBox");
      const btn = document.getElementById("submitBtn");
      errBox.style.display = "none";
      btn.disabled = true;
      btn.innerText = "Verificando...";

      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.location.reload();
        } else {
          errBox.innerText = data.error || "Contraseña inválida.";
          errBox.style.display = "block";
          btn.disabled = false;
          btn.innerText = "Acceder";
        }
      } catch (err) {
        errBox.innerText = "Error de conexión al servidor.";
        errBox.style.display = "block";
        btn.disabled = false;
        btn.innerText = "Acceder";
      }
    }
  </script>
</body>
</html>`;
        res.end(loginHtml);
        return;
      }

      // Panel de Control Administrador
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Empy Bot - Panel de Control</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==" crossorigin="anonymous"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      margin: 0;
      padding: 30px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #111827;
      border: 1px solid #1f293d;
      border-radius: 18px;
      padding: 28px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.4);
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .bot-title {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logout-btn {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: #1e293b;
      color: #f8fafc;
    }
    .badge-status {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      margin: 8px 0 20px;
      transition: all 0.3s ease;
    }
    .badge-connected {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid #10b981;
      color: #34d399;
    }
    .badge-suspended {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid #ef4444;
      color: #f87171;
    }
    .badge-qr {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid #f59e0b;
      color: #fbbf24;
    }
    .badge-offline {
      background: rgba(100, 116, 139, 0.12);
      border: 1px solid #64748b;
      color: #94a3b8;
    }

    /* Acciones Rápidas */
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 24px;
    }
    .btn-action {
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn-suspend {
      background: #dc2626;
      color: #fff;
    }
    .btn-suspend:hover {
      background: #b91c1c;
    }
    .btn-resume {
      background: #10b981;
      color: #fff;
    }
    .btn-resume:hover {
      background: #059669;
    }
    .btn-unlink {
      background: #334155;
      color: #f1f5f9;
      grid-column: span 2;
    }
    .btn-unlink:hover {
      background: #475569;
    }

    /* Contenedor de Código QR */
    #qrContainer {
      background: #ffffff;
      padding: 20px;
      border-radius: 14px;
      margin: 16px 0 24px;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    #qrContainer p {
      color: #1f2937;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 12px;
    }
    #qrContainer img {
      display: block;
      margin: 0 auto;
      border-radius: 8px;
    }
    #qrContainer .qr-sub {
      color: #6b7280;
      font-size: 12px;
      margin-top: 10px;
    }

    /* Grid de Métricas */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      text-align: left;
      margin-bottom: 20px;
    }
    .info-box {
      background: #090d16;
      border: 1px solid #1e293b;
      padding: 12px 14px;
      border-radius: 10px;
    }
    .info-label {
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 14px;
      font-weight: 600;
      margin-top: 4px;
      color: #e2e8f0;
      word-break: break-all;
    }

    /* Nota informativa */
    .note-box {
      background: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.25);
      color: #93c5fd;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header-bar">
      <div class="bot-title">🤖 Empy Bot</div>
      <button class="logout-btn" onclick="handleLogout()">Cerrar Sesión</button>
    </div>

    <div>
      <span id="statusBadge" class="badge-status badge-offline">Cargando estado...</span>
    </div>

    <!-- Botones de Acción -->
    <div class="actions-grid">
      <button id="toggleBtn" class="btn-action btn-suspend" onclick="toggleBotPower()">
        ⏸️ Apagar / Suspender Bot
      </button>
      <button class="btn-action btn-unlink" onclick="handleUnlink()">
        🔄 Desvincular / Cambiar Número
      </button>
    </div>

    <!-- Contenedor QR dinámico -->
    <div id="qrContainer">
      <p>Escaneá este código QR con WhatsApp</p>
      <div id="qrBox" style="display: flex; justify-content: center; margin: 14px 0; background: #ffffff; padding: 10px; border-radius: 8px; width: fit-content; margin-left: auto; margin-right: auto;"></div>
      <div class="qr-sub">WhatsApp > Dispositivos vinculados > Vincular un dispositivo</div>
    </div>

    <!-- Métricas -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-label">Número Conectado</div>
        <div class="info-value" id="valPhone">Consultando...</div>
      </div>
      <div class="info-box">
        <div class="info-label">Filtro de Grupo</div>
        <div class="info-value" style="color: #60a5fa;" id="valGroup">Exclusivo</div>
      </div>
      <div class="info-box">
        <div class="info-label">Tiempo Activo</div>
        <div class="info-value" id="valUptime">0s</div>
      </div>
      <div class="info-box">
        <div class="info-label">Memoria Usada</div>
        <div class="info-value" id="valMem">0 MB</div>
      </div>
    </div>

    <div class="note-box">
      🔒 <strong>Canales Habilitados:</strong> El bot responde exclusivamente en el grupo principal configurado. Los mensajes privados (DMs) y grupos externos ajenos son ignorados.
    </div>
  </div>

  <script>
    let isCurrentlySuspended = false;
    let isCurrentlyConnected = false;
    let lastRenderedQr = "";

    async function fetchStatus() {
      try {
        const res = await fetch("/api/bot/status");
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const data = await res.json();
        isCurrentlySuspended = !!data.isSuspended;
        isCurrentlyConnected = !!data.isConnected;

        const badge = document.getElementById("statusBadge");
        const toggleBtn = document.getElementById("toggleBtn");
        const qrContainer = document.getElementById("qrContainer");
        const qrBox = document.getElementById("qrBox");

        document.getElementById("valPhone").innerText = data.userPhone ? "+" + data.userPhone : "Sin vincular";
        document.getElementById("valUptime").innerText = data.uptime || "0s";
        document.getElementById("valMem").innerText = (data.heapMb || 0) + " MB";
        document.getElementById("valGroup").innerText = data.targetGroup || "Exclusivo";

        if (data.isSuspended) {
          badge.className = "badge-status badge-suspended";
          badge.innerText = "⏸️ Suspendido / Apagado";
          toggleBtn.className = "btn-action btn-resume";
          toggleBtn.innerText = "▶️ Encender / Reanudar Bot";
          qrContainer.style.display = "none";
        } else if (data.isConnected) {
          badge.className = "badge-status badge-connected";
          badge.innerText = "🟢 Conectado y Operativo";
          toggleBtn.className = "btn-action btn-suspend";
          toggleBtn.innerText = "⏸️ Apagar / Suspender Bot";
          qrContainer.style.display = "none";
        } else if (data.qrCode) {
          badge.className = "badge-status badge-qr";
          badge.innerText = "🟡 Esperando Escaneo de QR";
          toggleBtn.className = "btn-action btn-suspend";
          toggleBtn.innerText = "⏸️ Apagar / Suspender Bot";
          if (data.qrCode !== lastRenderedQr) {
            lastRenderedQr = data.qrCode;
            if (qrBox) {
              qrBox.innerHTML = "";
              if (window.QRCode) {
                new QRCode(qrBox, {
                  text: data.qrCode,
                  width: 240,
                  height: 240,
                  colorDark: "#000000",
                  colorLight: "#ffffff",
                });
              } else {
                qrBox.innerText = data.qrCode;
              }
            }
          }
          qrContainer.style.display = "block";
        } else {
          badge.className = "badge-status badge-offline";
          badge.innerText = "🔴 Desconectado (Iniciando...)";
          toggleBtn.className = "btn-action btn-suspend";
          toggleBtn.innerText = "⏸️ Apagar / Suspender Bot";
          qrContainer.style.display = "none";
        }
      } catch (e) {
        console.warn("Error en polling de estado:", e);
      }
    }

    async function toggleBotPower() {
      const endpoint = isCurrentlySuspended ? "/api/bot/resume" : "/api/bot/suspend";
      const confirmMsg = isCurrentlySuspended 
        ? "¿Deseas reanudar y encender el bot en WhatsApp?"
        : "¿Seguro que deseas suspender y apagar el bot? El socket se desconectará.";
      
      if (!confirm(confirmMsg)) return;

      try {
        const res = await fetch(endpoint, { method: "POST" });
        const data = await res.json();
        if (data.success) {
          fetchStatus();
        } else {
          alert(data.error || "No se pudo cambiar el estado.");
        }
      } catch (err) {
        alert("Error de comunicación con el servidor.");
      }
    }

    async function handleUnlink() {
      if (!confirm("⚠️ ¿Estás seguro de desvincular el número actual?\\nSe eliminará la sesión de PostgreSQL y auth_info local, y se generará un nuevo QR inmediatamente.")) {
        return;
      }

      try {
        const res = await fetch("/api/bot/unlink", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          alert("Sesión desvinculada. Esperando nuevo código QR...");
          fetchStatus();
        } else {
          alert(data.error || "Error al desvincular sesión.");
        }
      } catch (err) {
        alert("Error de red al desvincular.");
      }
    }

    async function handleLogout() {
      try {
        await fetch("/api/logout", { method: "POST" });
      } finally {
        window.location.reload();
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 3500);
  </script>
</body>
</html>`;
      res.end(html);
      return;
    }

    // 9. Landing page pública y archivos estáticos desde public/
    if (await tryServePublicFile(res, req.method, pathname)) {
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/") {
      setSecurityHeaders(res, "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.writeHead(404);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(
        '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Empy Bot - 404</title></head><body style="font-family:sans-serif;background:#090d16;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>404</h1><p>Landing page no disponible todav&iacute;a.</p></div></body></html>'
      );
      return;
    }

    setSecurityHeaders(res, "text/plain");
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[Web Server] 🌐 Servidor HTTP activo en http://0.0.0.0:${port} (Panel & Keep-Alive)`);
  });

  initSelfPing();

  return server;
}

/**
 * Pinger interno que envía peticiones GET a la URL de Render para evitar suspensión por inactividad.
 */
function initSelfPing() {
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!externalUrl) {
    return;
  }

  const pingUrl = `${externalUrl.replace(/\/+$/, "")}/health`;
  const PING_INTERVAL_MS = 9 * 60 * 1000;

  console.log(`[Self-Ping] 🔄 Activado pinger interno hacia ${pingUrl} cada 9 minutos.`);

  setInterval(async () => {
    try {
      await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
      console.log(`[Self-Ping] ✅ Ping exitoso a ${pingUrl}`);
    } catch (err: any) {
      console.warn(`[Self-Ping] ⚠️ Advertencia en ping a ${pingUrl}:`, err?.message || err);
    }
  }, PING_INTERVAL_MS);
}
