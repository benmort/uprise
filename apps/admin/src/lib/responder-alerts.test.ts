import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  loadResponderAlertSettings,
  saveResponderAlertSettings,
  loadBlastWatchSettings,
  saveBlastWatchSettings,
  loadOwnershipMap,
  saveOwnershipMap,
  loadSnoozeMap,
  saveSnoozeMap,
  isInQuietHours,
  playResponderAlertSound,
  DEFAULT_RESPONDER_ALERT_SETTINGS,
  RESPONDER_ALERT_SETTINGS_KEY,
  RESPONDER_BLAST_WATCH_KEY,
  RESPONDER_OWNERSHIP_KEY,
  RESPONDER_SNOOZE_KEY,
  type ResponderAlertSettings,
} from "./responder-alerts";

// In-memory localStorage stand-in — the module only needs get/set.
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

let store: ReturnType<typeof makeStorage>;

// Records every `new Audio(src)` so we can assert playback behaviour.
class MockAudio {
  static created: MockAudio[] = [];
  src: string;
  volume = 1;
  currentTime = 1;
  play = vi.fn(() => Promise.resolve());
  constructor(src: string) {
    this.src = src;
    MockAudio.created.push(this);
  }
}

beforeEach(() => {
  store = makeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
  MockAudio.created = [];
  (globalThis as { Audio?: unknown }).Audio = MockAudio;
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { Audio?: unknown }).Audio;
  vi.useRealTimers();
});

describe("loadResponderAlertSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadResponderAlertSettings()).toEqual(DEFAULT_RESPONDER_ALERT_SETTINGS);
  });

  it("merges stored partial settings over the defaults", () => {
    store.setItem(RESPONDER_ALERT_SETTINGS_KEY, JSON.stringify({ currentAgent: "Priya", defaultProfile: "alert" }));
    const loaded = loadResponderAlertSettings();
    expect(loaded.currentAgent).toBe("Priya");
    expect(loaded.defaultProfile).toBe("alert");
    expect(loaded.soundEnabled).toBe(DEFAULT_RESPONDER_ALERT_SETTINGS.soundEnabled);
  });

  it("clamps volume, quiet hours and SLA minutes into range", () => {
    store.setItem(
      RESPONDER_ALERT_SETTINGS_KEY,
      JSON.stringify({
        volume: 5,
        quietHoursStart: 99,
        quietHoursEnd: -4,
        slaWarningMinutes: 0,
        slaBreachMinutes: 0,
      }),
    );
    const loaded = loadResponderAlertSettings();
    expect(loaded.volume).toBe(1);
    expect(loaded.quietHoursStart).toBe(23);
    expect(loaded.quietHoursEnd).toBe(0);
    expect(loaded.slaWarningMinutes).toBe(1);
    expect(loaded.slaBreachMinutes).toBe(2);
  });

  it("falls back to defaults on malformed JSON", () => {
    store.setItem(RESPONDER_ALERT_SETTINGS_KEY, "{not json");
    expect(loadResponderAlertSettings()).toEqual(DEFAULT_RESPONDER_ALERT_SETTINGS);
  });
});

describe("save/load round-trips", () => {
  it("persists and reloads alert settings", () => {
    const next: ResponderAlertSettings = { ...DEFAULT_RESPONDER_ALERT_SETTINGS, currentAgent: "Sam", volume: 0.3 };
    saveResponderAlertSettings(next);
    expect(JSON.parse(store.getItem(RESPONDER_ALERT_SETTINGS_KEY) as string).currentAgent).toBe("Sam");
    expect(loadResponderAlertSettings().volume).toBe(0.3);
  });

  it("persists and reloads blast-watch settings, defaulting a non-string blastId", () => {
    saveBlastWatchSettings({ blastId: "bl1", enabled: true, profile: "alert" });
    expect(loadBlastWatchSettings()).toEqual({ blastId: "bl1", enabled: true, profile: "alert" });

    store.setItem(RESPONDER_BLAST_WATCH_KEY, JSON.stringify({ blastId: 123, enabled: true, profile: "subtle" }));
    expect(loadBlastWatchSettings().blastId).toBe("");
  });

  it("defaults blast-watch when nothing is stored", () => {
    expect(loadBlastWatchSettings()).toEqual({ blastId: "", enabled: false, profile: "alert" });
  });

  it("persists and reloads the ownership map", () => {
    saveOwnershipMap({ t1: "Sam" });
    expect(store.getItem(RESPONDER_OWNERSHIP_KEY)).toBe(JSON.stringify({ t1: "Sam" }));
    expect(loadOwnershipMap()).toEqual({ t1: "Sam" });
  });

  it("persists and reloads the snooze map", () => {
    saveSnoozeMap({ t1: 1000 });
    expect(store.getItem(RESPONDER_SNOOZE_KEY)).toBe(JSON.stringify({ t1: 1000 }));
    expect(loadSnoozeMap()).toEqual({ t1: 1000 });
  });

  it("returns empty maps when nothing is stored", () => {
    expect(loadOwnershipMap()).toEqual({});
    expect(loadSnoozeMap()).toEqual({});
  });
});

