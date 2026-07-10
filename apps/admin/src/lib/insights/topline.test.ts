import { describe, expect, it } from "vitest";
import type { ToplineRow } from "@/lib/api/insights";
import { chartKind, diverging, formatDelta, netRow, shift, topResponses } from "./topline";

const row = (label: string, percent: number | null, isNet = false): ToplineRow => ({ label, percent, isNet });

/** C5 — "Do you support a Treaty?", whole sample. The real published figures. */
const C5: ToplineRow[] = [
  row("Strongly support", 21.51),
  row("Somewhat support", 18.33),
  row("Neither support nor oppose", 27.75),
  row("Somewhat oppose", 10.03),
  row("Strongly oppose", 22.38),
  row("NET Support", 39.84, true),
  row("NET Oppose", 32.41, true),
];

/** E1 — the same battery after respondents heard arguments both ways. */
const E1: ToplineRow[] = [
  row("Strongly support", 18.86),
  row("Somewhat support", 20.82),
  row("Neither support nor oppose", 25.33),
  row("Somewhat oppose", 12.32),
  row("Strongly oppose", 22.67),
  row("NET Support", 39.68, true),
  row("NET Oppose", 34.99, true),
];

/** C4 — awareness, a three-way nominal question. */
const C4: ToplineRow[] = [
  row("I was aware", 33.98),
  row("I had heard something but don't know much about it", 40.62),
  row("I was not aware", 25.4),
];

describe("diverging", () => {
  it("reads a five-point battery into ordered slots", () => {
    const d = diverging(C5)!;
    expect(d.segments.map((s) => s.slot)).toEqual([
      "support-strong",
      "support-soft",
      "neutral",
      "oppose-soft",
      "oppose-strong",
    ]);
    expect(d.segments.map((s) => s.side)).toEqual(["positive", "positive", "neutral", "negative", "negative"]);
  });

  it("sums each arm, reproducing the instrument's own NET rows", () => {
    const d = diverging(C5)!;
    expect(d.positive).toBeCloseTo(39.84, 2);
    expect(d.negative).toBeCloseTo(32.41, 2);
    expect(d.neutral).toBeCloseTo(27.75, 2);
    // The arms we compute must agree with what the pollster published.
    expect(d.positive).toBeCloseTo(netRow(C5, "Support")!, 2);
    expect(d.negative).toBeCloseTo(netRow(C5, "Oppose")!, 2);
  });

  it("carries the NET rows through", () => {
    expect(diverging(C5)!.nets).toEqual([
      { label: "NET Support", percent: 39.84 },
      { label: "NET Oppose", percent: 32.41 },
    ]);
  });

  it("reads an agree/disagree battery identically — the shape, not the wording", () => {
    const d = diverging([
      row("Strongly agree", 30),
      row("Somewhat agree", 20),
      row("Neither agree nor disagree", 10),
      row("Somewhat disagree", 15),
      row("Strongly disagree", 25),
      row("NET Agree", 50, true),
      row("NET Disagree", 40, true),
    ])!;
    expect(d.positive).toBe(50);
    expect(d.negative).toBe(40);
  });

  it("is null for a question that is not a five-point battery", () => {
    expect(diverging(C4)).toBeNull();
    expect(diverging([])).toBeNull();
  });

  it("is null when a cell was suppressed, rather than drawing a bar with a hole", () => {
    const holed = C5.map((r) => (r.label === "Somewhat oppose" ? row(r.label, null) : r));
    expect(diverging(holed)).toBeNull();
  });
});

describe("topResponses", () => {
  it("orders substantive responses largest first", () => {
    expect(topResponses(C4).map((r) => r.percent)).toEqual([40.62, 33.98, 25.4]);
  });

  it("excludes NET rows and suppressed cells", () => {
    const t = topResponses([row("A", 10), row("B", null), row("NET A", 90, true)]);
    expect(t).toEqual([{ label: "A", percent: 10 }]);
  });

  it("honours the limit", () => {
    expect(topResponses(C4, 2)).toHaveLength(2);
  });
});

describe("netRow", () => {
  it("finds a NET row by its trailing name", () => {
    expect(netRow(C5, "Support")).toBe(39.84);
    expect(netRow(C5, "oppose")).toBe(32.41);
  });

  it("is null when absent, and never matches a substantive row", () => {
    expect(netRow(C4, "Support")).toBeNull();
    expect(netRow([row("Strongly support", 21.51)], "support")).toBeNull();
  });
});

describe("chartKind", () => {
  it.each([
    [C5, "diverging"],
    [C4, "nominal"],
    [[] as ToplineRow[], "none"],
    [[row("A", null)], "none"],
  ])("classifies %#", (topline, expected) => {
    expect(chartKind(topline)).toBe(expected);
  });
});

describe("shift", () => {
  it("reports movement per arm, not as one net figure", () => {
    const s = shift(C5, E1)!;
    // The headline that a single "net shift" would hide: support is flat while
    // opposition hardens by two and a half points.
    expect(s.positiveDelta).toBe(-0.2);
    expect(s.negativeDelta).toBe(2.6);
    expect(s.neutralDelta).toBe(-2.4);
  });

  it("exposes both batteries for drawing", () => {
    const s = shift(C5, E1)!;
    expect(s.before.positive).toBeCloseTo(39.84, 2);
    expect(s.after.negative).toBeCloseTo(34.99, 2);
  });

  it("is null unless both sides are readable batteries", () => {
    expect(shift(C5, C4)).toBeNull();
    expect(shift(C4, E1)).toBeNull();
  });
});

describe("formatDelta", () => {
  it.each([
    [2.6, "+2.6"],
    [-0.2, "−0.2"], // a real minus sign, not a hyphen
    [0, "no change"],
  ])("formats %s as %s", (n, expected) => {
    expect(formatDelta(n)).toBe(expected);
  });
});
