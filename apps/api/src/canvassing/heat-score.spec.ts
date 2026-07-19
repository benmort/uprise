import {
  GATE_DOORS,
  HEAT_FACTORS,
  HEAT_PRESETS,
  HeatWeights,
  RawHeatRow,
  fitScore,
  hazenRanks,
  resolveWeights,
  scoreCells,
} from "./heat-score";

/** A fully-populated, healthy row; override per case. */
function row(overrides: Partial<RawHeatRow> = {}): RawHeatRow {
  return {
    sa1Code: overrides.sa1Code ?? "sa1",
    doors: 120,
    occupiedMbs: 6,
    areaKm2: 0.5,
    fitValue: 5,
    pollPercent: 22, // an "undecided %" style response
    pollIsNet: false,
    electorateMajorityShare: 1,
    competitiveness: 0.8,
    attributedVotes: 400,
    alignedFpShare: null,
    referendumYesPct: null,
    contacts: 40,
    supporters: 12,
    dispositioned: 20,
    knockDecay: 10,
    communityValue: 40,
    informalityShare: 0.05,
    coverageFraction: 1,
    ...overrides,
  };
}

/** A small realistic boundary: rich / dense / sparse / cold cells. */
function boundary(): RawHeatRow[] {
  return [
    row({ sa1Code: "A", doors: 300, areaKm2: 0.3, occupiedMbs: 8, contacts: 60, supporters: 30, dispositioned: 40, knockDecay: 5 }),
    row({ sa1Code: "B", doors: 120, areaKm2: 0.5, occupiedMbs: 6 }),
    row({ sa1Code: "C", doors: 45, areaKm2: 2.0, occupiedMbs: 4, contacts: 2, supporters: 1, dispositioned: 1, knockDecay: 0 }),
    row({ sa1Code: "D", doors: 12, areaKm2: 8.0, occupiedMbs: 2, contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0 }),
  ];
}

const COVERAGE = HEAT_PRESETS.coverage;
const PERSUASION = HEAT_PRESETS.persuasion;

describe("hazenRanks", () => {
  it("ranks with the Hazen (r−0.5)/N convention", () => {
    expect(hazenRanks([10, 20, 30])).toEqual([0.5 / 3, 1.5 / 3, 2.5 / 3]);
  });

  it("gives ties their average rank and passes nulls through", () => {
    const ranks = hazenRanks([10, 20, 20, null, 40]);
    expect(ranks[0]).toBeCloseTo(0.5 / 4);
    expect(ranks[1]).toBeCloseTo(2 / 4); // positions 2,3 → mean 2.5 − 0.5 = 2
    expect(ranks[1]).toEqual(ranks[2]);
    expect(ranks[3]).toBeNull();
    expect(ranks[4]).toBeCloseTo(3.5 / 4);
  });
});

describe("fitScore", () => {
  it("peaks at the target and falls linearly to the span edge", () => {
    expect(fitScore(5.5, 5.5, 4.5)).toBe(1);
    expect(fitScore(1, 5.5, 4.5)).toBeCloseTo(0);
    expect(fitScore(10, 5.5, 4.5)).toBeCloseTo(0);
    expect(fitScore(3.25, 5.5, 4.5)).toBeCloseTo(0.5);
  });
});

