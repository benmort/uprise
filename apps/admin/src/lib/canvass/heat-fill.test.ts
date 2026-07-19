import { describe, expect, it } from "vitest";
import type { HeatCell } from "@/lib/api/campaigns";
import {
  HEAT_ALPHAS,
  HEAT_BAND_LABELS,
  HEAT_FACTORS,
  HEAT_FACTOR_LABELS,
  heatBandLabel,
  heatCellAlpha,
  heatConfidence,
  heatFill,
  heatFilter,
  heatLegendBands,
  heatOpacity,
  withHoldoutOverride,
} from "./heat-fill";

const RAMP = ["r0", "r1", "r2", "r3", "r4"] as const;
const NODATA = "#nd";

function cell(overrides: Partial<HeatCell> = {}): HeatCell {
  return {
    sa1Code: "10101100101",
    score: 72,
    band: 4,
    subScores: { doors: 0.8, efficiency: 0.5 },
    available: ["doors", "efficiency"],
    flags: [],
    coverageFraction: 1,
    ...overrides,
  };
}

describe("HEAT_FACTORS", () => {
  it("carries nine factor groups — the three opt-in signals last — each with a label", () => {
    expect(HEAT_FACTORS).toHaveLength(9);
    expect(HEAT_FACTORS.slice(6)).toEqual(["community", "progressive", "informality"]);
    for (const f of HEAT_FACTORS) expect(HEAT_FACTOR_LABELS[f]).toBeTruthy();
    expect(HEAT_FACTOR_LABELS.community).toBe("Multicultural communities");
    expect(HEAT_FACTOR_LABELS.progressive).toBe("Progressive baseline (Voice 2023)");
    expect(HEAT_FACTOR_LABELS.informality).toBe("Informal-vote risk");
  });
});

describe("HEAT_BAND_LABELS / heatBandLabel", () => {
  it("labels bands by action, band 5 hottest = Knock first", () => {
    expect(HEAT_BAND_LABELS).toHaveLength(5);
    expect(heatBandLabel(1)).toBe("Skip – no data");
    expect(heatBandLabel(2)).toBe("Low");
    expect(heatBandLabel(3)).toBe("Moderate");
    expect(heatBandLabel(4)).toBe("Strong");
    expect(heatBandLabel(5)).toBe("Knock first");
  });

  it("reads null / out-of-range bands as no data", () => {
    expect(heatBandLabel(null)).toBe("No data");
    expect(heatBandLabel(0)).toBe("No data");
    expect(heatBandLabel(6)).toBe("No data");
  });
});

describe("heatFill", () => {
  it("builds a match expression mapping each SA1 to its band's ramp colour", () => {
    const expr = heatFill(
      [cell({ sa1Code: "A", band: 1 }), cell({ sa1Code: "B", band: 5 }), cell({ sa1Code: "C", band: 3 })],
      RAMP,
      NODATA,
    ) as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["get", "code"]);
    // Band 1 → ramp[0], band 5 → ramp[4]; fallback nodata last.
    expect(expr.slice(2)).toEqual(["A", "r0", "B", "r4", "C", "r2", NODATA]);
  });

  it("paints null-score cells the no-data colour (never cold)", () => {
    const expr = heatFill(
      [cell({ sa1Code: "A", score: null, band: null, flags: ["insufficient_data"] })],
      RAMP,
      NODATA,
    ) as unknown[];
    expect(expr.slice(2)).toEqual(["A", NODATA, NODATA]);
  });

  it("clamps a band beyond the ramp to the top colour", () => {
    const expr = heatFill([cell({ sa1Code: "A", band: 9 })], RAMP, NODATA) as unknown[];
    expect(expr.slice(2)).toEqual(["A", "r4", NODATA]);
  });

  it("dedupes repeated codes (mapbox match throws on duplicate labels)", () => {
    const expr = heatFill([cell({ sa1Code: "A", band: 1 }), cell({ sa1Code: "A", band: 5 })], RAMP, NODATA) as unknown[];
    expect(expr.slice(2)).toEqual(["A", "r0", NODATA]);
  });

  it("returns bare nodata for an empty run", () => {
    expect(heatFill([], RAMP, NODATA)).toBe(NODATA);
  });
});

