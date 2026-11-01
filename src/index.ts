import "dotenv/config";
import "./services/logger-silence.js";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  GroupMetadata,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";
import { initPrisma } from "./services/db/prisma.js";
import {
  initUserCache,
  syncGroupParticipants,
  getCachedUserProfile,
} from "./services/db/user.service.js";
import { refreshReflectionCache } from "./services/db/reflection.service.js";
import { initStickersDirectory, syncStickersFromDb } from "./services/sticker.service.js";
import { syncCustomVoicesFromDb } from "./services/voice.service.js";
import { registerDynamicVoiceCommand } from "./commands/index.js";
import { initSoundsDirectory } from "./services/sound.service.js";
import { startMemorySynthesizer, stopMemorySynthesizer } from "./workers/memory-synthesizer.js";
import { startWeatherRotator, stopWeatherRotator } from "./workers/weather-rotator.js";
import { flushApiQuotaUsage } from "./services/token.service.js";
import { dispatchMessage } from "./handlers/dispatcher.js";
import {
  registerLidMapping,
  groupMetadataCache,
  invalidateGroupMetadataCache,
  getCachedGroupMetadata,
  GROUP_CACHE_TTL_MS,
} from "./services/whatsapp-identity.js";
import { initQuotaTracker } from "./services/token.service.js";
import { restoreGroupMutes } from "./services/admin-powers.service.js";
import { startHttpServer, updateServerBotState, registerBotController } from "./server.js";
import { initCommandBanService } from "./services/command-ban.service.js";
import {
  restoreAuthFromDb,
  syncAuthToDb,
  queueAuthSync,
  clearAuthFromDb,
} from "./services/db/auth-sync.service.js";

// Blindaje global anti-caídas
process.on("uncaughtException", (err) => {
  console.error("[Anti-Crash] Excepción no capturada:", err?.message || err);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[Anti-Crash] Promesa rechazada no capturada:", reason?.message || reason);
});