describe("scoreCells — golden behaviour", () => {
  it("scores a healthy boundary with all factors available on the rich cell", () => {
    const { cells, meta } = scoreCells(boundary(), { weights: COVERAGE });
    const a = cells.find((c) => c.sa1Code === "A")!;
    expect(a.score).not.toBeNull();
    expect(a.available).toEqual(expect.arrayContaining(["doors", "persuadability", "supporter", "fit", "efficiency", "freshness"]));
    expect(meta.sa1Count).toBe(4);
    expect(meta.factorCoverage.doors).toBe(1);
  });

  it("high-door dense cells outrank sparse ones under Coverage", () => {
    const { cells } = scoreCells(boundary(), { weights: COVERAGE });
    const byCode = Object.fromEntries(cells.map((c) => [c.sa1Code, c.score]));
    expect(byCode.A!).toBeGreaterThan(byCode.D ?? 0);
    expect(byCode.B!).toBeGreaterThan(byCode.D ?? 0);
  });

  it("the doors gate crushes a tiny-door cell even with perfect other factors", () => {
    const rows = [
      row({ sa1Code: "tiny", doors: 3, competitiveness: 1, pollPercent: 50 }),
      row({ sa1Code: "big", doors: 300 }),
    ];
    const { cells } = scoreCells(rows, { weights: COVERAGE });
    const tiny = cells.find((c) => c.sa1Code === "tiny")!;
    // gate = 3/30 = 0.1 → score can never exceed 10.
    expect(tiny.score).not.toBeNull();
    expect(tiny.score!).toBeLessThanOrEqual(10);
  });

  it("returns null (insufficient_data), never 0, when under the 60% weight floor", () => {
    // Only doors + efficiency resolvable; under Persuasion that's (20+15)/100 = 35%.
    const bare = [
      row({ sa1Code: "bare1", fitValue: null, pollPercent: null, competitiveness: null, referendumYesPct: null, contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0 }),
      row({ sa1Code: "bare2", doors: 60, fitValue: null, pollPercent: null, competitiveness: null, referendumYesPct: null, contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0 }),
    ];
    const { cells } = scoreCells(bare, { weights: PERSUASION });
    for (const c of cells) {
      expect(c.score).toBeNull();
      expect(c.band).toBeNull();
      expect(c.flags).toContain("insufficient_data");
    }
  });

  it("the same bare cells DO score under Coverage (85% of weight available)", () => {
    const bare = [
      row({ sa1Code: "bare1", fitValue: null, pollPercent: null, competitiveness: null, contacts: 1, dispositioned: 0, supporters: 0, knockDecay: 0 }),
      row({ sa1Code: "bare2", doors: 60, fitValue: null, pollPercent: null, competitiveness: null, contacts: 1, dispositioned: 0, supporters: 0, knockDecay: 0 }),
    ];
    const { cells } = scoreCells(bare, { weights: COVERAGE });
    expect(cells.every((c) => c.score != null)).toBe(true);
  });

  it("shrinks a 1-of-1 supporter share towards the boundary mean (never reads 100%)", () => {
    const rows = [
      row({ sa1Code: "one", contacts: 1, supporters: 1, dispositioned: 1, knockDecay: 0 }),
      row({ sa1Code: "many", contacts: 100, supporters: 20, dispositioned: 80, knockDecay: 0 }),
    ];
    const { cells } = scoreCells(rows, { weights: HEAT_PRESETS.gotv });
    const one = cells.find((c) => c.sa1Code === "one")!;
    // Raw share is 1.0; shrunken (1 + 20·p̄)/(1 + 20) with p̄=(21/81)≈0.26 ⇒ ≈0.30.
    expect(one.subScores.supporter).toBeDefined();
    expect(one.subScores.supporter!).toBeLessThan(0.7);
  });

  it("suppressed SEIFA drops fit from available (no imputation)", () => {
    const rows = [row({ sa1Code: "s", fitValue: null }), row({ sa1Code: "t" })];
    const { cells } = scoreCells(rows, { weights: COVERAGE });
    const s = cells.find((c) => c.sa1Code === "s")!;
    expect(s.available).not.toContain("fit");
    expect(s.subScores.fit).toBeUndefined();
  });

  it("flags interpolated booth rows and low-confidence attribution", () => {
    const rows = [
      row({ sa1Code: "idw", attributedVotes: null }),
      row({ sa1Code: "thin", attributedVotes: 12 }),
      row({ sa1Code: "solid", attributedVotes: 500 }),
    ];
    const { cells } = scoreCells(rows, { weights: PERSUASION });
    expect(cells.find((c) => c.sa1Code === "idw")!.flags).toContain("interpolated_booths");
    expect(cells.find((c) => c.sa1Code === "thin")!.flags).toContain("low_confidence");
    expect(cells.find((c) => c.sa1Code === "solid")!.flags).not.toContain("low_confidence");
  });

  it("flags SA1s straddling electorates (majority share < 0.9)", () => {
    const rows = [row({ sa1Code: "split", electorateMajorityShare: 0.6 }), row({ sa1Code: "whole" })];
    const { cells } = scoreCells(rows, { weights: PERSUASION });
    expect(cells.find((c) => c.sa1Code === "split")!.flags).toContain("splitAttribution");
    expect(cells.find((c) => c.sa1Code === "whole")!.flags).not.toContain("splitAttribution");
  });

  it("reads a NET poll row as closeness-to-even, not as soft share", () => {
    const even = scoreCells([row({ pollPercent: 0, pollIsNet: true, competitiveness: null })], { weights: PERSUASION });
    const landslide = scoreCells([row({ pollPercent: 80, pollIsNet: true, competitiveness: null })], { weights: PERSUASION });
    expect(even.cells[0].subScores.persuadability!).toBeGreaterThan(landslide.cells[0].subScores.persuadability!);
  });

  it("falls back to referendum closeness when neither poll nor booth data exists", () => {
    const rows = [
      row({ sa1Code: "close", pollPercent: null, competitiveness: null, attributedVotes: null, referendumYesPct: 49 }),
      row({ sa1Code: "safe", pollPercent: null, competitiveness: null, attributedVotes: null, referendumYesPct: 78 }),
    ];
    const { cells, meta } = scoreCells(rows, { weights: PERSUASION });
    expect(cells.find((c) => c.sa1Code === "close")!.subScores.persuadability!).toBeGreaterThan(
      cells.find((c) => c.sa1Code === "safe")!.subScores.persuadability!,
    );
    expect(meta.lowResolutionFactors).toEqual(
      expect.arrayContaining([expect.objectContaining({ component: "referendum" })]),
    );
  });

  it("cold universe (zero contacts anywhere) drops supporter + freshness for every cell", () => {
    const rows = boundary().map((r) => ({ ...r, contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0, alignedFpShare: null }));
    const { cells, meta } = scoreCells(rows, { weights: COVERAGE });
    for (const c of cells) {
      expect(c.available).not.toContain("supporter");
      expect(c.available).not.toContain("freshness");
    }
    expect(meta.factorCoverage.supporter).toBe(0);
    expect(meta.factorCoverage.freshness).toBe(0);
  });

  it("aligned-party FP share substitutes for the contact half when contacts are absent", () => {
    const rows = [
      row({ sa1Code: "strong", contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0, alignedFpShare: 0.6 }),
      row({ sa1Code: "weak", contacts: 0, supporters: 0, dispositioned: 0, knockDecay: 0, alignedFpShare: 0.2 }),
    ];
    const { cells } = scoreCells(rows, { weights: HEAT_PRESETS.gotv });
    expect(cells.find((c) => c.sa1Code === "strong")!.subScores.supporter!).toBeCloseTo(0.6);
    expect(cells.find((c) => c.sa1Code === "weak")!.subScores.supporter!).toBeCloseTo(0.2);
  });

  it("recent knocks depress freshness; long-unknocked reads fresh", () => {
    const rows = [
      row({ sa1Code: "fresh", doors: 100, knockDecay: 0 }),
      row({ sa1Code: "hit", doors: 100, knockDecay: 80 }),
    ];
    const { cells } = scoreCells(rows, { weights: COVERAGE });
    expect(cells.find((c) => c.sa1Code === "fresh")!.subScores.freshness!).toBe(1);
    expect(cells.find((c) => c.sa1Code === "hit")!.subScores.freshness!).toBeCloseTo(0.2);
  });

  it("reports rank-degenerate doors as a constant factor scored 0.5 flat", () => {
    const rows = [row({ sa1Code: "x", doors: 50 }), row({ sa1Code: "y", doors: 50 })];
    const { cells, meta } = scoreCells(rows, { weights: COVERAGE });
    expect(meta.constantFactors).toContain("doors");
    for (const c of cells) expect(c.subScores.doors).toBe(0.5);
  });
});

