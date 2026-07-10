import { describe, expect, it } from "vitest";
import type { Crosstab, ToplineRow } from "@/lib/api/insights";
import {
  buildMatrix,
  categoryColumn,
  claimValue,
  crosstabValue,
  describeDrift,
  driftFlag,
  isAggregateColumn,
  reduceCrosstab,
  totalColumn,
} from "./evidence";

const col = (ordinal: number, group: string, value: string, over: Partial<{ baseN: number; reportable: boolean }> = {}) => ({
  ordinal,
  group,
  value,
  geoKind: null,
  geoCode: null,
  baseN: 400,
  reportable: true,
  ...over,
});

/** E3 — "which party's policy is this?", crossed by state voting intention. */
const E3: Crosstab = {
  poll: { id: "p1", title: "T", attribution: null },
  question: { code: "E3", title: "Whose policy?", category: "treaty", hasNet: false },
  groups: [
    { group: "Total", columns: [col(0, "Total", "Total", { baseN: 4003 })] },
    {
      group: "State voting intention",
      columns: [
        col(1, "State voting intention", "Coalition"),
        col(2, "State voting intention", "Labor"),
        col(3, "State voting intention", "Greens"),
        col(4, "State voting intention", "Independent", { baseN: 18, reportable: false }),
      ],
    },
  ],
  responses: [
    { label: "Pauline Hanson's One Nation", ordinal: 0, isNet: false, cells: { 0: 64.6, 1: 55.7, 2: 63.2, 3: 71.0, 4: 75.3 } },
    { label: "Liberal/National Coalition", ordinal: 1, isNet: false, cells: { 0: 15.0, 1: 24.1, 2: 9.8, 3: 11.2, 4: 8.0 } },
    { label: "Labor", ordinal: 2, isNet: false, cells: { 0: 9.6, 1: 8.0, 2: 12.0, 3: 7.1, 4: null } },
  ],
};

describe("totalColumn", () => {
  it("reads the whole-sample column as a topline", () => {
    expect(totalColumn(E3)).toEqual([
      { label: "Pauline Hanson's One Nation", percent: 64.6, isNet: false },
      { label: "Liberal/National Coalition", percent: 15.0, isNet: false },
      { label: "Labor", percent: 9.6, isNet: false },
    ]);
  });

  it("is empty when the crosstab has no Total group", () => {
    expect(totalColumn({ ...E3, groups: E3.groups.slice(1) })).toEqual([]);
  });
});

describe("categoryColumn", () => {
  it("reads one crossbreak category as a topline", () => {
    expect(categoryColumn(E3, "State voting intention", "Coalition")[0]).toEqual({
      label: "Pauline Hanson's One Nation",
      percent: 55.7,
      isNet: false,
    });
  });

  it("nulls every cell of a suppressed column rather than reporting it", () => {
    const rows = categoryColumn(E3, "State voting intention", "Independent");
    expect(rows.every((r) => r.percent === null)).toBe(true);
  });

  it("is empty for an unknown group or value", () => {
    expect(categoryColumn(E3, "Nope", "Coalition")).toEqual([]);
    expect(categoryColumn(E3, "State voting intention", "Nope")).toEqual([]);
  });
});

describe("reduceCrosstab", () => {
  it("reads one response across a breakdown, largest first", () => {
    const { rows } = reduceCrosstab(E3, { group: "State voting intention", response: "Pauline Hanson's One Nation" });
    expect(rows).toEqual([
      { label: "Greens", percent: 71.0 },
      { label: "Labor", percent: 63.2 },
      { label: "Coalition", percent: 55.7 },
    ]);
  });

  it("drops a suppressed column and counts it, rather than drawing it as zero", () => {
    const { rows, hidden } = reduceCrosstab(E3, {
      group: "State voting intention",
      response: "Pauline Hanson's One Nation",
    });
    // Independent (n=18) has a value of 75.3 in the cells, but its base is too small.
    expect(rows.map((r) => r.label)).not.toContain("Independent");
    expect(hidden).toBe(1);
  });

  it("drops a null cell too — 'we do not know' is not 'nobody'", () => {
    // The Independent column is both suppressed and null for this response; it must not
    // appear at all, rather than appear at 0%.
    const { rows, hidden } = reduceCrosstab(E3, { group: "State voting intention", response: "Labor" });
    expect(rows).toEqual([
      { label: "Labor", percent: 12.0 },
      { label: "Coalition", percent: 8.0 },
      { label: "Greens", percent: 7.1 },
    ]);
    expect(hidden).toBe(1);
  });

  it("returns nothing for an unknown group or response", () => {
    expect(reduceCrosstab(E3, { group: "Nope", response: "Labor" })).toEqual({ rows: [], hidden: 0, aggregates: 0 });
    expect(reduceCrosstab(E3, { group: "Total", response: "Nope" })).toEqual({ rows: [], hidden: 0, aggregates: 0 });
  });

  it("drops NET banner columns, which aggregate the categories beside them", () => {
    // The Age banner runs 18-24, 25-34, NET 18-34, … — charting the NET alongside its own
    // components double-counts those respondents and always out-ranks them.
    const withNet: Crosstab = {
      ...E3,
      groups: [
        E3.groups[0],
        {
          group: "Age",
          columns: [col(1, "Age", "18 - 24"), col(2, "Age", "25 - 34"), col(3, "Age", "NET 18-34")],
        },
      ],
      responses: [{ label: "Yes", ordinal: 0, isNet: false, cells: { 0: 45, 1: 60, 2: 55, 3: 57 } }],
    };
    const { rows, aggregates, hidden } = reduceCrosstab(withNet, { group: "Age", response: "Yes" });
    expect(rows.map((r) => r.label)).toEqual(["18 - 24", "25 - 34"]);
    expect(aggregates).toBe(1);
    expect(hidden).toBe(0); // an aggregate is omitted, not suppressed
  });
});