const TARGET_GROUP_JID: string = (process.env.GROUP_JID || "").replace(/['"]/g, "").trim();

let currentSock: WASocket | null = null;
let isReconnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isSuspended = false;

export async function suspendBot(): Promise<void> {
  if (isSuspended) return;
  isSuspended = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting = false;
  stopMemorySynthesizer();
  stopWeatherRotator();

  if (currentSock) {
    try {
      currentSock.ev.removeAllListeners("connection.update");
      currentSock.ev.removeAllListeners("creds.update");
      currentSock.ev.removeAllListeners("messages.upsert");
      currentSock.end(undefined);
    } catch {}
    currentSock = null;
  }
  updateServerBotState({ isConnected: false, isSuspended: true, qrCode: undefined });
  console.log("[Bot Control] ⏸️ Bot suspendido y socket desconectado.");
}

export async function resumeBot(): Promise<void> {
  if (!isSuspended) return;
  isSuspended = false;
  updateServerBotState({ isSuspended: false });
  console.log("[Bot Control] ▶️ Reanudando bot...");
  startMemorySynthesizer();
  await connectToWhatsApp();
}

export async function unlinkAndResetBot(): Promise<void> {
  console.log("[Bot Control] 🔄 Desvinculando sesión actual y reiniciando para nuevo QR...");
  isSuspended = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting = false;
  stopMemorySynthesizer();
  stopWeatherRotator();

  if (currentSock) {
    try {
      currentSock.ev.removeAllListeners("connection.update");
      currentSock.ev.removeAllListeners("creds.update");
      currentSock.ev.removeAllListeners("messages.upsert");
      currentSock.end(undefined);
    } catch {}
    currentSock = null;
  }

  await clearAuthFromDb().catch((err) => console.warn("[Bot Control] Error purgando DB auth:", err));

  try {
    fs.rmSync("auth_info", { recursive: true, force: true });
  } catch (cleanErr) {
    console.warn("[Bot Control] No se pudo borrar auth_info:", cleanErr);
  }

  updateServerBotState({ isConnected: false, isSuspended: false, qrCode: undefined, userPhone: undefined, userName: undefined });
  reconnectAttempts = 0;
  await connectToWhatsApp();
}

function scheduleReconnect(delayMs?: number): void {
  if (isSuspended || isReconnecting) return;
  isReconnecting = true;
  reconnectAttempts++;
  const waitMs =
    delayMs ??
    Math.min(3000 * Math.pow(1.5, Math.min(reconnectAttempts - 1, 6)), 60000);

  console.log(`[WhatsApp] Programando reconexión #${reconnectAttempts} en ${Math.round(waitMs / 1000)}s...`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    isReconnecting = false;
    try {
      await connectToWhatsApp();
    } catch (err: any) {
      console.error("[WhatsApp] Error en intento de reconexión:", err?.message || err);
      scheduleReconnect();
    }
  }, waitMs);
}

async function connectToWhatsApp(): Promise<void> {
  if (isSuspended) {
    console.log("[WhatsApp] Conexión omitida: el bot se encuentra suspendido.");
    return;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // 1. Limpieza rigurosa de socket anterior si existía para prevenir fugas de memoria
  if (currentSock) {
    try {
      currentSock.ev.removeAllListeners("connection.update");
      currentSock.ev.removeAllListeners("creds.update");
      currentSock.ev.removeAllListeners("messages.upsert");
      currentSock.ev.removeAllListeners("groups.update");
      currentSock.ev.removeAllListeners("group-participants.update");
      currentSock.ev.removeAllListeners("contacts.upsert");
      currentSock.ev.removeAllListeners("contacts.update");
      currentSock.end(new Error("Reconnecting socket"));
    } catch {
      // Ignorar errores en desconexión previa
    }
    currentSock = null;
  }

  // 2. Restaurar credenciales desde PostgreSQL (para Render y hosts en la nube)
  await restoreAuthFromDb();

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    logger: pino({ level: "warn" }),
    auth: state,
    syncFullHistory: false,
    cachedGroupMetadata: async (jid) => {
      const entry = groupMetadataCache.get(jid);
      if (entry && Date.now() - entry.timestamp < GROUP_CACHE_TTL_MS) {
        return entry.data;
      }
      return undefined;
    },
  });
  currentSock = sock;

  // Actualizar socket en el rotador de clima
  startWeatherRotator(sock);

  // Manejo del ciclo de vida de la conexión
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Escaneá el código QR con WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      updateServerBotState({ isConnected: false, qrCode: qr });
    }

    if (connection === "close") {
      updateServerBotState({ isConnected: false });
      if (isSuspended) {
        console.log("[WhatsApp] Conexión cerrada y bot suspendido. No se reintentará conexión.");
        return;
      }

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WhatsApp] Conexión cerrada (status: ${statusCode}).`);

      if (shouldReconnect) {
        scheduleReconnect();
      } else {
        console.log("[WhatsApp] Sesión cerrada permanentemente (Logged Out / 401).");
        console.log("[WhatsApp] Limpiando credenciales antiguas de 'auth_info' y PostgreSQL para solicitar nuevo QR...");
        stopMemorySynthesizer();
        stopWeatherRotator();

        // Purgar credenciales de PostgreSQL para que no se restauren credenciales muertas en Render
        await clearAuthFromDb().catch((err) => console.warn("[WhatsApp] Error purgando DB auth:", err));

        try {
          fs.rmSync("auth_info", { recursive: true, force: true });
        } catch (cleanErr) {
          console.warn("[WhatsApp] No se pudo borrar auth_info directamente:", cleanErr);
        }

        console.log("[WhatsApp] Reiniciando conexión para generar nuevo código QR...");
        reconnectAttempts = 0;
        setTimeout(() => {
          connectToWhatsApp().catch((e) => console.error("[WhatsApp] Error al reconectar para nuevo QR:", e));
        }, 2000);
      }
    } else if (connection === "open") {
      reconnectAttempts = 0;
      console.log("\n🚀 ¡empy-bot conectado y operativo!\n");

      // Actualizar estado del panel web
      updateServerBotState({
        isConnected: true,
        qrCode: undefined,
        userPhone: sock.user?.id ? sock.user.id.split(":")[0] : undefined,
        userName: sock.user?.name,
        lastConnectedAt: new Date(),
      });

      // Respaldar sesión actualizada en PostgreSQL
      queueAuthSync(1000);

      // Restaurar silencios de grupos si el bot se reinició durante un mute activo
      restoreGroupMutes(sock).catch((muteErr: any) => {
        console.warn("[Admin Powers] Error restaurando silencios al iniciar:", muteErr?.message || muteErr);
      });

      if (TARGET_GROUP_JID) {
        setTimeout(async () => {
          if (currentSock) {
            await syncGroupParticipants(currentSock, TARGET_GROUP_JID);
          }
        }, 3500);

      }
    }
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    queueAuthSync();
  });

  // Invalidación de caché de metadata grupal ante cambios en el grupo o sus miembros
  sock.ev.on("groups.update", (updates) => {
    for (const u of updates) {
      if (u.id && u.id === TARGET_GROUP_JID) invalidateGroupMetadataCache(u.id);
    }
  });

  sock.ev.on("group-participants.update", (update) => {
    if (update.id) {
      invalidateGroupMetadataCache(update.id);
      if (update.id === TARGET_GROUP_JID && currentSock) {
        syncGroupParticipants(currentSock, TARGET_GROUP_JID).catch(() => {});
      }
    }
  });

  // Escuchar eventos de contactos para aprender mapeos LID <-> Teléfono (filtrando exclusivamente miembros del grupo)
  sock.ev.on("contacts.upsert", async (contacts: any[]) => {
    for (const c of contacts) {
      const id = c.id || "";
      const lid = c.lid || "";
      if (id && lid && id.endsWith("@s.whatsapp.net") && lid.endsWith("@lid")) {
        if (getCachedUserProfile(id) || getCachedUserProfile(lid)) {
          await registerLidMapping(lid, id).catch(() => {});
        }
      }
    }
  });

  sock.ev.on("contacts.update", async (updates: any[]) => {
    for (const u of updates) {
      const id = u.id || "";
      const lid = u.lid || "";
      if (id && lid && id.endsWith("@s.whatsapp.net") && lid.endsWith("@lid")) {
        if (getCachedUserProfile(id) || getCachedUserProfile(lid)) {
          await registerLidMapping(lid, id).catch(() => {});
        }
      }
    }
  });

  // Rechazo de llamadas entrantes de audio/video por privado
  sock.ev.on("call", async (calls: any[]) => {
    for (const call of calls) {
      if (call.status === "offer" && call.id && call.from) {
        try {
          await sock.rejectCall(call.id, call.from);
          console.log(`[Anti-Spam] 📵 Llamada rechazada de ${call.from}`);
        } catch {}
      }
    }
  });

  // Cola FIFO de procesamiento por remoteJid para garantizar orden estricto de mensajes por chat
  const chatQueues = new Map<string, Promise<void>>();

  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (m.type !== "notify" || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        const jid = msg.key?.remoteJid || "";
        if (!TARGET_GROUP_JID || jid !== TARGET_GROUP_JID || !jid.endsWith("@g.us")) {
          continue;
        }
        const currentQueue = chatQueues.get(jid) || Promise.resolve();
        const nextQueue = currentQueue
          .then(async () => {
            await dispatchMessage(sock, msg);
          })
          .catch((msgErr: any) => {
            console.error("[Dispatch Message Error]:", msgErr?.message || msgErr);
          })
          .finally(() => {
            if (chatQueues.get(jid) === nextQueue) {
              chatQueues.delete(jid);
            }
          });
        chatQueues.set(jid, nextQueue);
      }
    } catch (msgLoopErr: any) {
      console.error("[Message Loop Error]:", msgLoopErr?.message || msgLoopErr);
    }
  });
}

/**
 * Bootstrap de aplicación: Inicializa servicios pesados y workers una única vez.
 */
async function bootstrap(): Promise<void> {
  console.log("[Bootstrap] Inicializando servidor web y servicios...");
  if (!TARGET_GROUP_JID) {
    console.warn("[Seguridad] ⚠️ ADVERTENCIA: GROUP_JID no configurado. Modo fail-closed activo.");
  }
  startHttpServer(); // Levanta servidor HTTP de salud y keep-alive para Render
  registerBotController({
    suspend: suspendBot,
    resume: resumeBot,
    unlink: unlinkAndResetBot,
    isSuspended: () => isSuspended,
  });
  initStickersDirectory();
  initSoundsDirectory();
  await initPrisma();
  await syncStickersFromDb();
  await syncCustomVoicesFromDb(registerDynamicVoiceCommand);
  await initQuotaTracker();
  await initUserCache();
  await refreshReflectionCache();
  await initCommandBanService();

  // El worker de síntesis se arranca una ÚNICA vez por ciclo de vida de la aplicación
  startMemorySynthesizer();

  await connectToWhatsApp();
}

// Cierre graceful ante señales de terminación del proceso
const handleShutdown = async (signal: string) => {
  console.log(`\n[Shutdown] Recibida señal ${signal}. Deteniendo servicios...`);
  stopMemorySynthesizer();
  stopWeatherRotator();
  try {
    await flushApiQuotaUsage();
    await syncAuthToDb();
  } catch {}
  if (currentSock) {
    try {
      await restoreGroupMutes(currentSock);
      currentSock.ev.removeAllListeners("connection.update");
      currentSock.ev.removeAllListeners("creds.update");
      currentSock.ev.removeAllListeners("messages.upsert");
      currentSock.end(undefined);
    } catch {}
  }
  process.exit(0);
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

bootstrap().catch((err) => {
  console.error("[Fatal Bootstrap Error]:", err);
  process.exit(1);
});