describe("scoreCells — invariants", () => {
  it("all scores in [0,100]; breaks non-decreasing; bands consistent with breaks", () => {
    const { cells, meta } = scoreCells(boundary(), { weights: COVERAGE });
    for (let i = 1; i < meta.breaks.length; i++) {
      expect(meta.breaks[i]).toBeGreaterThanOrEqual(meta.breaks[i - 1]);
    }
    for (const c of cells) {
      if (c.score == null) continue;
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      const expectedBand = 1 + meta.breaks.filter((b) => c.score! > b).length;
      expect(c.band).toBe(expectedBand);
    }
  });

  it("is order-independent", () => {
    const rows = boundary();
    const forward = scoreCells(rows, { weights: COVERAGE });
    const reversed = scoreCells([...rows].reverse(), { weights: COVERAGE });
    for (const cell of forward.cells) {
      const twin = reversed.cells.find((c) => c.sa1Code === cell.sa1Code)!;
      expect(twin.score).toBe(cell.score);
      expect(twin.band).toBe(cell.band);
    }
  });

  it("monotonicity: more doors never lowers the cell's score (others fixed)", () => {
    const base = boundary();
    const bumped = base.map((r) => (r.sa1Code === "C" ? { ...r, doors: r.doors * 3 } : r));
    const before = scoreCells(base, { weights: COVERAGE }).cells.find((c) => c.sa1Code === "C")!;
    const after = scoreCells(bumped, { weights: COVERAGE }).cells.find((c) => c.sa1Code === "C")!;
    expect(after.score!).toBeGreaterThanOrEqual(before.score!);
  });

  it("renormalisation ≡ weight removal: a missing factor scores like weight 0", () => {
    const missingFit = [row({ sa1Code: "m", fitValue: null }), row({ sa1Code: "n", fitValue: null, doors: 60 })];
    const viaMissing = scoreCells(missingFit, { weights: COVERAGE });
    const zeroFit: HeatWeights = { ...COVERAGE, fit: 0 };
    const withValuePresent = [row({ sa1Code: "m" }), row({ sa1Code: "n", doors: 60 })];
    const viaZeroWeight = scoreCells(withValuePresent, { weights: zeroFit });
    for (const cell of viaMissing.cells) {
      const twin = viaZeroWeight.cells.find((c) => c.sa1Code === cell.sa1Code)!;
      expect(twin.score!).toBeCloseTo(cell.score!, 10);
    }
  });

  it("preset sanity: Coverage tracks doors; GOTV tracks supporter share", () => {
    const rows = boundary();
    const coverage = scoreCells(rows, { weights: COVERAGE }).cells;
    const gotv = scoreCells(rows, { weights: HEAT_PRESETS.gotv }).cells;
    // A has both the most doors and the strongest supporter base — top under both.
    const top = (cells: typeof coverage) =>
      [...cells].filter((c) => c.score != null).sort((a, b) => b.score! - a.score!)[0].sa1Code;
    expect(top(coverage)).toBe("A");
    expect(top(gotv)).toBe("A");
  });
});

