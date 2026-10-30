import { WASocket } from "@whiskeysockets/baileys";
import { getOrInitGlobalState, rotateGlobalWeather } from "../services/economy.service.js";


/**
 * Revisa el estado del clima y rota automáticamente si venció el período de 15 minutos.
 */
export async function checkAndRotateWeather(sock?: WASocket): Promise<void> {
  try {
    const { state } = await getOrInitGlobalState();
    const now = Date.now();
    const expiresAt = new Date(state.eventExpiresAt).getTime();

    if (now >= expiresAt) {
      const { newWeather } = await rotateGlobalWeather();
      console.log(`[Weather Rotator] 🌤️ Clima rotado a: ${newWeather.name} (${newWeather.id})`);
    }
  } catch (error) {
    console.error("[Weather Rotator] Error en revisión de clima:", error);
  }
}

/**
 * Inicia el worker de rotación de clima (modo pasivo para permitir reposo de la base de datos).
 */
export function startWeatherRotator(sock: WASocket): void {
  // Se ejecuta una única revisión al inicio sin dejar un loop activo en segundo plano
  checkAndRotateWeather(sock).catch(() => {});
  console.log("[Weather Rotator] 🌤️ Monitor de clima económico activo (rotación reactiva/on-demand).");
}

/**
 * Detiene el worker de clima limpiamente.
 */
export function stopWeatherRotator(): void {
  // No-op ya que no mantiene timers activos en segundo plano
}
