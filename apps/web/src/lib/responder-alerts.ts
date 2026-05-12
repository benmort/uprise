"use client";

export type AlertSoundProfile = "off" | "subtle" | "alert";

export type ResponderAlertSettings = {
  soundEnabled: boolean;
  volume: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  reducedAudio: boolean;
  defaultProfile: AlertSoundProfile;
  outsideInboxSound: boolean;
  currentAgent: string;
  slaWarningMinutes: number;
  slaBreachMinutes: number;
};

export type BlastWatchSettings = {
  blastId: string;
  enabled: boolean;
  profile: AlertSoundProfile;
};

export const RESPONDER_ALERT_SETTINGS_KEY = "yarns.inbox.alertSettings";
export const RESPONDER_BLAST_WATCH_KEY = "yarns.inbox.blastWatch";
export const RESPONDER_OWNERSHIP_KEY = "yarns.inbox.ownership";
export const RESPONDER_SNOOZE_KEY = "yarns.inbox.snooze";
const RESPONDER_ALERT_SOUND_SRC = "/sounds/short-clapstick.wav";

export const DEFAULT_RESPONDER_ALERT_SETTINGS: ResponderAlertSettings = {
  soundEnabled: true,
  volume: 0.6,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  reducedAudio: false,
  defaultProfile: "subtle",
  outsideInboxSound: true,
  currentAgent: "Agent",
  slaWarningMinutes: 5,
  slaBreachMinutes: 15,
};

const DEFAULT_BLAST_WATCH: BlastWatchSettings = {
  blastId: "",
  enabled: false,
  profile: "alert",
};

function readStorageValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadResponderAlertSettings(): ResponderAlertSettings {
  const stored = readStorageValue<Partial<ResponderAlertSettings>>(
    RESPONDER_ALERT_SETTINGS_KEY,
    {},
  );
  return {
    ...DEFAULT_RESPONDER_ALERT_SETTINGS,
    ...stored,
    volume: Math.min(1, Math.max(0, Number(stored.volume ?? DEFAULT_RESPONDER_ALERT_SETTINGS.volume))),
    quietHoursStart: Math.min(
      23,
      Math.max(0, Math.trunc(Number(stored.quietHoursStart ?? DEFAULT_RESPONDER_ALERT_SETTINGS.quietHoursStart))),
    ),
    quietHoursEnd: Math.min(
      23,
      Math.max(0, Math.trunc(Number(stored.quietHoursEnd ?? DEFAULT_RESPONDER_ALERT_SETTINGS.quietHoursEnd))),
    ),
    slaWarningMinutes: Math.max(
      1,
      Math.trunc(Number(stored.slaWarningMinutes ?? DEFAULT_RESPONDER_ALERT_SETTINGS.slaWarningMinutes)),
    ),
    slaBreachMinutes: Math.max(
      2,
      Math.trunc(Number(stored.slaBreachMinutes ?? DEFAULT_RESPONDER_ALERT_SETTINGS.slaBreachMinutes)),
    ),
  };
}

export function saveResponderAlertSettings(settings: ResponderAlertSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESPONDER_ALERT_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadBlastWatchSettings(): BlastWatchSettings {
  const stored = readStorageValue<Partial<BlastWatchSettings>>(RESPONDER_BLAST_WATCH_KEY, {});
  return {
    ...DEFAULT_BLAST_WATCH,
    ...stored,
    blastId: typeof stored.blastId === "string" ? stored.blastId : "",
  };
}

export function saveBlastWatchSettings(settings: BlastWatchSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESPONDER_BLAST_WATCH_KEY, JSON.stringify(settings));
}

export function loadOwnershipMap(): Record<string, string> {
  return readStorageValue<Record<string, string>>(RESPONDER_OWNERSHIP_KEY, {});
}

export function saveOwnershipMap(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESPONDER_OWNERSHIP_KEY, JSON.stringify(value));
}

export function loadSnoozeMap(): Record<string, number> {
  return readStorageValue<Record<string, number>>(RESPONDER_SNOOZE_KEY, {});
}

export function saveSnoozeMap(value: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESPONDER_SNOOZE_KEY, JSON.stringify(value));
}

export function isInQuietHours(
  now: Date,
  quietHoursStart: number,
  quietHoursEnd: number,
): boolean {
  const hour = now.getHours();
  if (quietHoursStart === quietHoursEnd) return false;
  if (quietHoursStart < quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  return hour >= quietHoursStart || hour < quietHoursEnd;
}

export function playResponderAlertSound(
  profile: AlertSoundProfile,
  settings: ResponderAlertSettings,
  options?: { ignoreQuietHours?: boolean },
) {
  const ignoreQuietHours = Boolean(options?.ignoreQuietHours);
  if (typeof window === "undefined") return;
  if (!settings.soundEnabled || settings.reducedAudio || profile === "off") return;
  if (isInQuietHours(new Date(), settings.quietHoursStart, settings.quietHoursEnd) && !ignoreQuietHours) return;
  if (typeof Audio === "undefined") return;

  const audio = new Audio(RESPONDER_ALERT_SOUND_SRC);
  const profileMultiplier = profile === "subtle" ? 0.85 : 1;
  audio.volume = Math.min(1, Math.max(0, settings.volume * profileMultiplier));
  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}
