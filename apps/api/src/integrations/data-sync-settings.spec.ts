import { parseDataSyncSettings } from "./data-sync-settings";

describe("parseDataSyncSettings", () => {
  it("returns full defaults for a connection with no settings at all", () => {
    const s = parseDataSyncSettings(null);
    expect(s.pull).toEqual({ importTags: true, autoRefresh: { enabled: true, intervalHours: 24 } });
    expect(s.push.enabled).toBe(false); // write-back is an explicit per-nation opt-in
    expect(s.push.streams).toEqual({
      dispositions: true,
      surveyAnswers: true,
      tags: true,
      textReplies: false, // message bodies into a CRM is a privacy opt-in
      rsvps: true,
    });
    expect(s.push.supportLevelsEnabled).toBe(true);
    expect(s.push.supportLevelRequiresConsent).toBe(true);
    expect(s.push.createMissingPeople).toBe(true);
    expect(s.push.nbSenderId).toBeNull();
  });

  it("ignores the legacy settings blob that only carries baseUrl", () => {
    const s = parseDataSyncSettings({ baseUrl: "https://riverside.nationbuilder.com" });
    expect(s.push.enabled).toBe(false);
    expect(s.pull.importTags).toBe(true);
  });

  it("honours saved overrides and clamps the refresh interval", () => {
    const s = parseDataSyncSettings({
      dataSync: {
        pull: { importTags: false, autoRefresh: { enabled: false, intervalHours: 100000 } },
        push: { enabled: true, streams: { textReplies: true, rsvps: false }, nbSenderId: 42, tagPrefix: " up " },
      },
    });
    expect(s.pull.importTags).toBe(false);
    expect(s.pull.autoRefresh).toEqual({ enabled: false, intervalHours: 24 * 7 }); // clamped to a week
    expect(s.push.enabled).toBe(true);
    expect(s.push.streams.textReplies).toBe(true);
    expect(s.push.streams.rsvps).toBe(false);
    expect(s.push.streams.dispositions).toBe(true); // untouched stream keeps its default
    expect(s.push.nbSenderId).toBe(42);
    expect(s.push.tagPrefix).toBe("up");
  });

  it("never lets input switch the consent gate off — it is not configurable", () => {
    const s = parseDataSyncSettings({ dataSync: { push: { supportLevelRequiresConsent: false } } });
    expect(s.push.supportLevelRequiresConsent).toBe(true);
  });

  it("rejects malformed values (wrong types, sub-1 intervals, bad sender ids) back to defaults", () => {
    const s = parseDataSyncSettings({
      dataSync: {
        pull: { importTags: "yes", autoRefresh: { enabled: 1, intervalHours: 0 } },
        push: { enabled: "true", nbSenderId: -5 },
      },
    });
    expect(s.pull.importTags).toBe(true);
    expect(s.pull.autoRefresh).toEqual({ enabled: true, intervalHours: 24 });
    expect(s.push.enabled).toBe(false);
    expect(s.push.nbSenderId).toBeNull();
  });
});
