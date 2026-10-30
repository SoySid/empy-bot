/**
 * Silenciador de logs ruidosos de bibliotecas de terceros (principalmente libsignal / Baileys).
 *
 * Libsignal llama internamente a `console.info("Closing session:", session)` y
 * `console.warn("Session already closed", session)` pasando objetos masivos `SessionEntry`
 * con buffers criptográficos que inundan la terminal de texto innecesario.
 */

const NOISE_PATTERNS = [
  "Closing session:",
  "Opening session:",
  "Session already closed",
  "Session already open",
  "Removing old closed session:",
  "Migrating session to:",
  "Decrypted message with closed session",
  "Closing open session in favor of incoming prekey bundle",
  "Unhandled bucket type (for naming):",
  "Failed to decrypt message with any known session",
  "Session error:Error: Bad MAC",
  "Session error: Error: Bad MAC",
  "Session error:",
  "Error: Bad MAC",
  "Bad MAC",
  "verifyMAC",
  "SessionEntry",
];

export function isNoiseLog(chunkOrArgs: any): boolean {
  if (chunkOrArgs === null || chunkOrArgs === undefined) return false;

  // Si es un string o buffer (desde stdout/stderr)
  const str = typeof chunkOrArgs === "string" ? chunkOrArgs : chunkOrArgs?.toString?.() || "";
  if (NOISE_PATTERNS.some((p) => str.includes(p))) {
    return true;
  }

  // Si es un array de argumentos (desde console.*)
  if (Array.isArray(chunkOrArgs)) {
    for (const arg of chunkOrArgs) {
      if (typeof arg === "string" && NOISE_PATTERNS.some((p) => arg.includes(p))) {
        return true;
      }
      const errStr = arg?.stack || arg?.message || "";
      if (typeof errStr === "string" && NOISE_PATTERNS.some((p) => errStr.includes(p))) {
        return true;
      }
      if (
        arg &&
        typeof arg === "object" &&
        (arg.constructor?.name === "SessionEntry" ||
          arg.constructor?.name === "SessionRecord" ||
          ("_chains" in arg && "registrationId" in arg))
      ) {
        return true;
      }
    }
  }

  return false;
}

// 1. Interceptar a nivel de Streams (stdout / stderr) para capturar cualquier Console o write directo
const origStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, encoding?: any, callback?: any): boolean => {
  if (isNoiseLog(chunk)) {
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  }
  return origStdoutWrite(chunk, encoding, callback);
};

const origStderrWrite = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (chunk: any, encoding?: any, callback?: any): boolean => {
  if (isNoiseLog(chunk)) {
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  }
  return origStderrWrite(chunk, encoding, callback);
};

// 2. Interceptar a nivel de console methods
const origInfo = console.info;
console.info = (...args: any[]) => {
  if (isNoiseLog(args)) return;
  origInfo(...args);
};

const origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (isNoiseLog(args)) return;
  origWarn(...args);
};

const origLog = console.log;
console.log = (...args: any[]) => {
  if (isNoiseLog(args)) return;
  origLog(...args);
};

const origError = console.error;
console.error = (...args: any[]) => {
  if (isNoiseLog(args)) return;
  origError(...args);
};
