import { describe, expect, it } from "vitest";
import { densityBands, densityFill, densityNoDataFilter, densityStops, formatDensity, type DensityScale } from "./density";

const SEQ = ["#s1", "#s2", "#s3", "#s4", "#s5"] as const;
const NODATA = "#nd";

/** The real LGA scale: 547 regions, q20 = 0.4 addresses/km², max = 9,611. */
const LGA: DensityScale = { kind: "lga", regions: 547, min: 0.0004, max: 9611.2, breaks: [0.4, 1.7, 8.3, 242.9] };

describe("densityStops", () => {
  it("passes strictly ascending breaks through", () => {
    expect(densityStops([0.4, 1.7, 8.3, 242.9])).toEqual([0.4, 1.7, 8.3, 242.9]);
  });

  it("collapses duplicate quantiles — SA1 parks and water all sit at zero", () => {
    // Mapbox's ["step"] throws on non-increasing stops, so this is not cosmetic.
    expect(densityStops([0, 0, 0, 12.5])).toEqual([0, 12.5]);
    expect(densityStops([0, 0, 0, 0])).toEqual([0]);
  });

  it("sorts, and drops non-finite values", () => {
    expect(densityStops([8.3, 0.4, 242.9, 1.7])).toEqual([0.4, 1.7, 8.3, 242.9]);
    expect(densityStops([1, Number.NaN, 2, Number.POSITIVE_INFINITY])).toEqual([1, 2]);
  });

  it("is empty for an empty scale", () => {
    expect(densityStops([])).toEqual([]);
  });
});

describe("densityFill", () => {
  it("steps through the ramp on the quantile breaks", () => {
    expect(densityFill(LGA, SEQ, NODATA)).toEqual([
      "case",
      ["==", ["get", "density"], null],
      NODATA,
      ["step", ["get", "density"], "#s1", 0.4, "#s2", 1.7, "#s3", 8.3, "#s4", 242.9, "#s5"],
    ]);
  });

  it("paints an unmeasured region no-data, not the sparsest colour", () => {
    const [caseOp, test, fallback] = densityFill(LGA, SEQ, NODATA) as unknown[];
    expect(caseOp).toBe("case");
    expect(test).toEqual(["==", ["get", "density"], null]);
    expect(fallback).toBe(NODATA);
  });

  it("emits exactly one more colour than it has stops", () => {
    const expr = densityFill(LGA, SEQ, NODATA) as unknown[];
    const step = expr[3] as unknown[];
    const stops = step.slice(3).filter((_, i) => i % 2 === 0);
    const colours = step.slice(2).filter((_, i) => i % 2 === 0);
    expect(colours).toHaveLength(stops.length + 1);
  });

  it("survives collapsed quantiles by drawing fewer bands", () => {
    const flat: DensityScale = { kind: "sa1", regions: 61811, min: 0, max: 20, breaks: [0, 0, 0, 12.5] };
    const expr = densityFill(flat, SEQ, NODATA) as unknown[];
    expect(expr[3]).toEqual(["step", ["get", "density"], "#s1", 0, "#s2", 12.5, "#s3"]);
  });

  it("refuses to invent a gradient before geo:density has run", () => {
    const unrun: DensityScale = { kind: "sa1", regions: 0, min: null, max: null, breaks: [] };
    expect(densityFill(unrun, SEQ, NODATA)).toBe(NODATA);
    expect(densityFill(null, SEQ, NODATA)).toBe(NODATA);
  });
});

describe("densityBands", () => {
  it("gives one band per colour, open-ended at the top", () => {
    expect(densityBands(LGA, SEQ)).toEqual([
      { lo: 0.0004, hi: 0.4, colour: "#s1" },
      { lo: 0.4, hi: 1.7, colour: "#s2" },
      { lo: 1.7, hi: 8.3, colour: "#s3" },
      { lo: 8.3, hi: 242.9, colour: "#s4" },
      { lo: 242.9, hi: null, colour: "#s5" },
    ]);
  });

  it("starts at the layer's own minimum, not at zero", () => {
    const dense: DensityScale = { kind: "iloc", regions: 1065, min: 4.2, max: 13174, breaks: [1.4, 17.6, 185.5, 677.2] };
    expect(densityBands(dense, SEQ)[0].lo).toBe(4.2);
  });

  it("is empty when there is no scale to legend", () => {
    expect(densityBands(null, SEQ)).toEqual([]);
    expect(densityBands({ kind: "sa1", regions: 0, min: null, max: null, breaks: [] }, SEQ)).toEqual([]);
  });
});

describe("formatDensity", () => {
  it.each([
    [0.0004, "0.0"],
    [0.4, "0.4"],
    [8.3, "8"],
    [242.9, "243"],
    [9611.2, "9,611"],
  ])("formats %s as %s", (v, expected) => {
    expect(formatDensity(v)).toBe(expected);
  });
});

describe("densityNoDataFilter", () => {
  it("matches features whose baked density is null", () => {
    expect(densityNoDataFilter()).toEqual(["==", ["get", "density"], null]);
  });
});
