import { describe, expect, it } from "vitest";
import type { PollPalette } from "@/lib/insights/palette";
import {
  rampFor,
  toStops,
  bucketOf,
  matchFill,
  stepFill,
  choroplethBands,
  formatIndicator,
} from "./demographics-fill";

const SEQ = ["s0", "s1", "s2", "s3", "s4"] as const;
const DIV = ["d0", "d1", "d2", "d3", "d4"] as const;
const palette = { seq: SEQ, diverging: DIV, nodata: "#nd" } as unknown as PollPalette;
const breaks = [32, 36, 40, 45];

describe("rampFor", () => {
  it("uses the sequential ramp for neutral indicators and diverging for polarity ones", () => {
    expect(rampFor("neutral", palette)).toBe(SEQ);
    expect(rampFor("advantage", palette)).toBe(DIV);
    expect(rampFor("disadvantage", palette)).toBe(DIV);
  });
});

describe("toStops", () => {
  it("sorts ascending and drops duplicates (mapbox step requires strictly increasing)", () => {
    expect(toStops([40, 32, 36, 40, 45])).toEqual([32, 36, 40, 45]);
    expect(toStops([5, 5, 5])).toEqual([5]);
    expect(toStops([Number.NaN, 3, 1])).toEqual([1, 3]);
  });
});

describe("bucketOf", () => {
  it("maps a value to its ramp index against ascending stops", () => {
    const stops = [32, 36, 40, 45];
    expect(bucketOf(20, stops)).toBe(0);
    expect(bucketOf(32, stops)).toBe(1); // >= first break
    expect(bucketOf(38, stops)).toBe(2);
    expect(bucketOf(50, stops)).toBe(4); // above the top break
  });
});

describe("matchFill", () => {
  it("builds a match expression tinting each region by its bucket colour", () => {
    const expr = matchFill([{ code: "A", value: 20 }, { code: "B", value: 50 }], breaks, SEQ, "#nd") as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["get", "code"]);
    // A(20)→bucket0→s0, B(50)→bucket4→s4, fallback nodata last.
    expect(expr.slice(2)).toEqual(["A", "s0", "B", "s4", "#nd"]);
  });

  it("skips null/non-finite values and returns bare nodata when nothing paints", () => {
    const expr = matchFill([{ code: "A", value: null }], breaks, SEQ, "#nd");
    expect(expr).toBe("#nd");
  });

  it("returns nodata when there are no breaks (loader unrun)", () => {
    expect(matchFill([{ code: "A", value: 1 }], [], SEQ, "#nd")).toBe("#nd");
  });
});

describe("stepFill", () => {
  it("paints the tile's value property by a step scale, null → nodata", () => {
    const expr = stepFill(breaks, SEQ, "#nd") as unknown[];
    expect(expr[0]).toBe("case");
    expect(expr[1]).toEqual(["==", ["get", "value"], null]);
    expect(expr[2]).toBe("#nd");
    const step = expr[3] as unknown[];
    expect(step[0]).toBe("step");
    expect(step[1]).toEqual(["get", "value"]);
    expect(step[2]).toBe("s0"); // below first break
    expect(step.slice(3)).toEqual([32, "s1", 36, "s2", 40, "s3", 45, "s4"]);
  });

  it("returns nodata with no breaks", () => {
    expect(stepFill([], SEQ, "#nd")).toBe("#nd");
  });
});

describe("choroplethBands", () => {
  it("builds legend bands from min + breaks, open-ended at the top", () => {
    const bands = choroplethBands(breaks, 20, SEQ);
    expect(bands).toEqual([
      { lo: 20, hi: 32, colour: "s0" },
      { lo: 32, hi: 36, colour: "s1" },
      { lo: 36, hi: 40, colour: "s2" },
      { lo: 40, hi: 45, colour: "s3" },
      { lo: 45, hi: null, colour: "s4" },
    ]);
  });

  it("is empty without breaks", () => {
    expect(choroplethBands([], 0, SEQ)).toEqual([]);
  });
});

describe("formatIndicator", () => {
  it("formats by unit", () => {
    expect(formatIndicator(12.5, "percent")).toBe("12.5%");
    expect(formatIndicator(40, "percent")).toBe("40%");
    expect(formatIndicator(1850, "aud")).toBe("$1,850");
    expect(formatIndicator(38.4, "years")).toBe("38");
    expect(formatIndicator(7, "decile")).toBe("7");
    expect(formatIndicator(2600, "count")).toBe("2,600");
  });
});
