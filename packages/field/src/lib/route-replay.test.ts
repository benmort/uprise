import { describe, expect, it } from "vitest";
import {
  buildReplayTimeline,
  eventsBetween,
  pinStatesAt,
  positionAt,
  replayClock,
  replayDurationMs,
  REPLAY_SPEED,
  type ReplayKnock,
  type ReplayStop,
} from "./route-replay";

const T0 = Date.parse("2026-07-22T01:00:00Z");
const MIN = 60_000;

// Two knocks 10 minutes apart, walking due north along a simple line.
const KNOCKS: ReplayKnock[] = [
  { stopId: "i1", lat: -33.9, lng: 151.2, atMs: T0, disposition: "meaningful_conversation" },
  { stopId: "i2", lat: -33.89, lng: 151.2, atMs: T0 + 10 * MIN, disposition: "no_answer" },
];
const PAST_LINE: GeoJSON.LineString = {
  type: "LineString",
  coordinates: [
    [151.2, -33.9],
    [151.2, -33.895], // midpoint vertex
    [151.2, -33.89],
  ],
};
const PENDING: ReplayStop[] = [
  { id: "i3", lat: -33.88, lng: 151.2 },
  { id: "i4", lat: -33.87, lng: 151.2 },
];
const NOW = T0 + 12 * MIN;

function timeline() {
  return buildReplayTimeline({
    knocks: KNOCKS,
    pendingStops: PENDING,
    origin: { lat: -33.89, lng: 151.2 },
    nowMs: NOW,
    pastLine: PAST_LINE,
    futureLine: null, // straight-line future
  });
}

describe("buildReplayTimeline", () => {
  it("spans first knock → last projected door, with NOW between the halves", () => {
    const tl = timeline();
    expect(tl.startMs).toBe(T0);
    expect(tl.nowMs).toBe(NOW);
    expect(tl.endMs).toBeGreaterThan(NOW);
    // 2 real + 2 projected events, ascending.
    expect(tl.events).toHaveLength(4);
    expect(tl.events.map((e) => e.projected)).toEqual([false, false, true, true]);
    const times = tl.events.map((e) => e.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("projects future arrivals at pace + dwell (further door arrives later)", () => {
    const tl = timeline();
    const [p1, p2] = tl.events.filter((e) => e.projected);
    // ~1.11km at 1.3 m/s ≈ 14.2 min to the first pending door.
    expect(p1.atMs - NOW).toBeGreaterThan(12 * MIN);
    expect(p1.atMs - NOW).toBeLessThan(17 * MIN);
    // Second door: another ~14.2 min walk + 60s dwell after the first.
    expect(p2.atMs - p1.atMs).toBeGreaterThan(13 * MIN);
  });

  it("handles an empty past (shift not started) and empty future (all done)", () => {
    const noPast = buildReplayTimeline({
      knocks: [],
      pendingStops: PENDING,
      origin: { lat: -33.89, lng: 151.2 },
      nowMs: NOW,
      pastLine: null,
      futureLine: null,
    });
    expect(noPast.events.every((e) => e.projected)).toBe(true);
    expect(noPast.startMs).toBe(NOW);

    const noFuture = buildReplayTimeline({
      knocks: KNOCKS,
      pendingStops: [],
      origin: null,
      nowMs: NOW,
      pastLine: PAST_LINE,
      futureLine: null,
    });
    expect(noFuture.events.every((e) => !e.projected)).toBe(true);
    expect(noFuture.endMs).toBe(NOW); // clamped up to now
  });
});

describe("positionAt", () => {
  it("sits on the first knock at start, the midpoint vertex halfway, the second knock at its time", () => {
    const tl = timeline();
    expect(positionAt(tl, T0)).toMatchObject({ lat: -33.9, lng: 151.2, projected: false });
    // Halfway in time = halfway in distance on a uniform line → the midpoint vertex.
    const mid = positionAt(tl, T0 + 5 * MIN)!;
    expect(mid.lat).toBeCloseTo(-33.895, 3);
    expect(positionAt(tl, T0 + 10 * MIN)!.lat).toBeCloseTo(-33.89, 3);
  });

  it("flags the ghost half once past NOW and clamps at the ends", () => {
    const tl = timeline();
    expect(positionAt(tl, NOW + MIN)!.projected).toBe(true);
    const end = positionAt(tl, tl.endMs + 999_999)!;
    expect(end.lat).toBeCloseTo(-33.87, 3); // parked at the last pending door
  });

  it("returns null when there is nothing to replay at all", () => {
    const empty = buildReplayTimeline({
      knocks: [],
      pendingStops: [],
      origin: null,
      nowMs: NOW,
      pastLine: null,
      futureLine: null,
    });
    expect(positionAt(empty, NOW)).toBeNull();
  });
});

describe("pinStatesAt / eventsBetween", () => {
  it("flips pins as their timestamps pass, real before projected", () => {
    const tl = timeline();
    expect(pinStatesAt(tl, T0 - 1).size).toBe(0);
    expect(pinStatesAt(tl, T0 + 1).get("i1")).toEqual({ projected: false });
    const atEnd = pinStatesAt(tl, tl.endMs);
    expect(atEnd.size).toBe(4);
    expect(atEnd.get("i3")).toEqual({ projected: true });
  });

  it("eventsBetween feeds the popup queue with newly crossed events only", () => {
    const tl = timeline();
    const crossed = eventsBetween(tl, T0 + 1, T0 + 10 * MIN);
    expect(crossed).toHaveLength(1);
    expect(crossed[0].stopId).toBe("i2");
    expect(crossed[0].disposition).toBe("no_answer");
  });
});

describe("replayClock / replayDurationMs", () => {
  it("maps real elapsed time at 360× — one shift-hour in ten real seconds", () => {
    const tl = timeline();
    expect(replayClock(tl, 0)).toBe(tl.startMs);
    expect(replayClock(tl, 1000)).toBe(tl.startMs + 360_000); // 1 real second → 6 shift-minutes
    expect(replayClock(tl, 999_999_999)).toBe(tl.endMs); // clamped
    expect(REPLAY_SPEED).toBe(360);
  });

  it("total duration is span ÷ speed", () => {
    const tl = timeline();
    expect(replayDurationMs(tl)).toBeCloseTo((tl.endMs - tl.startMs) / 360, 5);
  });
});
