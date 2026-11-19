import { WASocket } from "@whiskeysockets/baileys";
import { dispatchDueMissions } from "../services/mission.service.js";

let missionInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 30 * 1000;

export function startMissionScheduler(sock: WASocket): void {
  stopMissionScheduler();
  dispatchDueMissions(sock).catch(() => {});
  missionInterval = setInterval(() => {
    dispatchDueMissions(sock).catch(() => {});
  }, CHECK_INTERVAL_MS);
  console.log("[Mission Scheduler] ⏰ Monitor de misiones temporales activo (cada 30s).");
}

export function stopMissionScheduler(): void {
  if (missionInterval) {
    clearInterval(missionInterval);
    missionInterval = null;
  }
}
