import { describe, expect, it } from "vitest";
import { applyPushResponse, parsePushSettings, type PushSettings } from "./push-settings";

const wrap = (push: Record<string, unknown>) => ({ dataSync: { push } });

describe("parsePushSettings", () => {
  // Push itself is opt-IN — nothing leaves uprise until someone turns it on.
  it("treats push as off unless explicitly enabled", () => {
    expect(parsePushSettings(null).enabled).toBe(false);
    expect(parsePushSettings(undefined).enabled).toBe(false);
    expect(parsePushSettings({}).enabled).toBe(false);
    expect(parsePushSettings(wrap({})).enabled).toBe(false);
    expect(parsePushSettings(wrap({ enabled: "yes" })).enabled).toBe(false);
    expect(parsePushSettings(wrap({ enabled: true })).enabled).toBe(true);
  });

  // Most streams are opt-OUT: absent means on, so a new connection pushes what an organiser expects.
  it("defaults the opt-out streams to on", () => {
    const s = parsePushSettings(wrap({ enabled: true })).streams;
    expect(s.dispositions).toBe(true);
    expect(s.surveyAnswers).toBe(true);
    expect(s.tags).toBe(true);
    expect(s.rsvps).toBe(true);
  });

  // Reply BODIES are the most sensitive stream, so silence must mean "no".
  it("defaults textReplies to OFF — it is opt-in", () => {
    expect(parsePushSettings(wrap({ enabled: true })).streams.textReplies).toBe(false);
    expect(parsePushSettings(wrap({ enabled: true, streams: { textReplies: true } })).streams.textReplies).toBe(true);
  });

  it("honours an explicit false on an opt-out stream", () => {
    const s = parsePushSettings(wrap({ enabled: true, streams: { tags: false } })).streams;
    expect(s.tags).toBe(false);
    expect(s.dispositions).toBe(true);
  });

  it("survives a malformed settings blob rather than throwing", () => {
    expect(() => parsePushSettings({ dataSync: "nope" } as never)).not.toThrow();
    expect(parsePushSettings({ dataSync: "nope" } as never).enabled).toBe(false);
  });
});

describe("applyPushResponse", () => {
  const current: PushSettings = {
    enabled: false,
    streams: { dispositions: true, surveyAnswers: true, tags: true, textReplies: false, rsvps: true },
  };

  /**
   * THE regression. The card's switches render from a prop the parent holds in plain useState, and
   * the save handlers only called `invalidateApi("/integrations/connections")` — a no-op here,
   * because no `useApi` holder of that key is mounted on this page. So the PATCH persisted, a green
   * toast claimed success, and the switch never moved.
   */
  it("reflects the saved state so the switch actually moves", () => {
    const next = applyPushResponse(current, { push: { enabled: true, streams: {} } } as never);
    expect(next.enabled).toBe(true);
  });

  it("applies a per-stream change, including turning one OFF", () => {
    const next = applyPushResponse(current, {
      push: { enabled: true, streams: { surveyAnswers: false } },
    } as never);
    expect(next.streams.surveyAnswers).toBe(false);
    // Untouched streams keep their current value rather than snapping back to a default.
    expect(next.streams.dispositions).toBe(true);
  });

  it("keeps the current view when the response carries nothing usable", () => {
    expect(applyPushResponse(current, null)).toEqual(current);
    expect(applyPushResponse(current, undefined)).toEqual(current);
    expect(applyPushResponse(current, {} as never)).toEqual(current);
  });

  it("is idempotent — re-applying the same response changes nothing", () => {
    const response = { push: { enabled: true, streams: { tags: false } } } as never;
    const once = applyPushResponse(current, response);
    expect(applyPushResponse(once, response)).toEqual(once);
  });
});