describe("isAggregateColumn", () => {
  it.each(["NET 18-34", "NET 50+", "net agree", "  NET Support  "])("treats %s as an aggregate", (v) => {
    expect(isAggregateColumn(v)).toBe(true);
  });

  it.each(["18 - 24", "Coalition", "Networked", "Netherlands"])("leaves %s alone", (v) => {
    expect(isAggregateColumn(v)).toBe(false);
  });
});

describe("crosstabValue", () => {
  it("reads the Total column by default", () => {
    expect(crosstabValue(E3, { group: "Total", response: "Pauline Hanson's One Nation" })).toBe(64.6);
  });

  it("reads a named category", () => {
    expect(crosstabValue(E3, { group: "State voting intention", value: "Coalition", response: "Pauline Hanson's One Nation" })).toBe(
      55.7,
    );
  });

  it("is null for a suppressed column, a null cell, or an unknown key", () => {
    expect(crosstabValue(E3, { group: "State voting intention", value: "Independent", response: "Labor" })).toBeNull();
    expect(crosstabValue(E3, { group: "State voting intention", value: "Independent", response: "Labor" })).toBeNull();
    expect(crosstabValue(E3, { group: "Nope", response: "Labor" })).toBeNull();
    expect(crosstabValue(E3, { group: "Total", response: "Nope" })).toBeNull();
  });
});

describe("driftFlag", () => {
  /**
   * These are the actual figures from the VIC Treaty poll's write-up against the actual
   * estimates. Four are honest rounding; two are not. If the tolerance ever moves, this
   * table says exactly what changes.
   */
  it.each([
    ["C5 support: prose 40, data 39.84", 40, 39.84, "match"],
    ["D6 first argument: prose 48, data 47.8", 48, 47.8, "match"],
    ["D6 second argument: prose 47, data 47.4", 47, 47.4, "match"],
    ["E2 out of touch: prose 58, data 58.3", 58, 58.3, "match"],
    ["E3 among Coalition voters: prose 56, data 55.7", 56, 55.7, "match"],
    ["E4 witnessed racism: prose 45, data 45.5", 45, 45.5, "match"],
    ["E5 less likely to vote: prose 74, data 74.3", 74, 74.3, "match"],
    ["C1 Treaty ranks last: prose 1, data 1.2", 1, 1.2, "match"],
    ["E3 One Nation policy: prose 63, data 64.6", 63, 64.6, "drift"],
    ["B1 Coalition primary: prose 27, data 25.8", 27, 25.8, "drift"],
  ])("%s", (_name, claimed, computed, expected) => {
    expect(driftFlag(claimed, computed).status).toBe(expected);
  });

  it("reports a signed delta, positive when the data is higher", () => {
    expect(driftFlag(63, 64.6)).toMatchObject({ claimed: 63, computed: 64.6, delta: 1.6 });
    expect(driftFlag(27, 25.8).delta).toBe(-1.2);
  });

  it("treats a figure it cannot compute as unverifiable, never as drift", () => {
    // The write-up cites the seat of Kew; the poll has no lower-house geography at all.
    expect(driftFlag(61, null)).toMatchObject({ status: "unverifiable", delta: null });
    expect(driftFlag(null, 61).status).toBe("unverifiable");
    expect(driftFlag(null, null).status).toBe("unverifiable");
  });

  it("puts the boundary exactly at the tolerance — one point is still rounding", () => {
    expect(driftFlag(40, 41).status).toBe("match"); // |Δ| == tolerance
    expect(driftFlag(40, 41.01).status).toBe("drift");
    expect(driftFlag(40, 39).status).toBe("match");
    expect(driftFlag(40, 38.99).status).toBe("drift");
  });

  it("accepts a custom tolerance", () => {
    expect(driftFlag(63, 64.6, 2).status).toBe("match");
    expect(driftFlag(40, 39.84, 0.1).status).toBe("drift");
  });
});