describe("resolveWeights", () => {
  it("applies overrides over the preset and ignores junk", () => {
    const w = resolveWeights("coverage", { doors: 50, persuadability: -3 as never, fit: Number.NaN as never });
    expect(w.doors).toBe(50);
    expect(w.persuadability).toBe(HEAT_PRESETS.coverage.persuadability);
    expect(w.fit).toBe(HEAT_PRESETS.coverage.fit);
  });

  it("every preset's weights cover all factors and sum to 100", () => {
    for (const preset of Object.values(HEAT_PRESETS)) {
      expect(HEAT_FACTORS.every((f) => typeof preset[f] === "number")).toBe(true);
      expect(HEAT_FACTORS.reduce((s, f) => s + preset[f], 0)).toBe(100);
    }
  });

  it("gate constant matches the documented door threshold", () => {
    expect(GATE_DOORS).toBe(30);
  });
});

describe("opt-in factors (community / progressive / informality)", () => {
  const withOptIns: HeatWeights = {
    ...HEAT_PRESETS.coverage,
    doors: 20, freshness: 15, // rebalance so opt-ins fit
    community: 15, progressive: 10, informality: 10,
  };

  it("weight-0 defaults leave preset scores byte-identical to the pre-factor blend", () => {
    const rows = boundary();
    const before = scoreCells(rows, { weights: HEAT_PRESETS.coverage });
    // Values present on the rows but weights are 0 → excluded from available + the blend.
    for (const c of before.cells) {
      expect(c.available).not.toContain("community");
      expect(c.available).not.toContain("progressive");
      expect(c.available).not.toContain("informality");
    }
  });

  it("community uses the lens mapping (default higher-is-hotter over a 100-point span)", () => {
    const rows = [row({ sa1Code: "hi", communityValue: 80 }), row({ sa1Code: "lo", communityValue: 10 })];
    const { cells } = scoreCells(rows, { weights: withOptIns });
    expect(cells.find((c) => c.sa1Code === "hi")!.subScores.community!).toBeCloseTo(0.8);
    expect(cells.find((c) => c.sa1Code === "lo")!.subScores.community!).toBeCloseTo(0.1);
  });

  it("progressive anchors the referendum Yes share; informality saturates at 15%", () => {
    const rows = [
      row({ sa1Code: "x", referendumYesPct: 62, informalityShare: 0.06 }),
      row({ sa1Code: "y", referendumYesPct: 30, informalityShare: 0.2 }),
    ];
    const { cells, meta } = scoreCells(rows, { weights: withOptIns });
    const x = cells.find((c) => c.sa1Code === "x")!;
    const y = cells.find((c) => c.sa1Code === "y")!;
    expect(x.subScores.progressive!).toBeCloseTo(0.62);
    expect(x.subScores.informality!).toBeCloseTo(0.4);
    expect(y.subScores.informality!).toBe(1); // 20% > the 15% ceiling → saturated
    expect(meta.lowResolutionFactors).toEqual(
      expect.arrayContaining([expect.objectContaining({ factor: "progressive", resolution: "ced" })]),
    );
  });

  it("suppressed community value drops the factor for that cell only", () => {
    const rows = [row({ sa1Code: "m", communityValue: null }), row({ sa1Code: "n" })];
    const { cells } = scoreCells(rows, { weights: withOptIns });
    expect(cells.find((c) => c.sa1Code === "m")!.available).not.toContain("community");
    expect(cells.find((c) => c.sa1Code === "n")!.available).toContain("community");
  });
});