describe("save is a no-op without a window", () => {
  it("does not throw and writes nothing", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => saveResponderAlertSettings(DEFAULT_RESPONDER_ALERT_SETTINGS)).not.toThrow();
    expect(() => saveBlastWatchSettings({ blastId: "", enabled: false, profile: "off" })).not.toThrow();
    expect(() => saveOwnershipMap({})).not.toThrow();
    expect(() => saveSnoozeMap({})).not.toThrow();
    expect(store._map.size).toBe(0);
  });

  it("load falls back to defaults without a window", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadResponderAlertSettings()).toEqual(DEFAULT_RESPONDER_ALERT_SETTINGS);
  });
});

describe("isInQuietHours", () => {
  const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0);

  it("is never quiet when start equals end", () => {
    expect(isInQuietHours(at(12), 9, 9)).toBe(false);
  });

  it("same-day window is inclusive of start, exclusive of end", () => {
    expect(isInQuietHours(at(8), 9, 17)).toBe(false);
    expect(isInQuietHours(at(9), 9, 17)).toBe(true);
    expect(isInQuietHours(at(12), 9, 17)).toBe(true);
    expect(isInQuietHours(at(17), 9, 17)).toBe(false);
  });

  it("overnight window wraps past midnight", () => {
    expect(isInQuietHours(at(23), 22, 7)).toBe(true);
    expect(isInQuietHours(at(3), 22, 7)).toBe(true);
    expect(isInQuietHours(at(12), 22, 7)).toBe(false);
  });
});

describe("playResponderAlertSound", () => {
  const settings = (over: Partial<ResponderAlertSettings> = {}): ResponderAlertSettings => ({
    ...DEFAULT_RESPONDER_ALERT_SETTINGS,
    // 9→17 window; the tests set the clock outside it unless proving suppression.
    quietHoursStart: 9,
    quietHoursEnd: 17,
    volume: 0.6,
    ...over,
  });

  function setHour(hour: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, hour, 0, 0));
  }

  it("plays the alert sound with the profile-scaled volume outside quiet hours", () => {
    setHour(20);
    playResponderAlertSound("alert", settings());
    expect(MockAudio.created).toHaveLength(1);
    const audio = MockAudio.created[0];
    expect(audio.src).toContain("clapstick");
    expect(audio.volume).toBeCloseTo(0.6);
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("scales the volume down for the subtle profile", () => {
    setHour(20);
    playResponderAlertSound("subtle", settings());
    expect(MockAudio.created[0].volume).toBeCloseTo(0.51);
  });

  it("clamps the computed volume to at most 1", () => {
    setHour(20);
    playResponderAlertSound("alert", settings({ volume: 5 }));
    expect(MockAudio.created[0].volume).toBe(1);
  });

  it("does nothing for the off profile", () => {
    setHour(20);
    playResponderAlertSound("off", settings());
    expect(MockAudio.created).toHaveLength(0);
  });

  it("does nothing when sound is disabled or reduced-audio is on", () => {
    setHour(20);
    playResponderAlertSound("alert", settings({ soundEnabled: false }));
    playResponderAlertSound("alert", settings({ reducedAudio: true }));
    expect(MockAudio.created).toHaveLength(0);
  });

  it("suppresses during quiet hours", () => {
    setHour(12); // inside the 9→17 window
    playResponderAlertSound("alert", settings());
    expect(MockAudio.created).toHaveLength(0);
  });

  it("ignoreQuietHours forces playback during quiet hours", () => {
    setHour(12);
    playResponderAlertSound("alert", settings(), { ignoreQuietHours: true });
    expect(MockAudio.created).toHaveLength(1);
  });

  it("does nothing when Audio is unavailable", () => {
    setHour(20);
    delete (globalThis as { Audio?: unknown }).Audio;
    expect(() => playResponderAlertSound("alert", settings())).not.toThrow();
    expect(MockAudio.created).toHaveLength(0);
  });

  it("does nothing without a window", () => {
    setHour(20);
    delete (globalThis as { window?: unknown }).window;
    playResponderAlertSound("alert", settings());
    expect(MockAudio.created).toHaveLength(0);
  });
});
