import { describe, expect, it } from "vitest";
import type { ToplineRow } from "@/lib/api/insights";
import { canDotplot, selectChart } from "./select-chart";

const row = (label: string, percent: number | null, isNet = false): ToplineRow => ({ label, percent, isNet });

/** C5 — a five-point support/oppose battery. */
const LIKERT: ToplineRow[] = [
  row("Strongly support", 21.51),
  row("Somewhat support", 18.33),
  row("Neither support nor oppose", 27.75),
  row("Somewhat oppose", 10.03),
  row("Strongly oppose", 22.38),
  row("NET Support", 39.84, true),
  row("NET Oppose", 32.41, true),
];

/** E4 — a two-way split. */
const BINARY: ToplineRow[] = [row("Yes", 45.5), row("No", 54.5)];

/** C4 — a three-way split. */
const TERNARY: ToplineRow[] = [row("I was aware", 33.98), row("I had heard something", 40.62), row("I was not aware", 25.4)];

/** B1 — six parties. Too many for a donut. */
const SIX_WAY: ToplineRow[] = [
  row("Coalition", 25.8),
  row("One Nation", 23.9),
  row("Labor", 22.9),
  row("Greens", 12.8),
  row("Other", 9.5),
  row("Independent", 5.1),
];

describe("selectChart", () => {
  describe("on the whole sample", () => {
    it("gives a five-point battery a diverging bar", () => {
      expect(selectChart({ topline: LIKERT, group: "Total" }).type).toBe("diverging");
    });

    it("gives a two-way split a donut", () => {
      expect(selectChart({ topline: BINARY, group: "Total" }).type).toBe("donut");
    });

    it("gives a three-way split a donut — the last size the palette can colour", () => {
      expect(selectChart({ topline: TERNARY, group: "Total" }).type).toBe("donut");
    });

    it("gives four or more nominal responses ranked bars, not a donut", () => {
      const four = SIX_WAY.slice(0, 4);
      expect(selectChart({ topline: four, group: "Total" }).type).toBe("ranked-bar");
      expect(selectChart({ topline: SIX_WAY, group: "Total" }).type).toBe("ranked-bar");
    });

    it("counts only substantive responses when sizing a donut, not the NET rows", () => {
      // Three real responses + two NETs must still read as a donut, not a ranked bar.
      const withNets = [...TERNARY, row("NET Aware", 74.6, true)];
      expect(selectChart({ topline: withNets, group: "Total" }).type).toBe("donut");
    });
  });

  describe("across a crossbreak", () => {
    it("stacks a battery per category", () => {
      const c = selectChart({ topline: LIKERT, group: "Age" });
      expect(c.type).toBe("grouped-stacked");
      expect(c.reason).toContain("Age");
    });

    it("ranks nominal responses", () => {
      expect(selectChart({ topline: SIX_WAY, group: "Gender" }).type).toBe("ranked-bar");
    });
  });

  describe("precedence", () => {
    it("a question battery beats everything — heatmap wins", () => {
      const c = selectChart({ topline: LIKERT, group: "Total", matrix: true, geoKind: "sed_upper", headline: true });
      expect(c.type).toBe("heatmap");
    });

    it("a before/after pair outranks geography and the headline flag", () => {
      expect(selectChart({ topline: LIKERT, group: "Total", compare: true, geoKind: "sed_upper" }).type).toBe(
        "persuasion-shift",
      );
    });

    it("a geocoded breakdown goes to the map, even for a battery", () => {
      const c = selectChart({ topline: LIKERT, group: "VIC Upper House Electorate", geoKind: "sed_upper" });
      expect(c.type).toBe("choropleth");
      expect(c.reason).toContain("sed_upper");
    });

    it("the headline flag turns a distribution into a gauge", () => {
      expect(selectChart({ topline: BINARY, group: "Total", headline: true }).type).toBe("radial-gauge");
      expect(selectChart({ topline: LIKERT, group: "Total", headline: true }).type).toBe("radial-gauge");
    });

    it("draws nothing when nothing is reportable — even when a chart was requested", () => {
      expect(selectChart({ topline: [], group: "Total" }).type).toBe("none");
      expect(selectChart({ topline: [row("Yes", null)], group: "Total", headline: true }).type).toBe("none");
      // NET rows alone are not something to draw.
      expect(selectChart({ topline: [row("NET Support", 40, true)], group: "Total" }).type).toBe("none");
    });
  });

  it("honours an explicit donutMax", () => {
    expect(selectChart({ topline: SIX_WAY, group: "Total", donutMax: 6 }).type).toBe("donut");
    expect(selectChart({ topline: TERNARY, group: "Total", donutMax: 2 }).type).toBe("ranked-bar");
  });

  it("always explains itself", () => {
    for (const input of [
      { topline: LIKERT, group: "Total" },
      { topline: SIX_WAY, group: "Total" },
      { topline: [], group: "Total" },
    ]) {
      expect(selectChart(input).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("canDotplot", () => {
  it("offers a dot plot for a battery across a crossbreak", () => {
    expect(canDotplot(LIKERT, "Age")).toBe(true);
  });

  it("refuses on the whole sample — there is only one dot", () => {
    expect(canDotplot(LIKERT, "Total")).toBe(false);
  });

  it("refuses without a NET row to plot", () => {
    const noNet = LIKERT.filter((r) => !r.isNet);
    expect(canDotplot(noNet, "Age")).toBe(false);
  });

  it("refuses for a nominal question", () => {
    expect(canDotplot(SIX_WAY, "Age")).toBe(false);
  });
});
