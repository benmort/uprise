import { describe, expect, it } from "vitest";
import {
  gapsBetween,
  humaniseGap,
  isBackingOff,
  ribbonOffsets,
  verdictOf,
  type Cycle,
} from "./queue-firehose";

const at = (iso: string, over: Partial<Cycle> = {}): Cycle => ({
  attempt: 1,
  at: iso,
  outcome: "advanced",
  ...over,
});

describe("humaniseGap", () => {
  it("uses units a person would say out loud", () => {
    expect(humaniseGap(500)).toBe("instant");
    expect(humaniseGap(45_000)).toBe("45s");
    expect(humaniseGap(9.5 * 60_000)).toBe("9.5 min");
    expect(humaniseGap(38 * 60_000)).toBe("38 min");
    expect(humaniseGap(5.5 * 3_600_000)).toBe("5.5h");
    expect(humaniseGap(9 * 86_400_000)).toBe("9 days");
    expect(humaniseGap(54 * 86_400_000)).toBe("54 days");
  });

  it("drops a trailing .0 rather than saying '9.0 min'", () => {
    expect(humaniseGap(9 * 60_000)).toBe("9 min");
    expect(humaniseGap(2 * 3_600_000)).toBe("2h");
  });
});

describe("ribbonOffsets", () => {
  // Linear spacing against a nine-day tail collapses the first attempts into one pixel; the whole
  // point of the ribbon is that every beat stays visible while the gaps visibly widen.
  it("keeps early beats visible against a long tail", () => {
    const cycles = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:09:30Z"),
      at("2026-08-01T00:28:30Z"),
      at("2026-08-10T00:00:00Z"),
    ];
    const offsets = ribbonOffsets(cycles);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBeCloseTo(1, 5);
    // Under linear spacing the second beat would sit at ~0.0007.
    expect(offsets[1]).toBeGreaterThan(0.1);
    expect(offsets[2]).toBeGreaterThan(offsets[1]);
  });

  // The ribbon's whole job is "are the waits growing?". Segment widths must therefore be ordered
  // the same way the waits are — spacing by cumulative elapsed time got this backwards, drawing
  // the 9.5-minute wait wider than the 19-minute one because of the jump off the origin.
  it("draws a longer wait as a wider segment", () => {
    const cycles = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:09:30Z"), // +9.5 min
      at("2026-08-01T00:28:30Z"), // +19 min
      at("2026-08-01T02:23:30Z"), // +1.9h
      at("2026-08-10T22:00:00Z"), // +9.8 days
    ];
    const offsets = ribbonOffsets(cycles);
    const widths = offsets.map((o, i) => (i === 0 ? 0 : o - offsets[i - 1])).slice(1);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("is monotonic", () => {
    const cycles = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:05:00Z"),
      at("2026-08-01T01:00:00Z"),
      at("2026-08-02T00:00:00Z"),
    ];
    const offsets = ribbonOffsets(cycles);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });

  it("handles the degenerate cases without NaN", () => {
    expect(ribbonOffsets([])).toEqual([]);
    expect(ribbonOffsets([at("2026-08-01T00:00:00Z")])).toEqual([0]);
    const sameInstant = ribbonOffsets([
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:00:00Z"),
    ]);
    expect(sameInstant).toEqual([0, 0.5, 1]);
    expect(sameInstant.every(Number.isFinite)).toBe(true);
  });
});

describe("verdictOf", () => {
  const now = Date.parse("2026-08-01T02:00:00Z");

  it("says idle when nothing has run", () => {
    expect(verdictOf([], now)).toBe("idle");
  });

  it("says working while a cycle is in flight", () => {
    expect(verdictOf([at("2026-08-01T01:59:00Z", { outcome: "running" })], now)).toBe("working");
  });

  it("says healthy when every cycle advanced", () => {
    expect(
      verdictOf([at("2026-08-01T01:00:00Z"), at("2026-08-01T01:30:00Z")], now),
    ).toBe("healthy");
  });

  it("says failing when recent attempts are losing", () => {
    const cycles = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:30:00Z", { outcome: "failed", error: "decrypt" }),
      at("2026-08-01T01:00:00Z", { outcome: "failed", error: "decrypt" }),
    ];
    expect(verdictOf(cycles, now)).toBe("failing");
  });

  // Failing and stalled call for different actions — read the error vs check the worker. Collapsing
  // them into "stuck" is what produced a UI telling someone to check a healthy worker.
  it("distinguishes stalled (nothing attempting) from failing (attempts losing)", () => {
    const waitingLong = [at("2026-08-01T00:00:00Z", { outcome: "waiting" })];
    expect(verdictOf(waitingLong, now)).toBe("stalled");

    const waitingBriefly = [at("2026-08-01T01:55:00Z", { outcome: "waiting" })];
    expect(verdictOf(waitingBriefly, now)).toBe("working");
  });
});

describe("gapsBetween / isBackingOff", () => {
  it("reports the gap from the previous cycle, zero for the first", () => {
    const gaps = gapsBetween([at("2026-08-01T00:00:00Z"), at("2026-08-01T00:10:00Z")]);
    expect(gaps).toEqual([0, 600_000]);
  });

  it("spots a widening backoff", () => {
    const growing = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:09:30Z"),
      at("2026-08-01T00:28:30Z"),
      at("2026-08-01T01:06:30Z"),
    ];
    expect(isBackingOff(growing)).toBe(true);
  });

  it("does not call a steady cadence a backoff", () => {
    const steady = [
      at("2026-08-01T00:00:00Z"),
      at("2026-08-01T00:10:00Z"),
      at("2026-08-01T00:20:00Z"),
      at("2026-08-01T00:30:00Z"),
    ];
    expect(isBackingOff(steady)).toBe(false);
    expect(isBackingOff([at("2026-08-01T00:00:00Z")])).toBe(false);
  });
});