describe("describeDrift", () => {
  it("phrases the disagreement for the chip", () => {
    expect(describeDrift(driftFlag(63, 64.6))).toBe("data shows 64.6% (+1.6)");
    expect(describeDrift(driftFlag(27, 25.8))).toBe("data shows 25.8% (−1.2)");
  });

  it("says nothing when the figures agree, or cannot be compared", () => {
    expect(describeDrift(driftFlag(40, 39.84))).toBeNull();
    expect(describeDrift(driftFlag(61, null))).toBeNull();
  });
});

const row = (label: string, percent: number | null, isNet = false): ToplineRow => ({ label, percent, isNet });

describe("claimValue", () => {
  const B1: ToplineRow[] = [
    row("Coalition", 25.8),
    row("One Nation", 23.9),
    row("Labor", 22.9),
    row("Greens", 12.8),
  ];

  it("reads a claim that names its response", () => {
    expect(claimValue(B1, { response: "Coalition", percent: 27 })).toBe(25.8);
  });

  it("reads a claim addressed by rank, for responses too long to name", () => {
    // D6's arguments are 200-character statements; the prose claims "48% rank it top two".
    const D6: ToplineRow[] = [row("Everyone deserves to be treated fairly…", 47.79), row("We want a country that…", 47.44)];
    expect(claimValue(D6, { rank: 1, percent: 48 })).toBe(47.79);
    expect(claimValue(D6, { rank: 2, percent: 47 })).toBe(47.44);
  });

  it("ranks by size, not by source order", () => {
    const shuffled: ToplineRow[] = [row("small", 1), row("big", 90), row("mid", 50)];
    expect(claimValue(shuffled, { rank: 1, percent: 90 })).toBe(90);
  });

  it("ignores NET rows when ranking", () => {
    const withNet: ToplineRow[] = [row("NET Support", 99, true), row("Coalition", 25.8)];
    expect(claimValue(withNet, { rank: 1, percent: 27 })).toBe(25.8);
  });

  it("still finds a NET row when the claim names it", () => {
    const withNet: ToplineRow[] = [row("NET Support", 39.84, true), row("Strongly support", 21.51)];
    expect(claimValue(withNet, { response: "NET Support", percent: 40 })).toBe(39.84);
  });

  it("is null when the cell cannot be addressed", () => {
    expect(claimValue(B1, { response: "Nope", percent: 1 })).toBeNull();
    expect(claimValue(B1, { rank: 99, percent: 1 })).toBeNull();
    expect(claimValue(B1, { rank: 0, percent: 1 })).toBeNull();
    expect(claimValue(B1, { percent: 1 })).toBeNull();
    expect(claimValue([row("A", null)], { response: "A", percent: 1 })).toBeNull();
  });
});

describe("buildMatrix", () => {
  const questions = [
    { code: "C3_1", title: "Economy", topline: [row("L/NP", 31.6), row("ALP", 22.2), row("GRN", 7.2)] },
    { code: "C3_2", title: "Crime", topline: [row("L/NP", 35.0), row("ALP", 18.0), row("GRN", 5.0)] },
  ];

  it("lays a battery out as rows of questions over shared response columns", () => {
    expect(buildMatrix(questions, ["C3_1", "C3_2"])).toEqual([
      { name: "Economy", cells: [{ x: "L/NP", y: 31.6 }, { x: "ALP", y: 22.2 }, { x: "GRN", y: 7.2 }] },
      { name: "Crime", cells: [{ x: "L/NP", y: 35.0 }, { x: "ALP", y: 18.0 }, { x: "GRN", y: 5.0 }] },
    ]);
  });

  it("keeps the requested code order, not the payload's", () => {
    expect(buildMatrix(questions, ["C3_2", "C3_1"]).map((r) => r.name)).toEqual(["Crime", "Economy"]);
  });

  it("pads a missing response with a hole rather than shifting the row left", () => {
    const ragged = [questions[0], { code: "C3_2", title: "Crime", topline: [row("L/NP", 35.0), row("GRN", 5.0)] }];
    const rows = buildMatrix(ragged, ["C3_1", "C3_2"]);
    expect(rows[1].cells).toEqual([{ x: "L/NP", y: 35.0 }, { x: "ALP", y: null }, { x: "GRN", y: 5.0 }]);
  });

  it("excludes NET rows from the columns", () => {
    const withNet = [{ code: "C3_1", title: "Economy", topline: [row("L/NP", 31.6), row("NET Right", 99, true)] }];
    expect(buildMatrix(withNet, ["C3_1"])[0].cells).toEqual([{ x: "L/NP", y: 31.6 }]);
  });

  it("skips codes the payload does not carry, and is empty when none match", () => {
    expect(buildMatrix(questions, ["C3_1", "C3_99"]).map((r) => r.name)).toEqual(["Economy"]);
    expect(buildMatrix(questions, ["nope"])).toEqual([]);
    expect(buildMatrix([], ["C3_1"])).toEqual([]);
  });
});