describe("heatConfidence / heatCellAlpha", () => {
  it("is 0 (floor alpha) for null-score cells", () => {
    const c = cell({ score: null, band: null });
    expect(heatConfidence(c)).toBe(0);
    expect(heatCellAlpha(c)).toBe(HEAT_ALPHAS[0]);
  });

  it("hits the top bin with every factor available and a strong doors rank", () => {
    const c = cell({ available: [...HEAT_FACTORS], subScores: { doors: 1 } });
    expect(heatConfidence(c)).toBe(1);
    expect(heatCellAlpha(c)).toBe(HEAT_ALPHAS[2]);
  });

  it("sits in the middle bin on partial factors + middling doors", () => {
    const c = cell({ available: ["doors", "efficiency", "freshness"], subScores: { doors: 0.5 } });
    // 3/9 * 0.5 + 0.5 * 0.5 ≈ 0.42 → middle bin.
    expect(heatCellAlpha(c)).toBe(HEAT_ALPHAS[1]);
  });

  it("falls to the low bin when data is thin", () => {
    const c = cell({ available: ["doors"], subScores: { doors: 0.1 } });
    expect(heatCellAlpha(c)).toBe(HEAT_ALPHAS[0]);
  });

  it("treats a missing doors sub-score as 0 and clamps out-of-range ranks", () => {
    expect(heatConfidence(cell({ available: [...HEAT_FACTORS], subScores: {} }))).toBe(0.5);
    expect(heatConfidence(cell({ available: [...HEAT_FACTORS], subScores: { doors: 7 } }))).toBe(1);
  });
});

describe("heatOpacity", () => {
  it("builds a match expression of per-cell alpha bins with a 0 fallback", () => {
    const expr = heatOpacity([
      cell({ sa1Code: "A", available: [...HEAT_FACTORS], subScores: { doors: 1 } }),
      cell({ sa1Code: "B", score: null, band: null }),
    ]) as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["get", "code"]);
    expect(expr.slice(2)).toEqual(["A", HEAT_ALPHAS[2], "B", HEAT_ALPHAS[0], 0]);
  });

  it("dedupes codes and returns flat 0 for an empty run", () => {
    expect(heatOpacity([])).toBe(0);
    const expr = heatOpacity([cell({ sa1Code: "A" }), cell({ sa1Code: "A" })]) as unknown[];
    expect(expr.filter((x) => x === "A")).toHaveLength(1);
  });
});

describe("heatFilter", () => {
  it("restricts to the run's codes, including null-score cells", () => {
    const f = heatFilter([cell({ sa1Code: "A" }), cell({ sa1Code: "B", score: null, band: null })]) as unknown[];
    expect(f).toEqual(["in", ["get", "code"], ["literal", ["A", "B"]]]);
  });

  it("dedupes and is undefined when there is nothing to paint", () => {
    expect(heatFilter([])).toBeUndefined();
    const f = heatFilter([cell({ sa1Code: "A" }), cell({ sa1Code: "A" })]) as unknown[];
    expect((f[2] as unknown[])[1]).toEqual(["A"]);
  });
});

describe("heatLegendBands", () => {
  it("cuts five labelled bands from four breaks, open-ended at the top", () => {
    const bands = heatLegendBands([20, 40, 60, 80], RAMP);
    expect(bands).toEqual([
      { band: 1, label: "Skip – no data", colour: "r0", lo: 0, hi: 20 },
      { band: 2, label: "Low", colour: "r1", lo: 20, hi: 40 },
      { band: 3, label: "Moderate", colour: "r2", lo: 40, hi: 60 },
      { band: 4, label: "Strong", colour: "r3", lo: 60, hi: 80 },
      { band: 5, label: "Knock first", colour: "r4", lo: 80, hi: null },
    ]);
  });

  it("degrades ranges to null when the run has no breaks (labels still render)", () => {
    const bands = heatLegendBands([], RAMP);
    expect(bands).toHaveLength(5);
    expect(bands[0]).toMatchObject({ lo: 0, hi: null });
    expect(bands[4]).toMatchObject({ lo: null, hi: null });
    expect(bands.map((b) => b.label)).toEqual([...HEAT_BAND_LABELS]);
  });
});

describe("withHoldoutOverride", () => {
  it("wraps the base fill so holdout codes paint the override colour", () => {
    const base = "#123456";
    const expr = withHoldoutOverride(base, ["A", "B", "A"], "#999") as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[2]).toEqual(["A", "B"]); // deduped
    expect(expr[3]).toBe("#999");
    expect(expr[4]).toBe(base);
  });

  it("returns the base untouched with no holdout", () => {
    expect(withHoldoutOverride("#123456", [], "#999")).toBe("#123456");
  });
});
