import { describe, expect, it } from "vitest";
import {
  donutOptions,
  groupedStackedOptions,
  heatmapOptions,
  netDotplotOptions,
  radialGaugeOptions,
  rankedBarOptions,
  type ChartCtx,
} from "./apex-options";
import { buildPollPalette, type PollPalette } from "./palette";
import { diverging } from "./topline";
import type { ToplineRow } from "@/lib/api/insights";

/** A palette of unmistakable sentinels — any hardcoded hex stands out immediately. */
const P: PollPalette = {
  diverging: ["#111111", "#222222", "#333333", "#444444", "#555555"],
  seq: ["#aa0001", "#aa0002", "#aa0003", "#aa0004", "#aa0005"],
  accent: "#acce01",
  nodata: "#d0d0d0",
  ink: "#010101",
  muted: "#606060",
  grid: "#909090",
  surface: "#fefefe",
};
const LIGHT: ChartCtx = { theme: "light" };
const DARK: ChartCtx = { theme: "dark" };

const ROWS = [
  { label: "Crime and community safety", percent: 23.91 },
  { label: "Managing the economy", percent: 20.2 },
  { label: "Housing affordability", percent: 14.04 },
];

const row = (label: string, percent: number | null, isNet = false): ToplineRow => ({ label, percent, isNet });
const LIKERT: ToplineRow[] = [
  row("Strongly support", 21.51),
  row("Somewhat support", 18.33),
  row("Neither", 27.75),
  row("Somewhat oppose", 10.03),
  row("Strongly oppose", 22.38),
  row("NET Support", 39.84, true),
  row("NET Oppose", 32.41, true),
];

/** Every hex literal anywhere in a built bundle. */
function hexesIn(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (/^#[0-9a-f]{3,8}$/i.test(v)) found.push(v.toLowerCase());
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return found;
}

const PALETTE_HEXES = new Set(
  [...P.diverging, ...P.seq, P.accent, P.nodata, P.ink, P.muted, P.grid, P.surface].map((h) => h.toLowerCase()),
);

const ALL_BUILDERS: Array<[string, () => { options: unknown; series: unknown }]> = [
  ["rankedBar", () => rankedBarOptions(ROWS, P, LIGHT)],
  ["donut", () => donutOptions(ROWS, P, LIGHT)],
  ["radialGauge", () => radialGaugeOptions(58.32, "Out of touch", P, LIGHT)],
  ["heatmap", () => heatmapOptions([{ name: "Economy", cells: [{ x: "L/NP", y: 31.6 }, { x: "ALP", y: 22.2 }] }], P, LIGHT)],
  [
    "groupedStacked",
    () =>
      groupedStackedOptions(
        [{ category: "18-24", diverging: diverging(LIKERT)! }],
        ["Strongly support", "Somewhat support", "Neither", "Somewhat oppose", "Strongly oppose"],
        P,
        LIGHT,
      ),
  ],
  ["netDotplot", () => netDotplotOptions([{ category: "18-24", net: 51.2 }], "NET Support", P, LIGHT)],
];

describe("every builder is fed entirely from the palette", () => {
  /**
   * The whole point of the token bridge. The dashboard these widgets were borrowed from
   * writes `colors: ["#465FFF"]` and `#6B7280` axis labels straight into its options, so
   * its charts never change with the theme. This test fails the moment we do the same.
   */
  it.each(ALL_BUILDERS)("%s uses no colour outside the palette", (_name, build) => {
    const stray = hexesIn(build()).filter((h) => !PALETTE_HEXES.has(h));
    expect(stray).toEqual([]);
  });

  it.each(ALL_BUILDERS)("%s tells Apex which theme it is in", (_name, build) => {
    expect((build().options as { theme?: { mode?: string } }).theme?.mode).toBe("light");
  });

  it("switches Apex's own theme mode with ours", () => {
    expect(rankedBarOptions(ROWS, P, DARK).options.theme?.mode).toBe("dark");
    expect(rankedBarOptions(ROWS, P, DARK).options.tooltip?.theme).toBe("dark");
  });
});

describe("rankedBarOptions", () => {
  it("paints every bar the same hue — rank is length, not colour", () => {
    const { options } = rankedBarOptions(ROWS, P, LIGHT);
    expect(options.colors).toEqual([P.diverging[0]]);
  });

  it("always draws its direct labels, since one hue cannot carry identity", () => {
    expect(rankedBarOptions(ROWS, P, LIGHT).options.dataLabels?.enabled).toBe(true);
  });

  it("puts the label outside the bar, in ink — never on the fill", () => {
    // Ink on the bar's own fill is illegible in both themes: near-black on the light
    // theme's deep blue, near-white on the dark theme's pale blue.
    const { options } = rankedBarOptions(ROWS, P, LIGHT);
    expect(options.plotOptions?.bar?.dataLabels?.position).toBe("top");
    expect(options.dataLabels?.textAnchor).toBe("start");
    expect(options.dataLabels?.offsetX).toBeGreaterThan(0);
    expect(options.dataLabels?.style?.colors).toEqual([P.ink]);
    // …and the plot leaves room for the longest bar's label.
    expect(options.grid?.padding?.right).toBeGreaterThanOrEqual(32);
  });

  it("keeps the caller's order and carries the categories", () => {
    const { options, series } = rankedBarOptions(ROWS, P, LIGHT);
    expect(options.xaxis?.categories).toEqual(ROWS.map((r) => r.label));
    expect(series).toEqual([{ name: "Share", data: [23.91, 20.2, 14.04] }]);
  });

  it("is horizontal with rounded data-ends", () => {
    const bar = rankedBarOptions(ROWS, P, LIGHT).options.plotOptions?.bar;
    expect(bar?.horizontal).toBe(true);
    expect(bar?.borderRadius).toBe(4);
    expect(bar?.borderRadiusApplication).toBe("end");
  });
});

describe("donutOptions", () => {
  it("takes a three-way split from the two poles and the neutral midpoint", () => {
    expect(donutOptions(ROWS, P, LIGHT).options.colors).toEqual([P.diverging[0], P.diverging[2], P.diverging[4]]);
  });

  it("gives a two-way split the two poles, never the recessive neutral", () => {
    // "No" at 54.5% is the majority; painting it the neutral grey would say "nothing".
    expect(donutOptions(ROWS.slice(0, 2), P, LIGHT).options.colors).toEqual([P.diverging[0], P.diverging[4]]);
  });

  it("colours only as many slices as there are rows", () => {
    expect(donutOptions(ROWS.slice(0, 1), P, LIGHT).options.colors).toEqual([P.diverging[0]]);
  });

  it("separates the fills with a surface-coloured stroke", () => {
    const { options } = donutOptions(ROWS, P, LIGHT);
    expect(options.stroke?.width).toBe(2);
    expect(options.stroke?.colors).toEqual([P.surface]);
  });

  it("emits a flat numeric series and matching labels", () => {
    const { options, series } = donutOptions(ROWS, P, LIGHT);
    expect(series).toEqual([23.91, 20.2, 14.04]);
    expect(options.labels).toEqual(ROWS.map((r) => r.label));
  });
});

describe("radialGaugeOptions", () => {
  it("is a half gauge on the support pole, tracked in the no-data grey", () => {
    const { options, series } = radialGaugeOptions(58.32, "Out of touch", P, LIGHT);
    const radial = options.plotOptions?.radialBar;
    expect([radial?.startAngle, radial?.endAngle]).toEqual([-90, 90]);
    expect(radial?.track?.background).toBe(P.nodata);
    expect(options.colors).toEqual([P.diverging[0]]);
    expect(series).toEqual([58.32]);
    expect(options.labels).toEqual(["Out of touch"]);
  });
});

describe("heatmapOptions", () => {
  it("encodes magnitude on the sequential ramp, never the diverging one", () => {
    const { options } = heatmapOptions(
      [{ name: "Economy", cells: [{ x: "L/NP", y: 31.6 }, { x: "ALP", y: 22.2 }] }],
      P,
      LIGHT,
    );
    const ranges = options.plotOptions?.heatmap?.colorScale?.ranges ?? [];
    expect(ranges.map((r) => r.color)).toEqual(P.seq);
    // No diverging hue leaks into a magnitude scale.
    for (const d of P.diverging) expect(ranges.map((r) => r.color)).not.toContain(d);
  });

  it("spans the ramp across the observed maximum", () => {
    const { options } = heatmapOptions([{ name: "r", cells: [{ x: "a", y: 50 }] }], P, LIGHT);
    const ranges = options.plotOptions?.heatmap?.colorScale?.ranges ?? [];
    expect(ranges[0].from).toBeLessThan(0); // zero must land in the first bucket
    expect(ranges[ranges.length - 1].to).toBe(50);
  });

  it("survives a matrix with no reportable cell", () => {
    const { options } = heatmapOptions([{ name: "r", cells: [{ x: "a", y: null }] }], P, LIGHT);
    const ranges = options.plotOptions?.heatmap?.colorScale?.ranges ?? [];
    expect(ranges[ranges.length - 1].to).toBe(100); // falls back to a full-scale ramp
  });

  it("passes null cells through so Apex leaves them unpainted", () => {
    const { series } = heatmapOptions([{ name: "r", cells: [{ x: "a", y: null }] }], P, LIGHT);
    expect(series).toEqual([{ name: "r", data: [{ x: "a", y: null }] }]);
  });

  it("reverses the rows, because Apex draws the first series at the bottom", () => {
    const { series } = heatmapOptions(
      [
        { name: "first", cells: [{ x: "a", y: 1 }] },
        { name: "second", cells: [{ x: "a", y: 2 }] },
        { name: "third", cells: [{ x: "a", y: 3 }] },
      ],
      P,
      LIGHT,
    );
    // Reversed here means "first" ends up on top once Apex has drawn it.
    expect((series as Array<{ name: string }>).map((s) => s.name)).toEqual(["third", "second", "first"]);
  });
});

describe("groupedStackedOptions", () => {
  const labels = ["Strongly support", "Somewhat support", "Neither", "Somewhat oppose", "Strongly oppose"];

  it("stacks to 100% on the diverging ramp, in slot order", () => {
    const { options } = groupedStackedOptions([{ category: "18-24", diverging: diverging(LIKERT)! }], labels, P, LIGHT);
    expect(options.colors).toEqual(P.diverging);
    expect(options.chart?.stacked).toBe(true);
    expect(options.chart?.stackType).toBe("100%");
  });

  it("emits one series per Likert step, one point per category", () => {
    const { series } = groupedStackedOptions(
      [
        { category: "18-24", diverging: diverging(LIKERT)! },
        { category: "25-34", diverging: diverging(LIKERT)! },
      ],
      labels,
      P,
      LIGHT,
    );
    expect(series).toHaveLength(5);
    expect((series as Array<{ name: string; data: number[] }>)[0]).toEqual({
      name: "Strongly support",
      data: [21.51, 21.51],
    });
  });

  it("keeps the 2px surface gap between adjacent fills", () => {
    const { options } = groupedStackedOptions([{ category: "a", diverging: diverging(LIKERT)! }], labels, P, LIGHT);
    expect(options.stroke).toMatchObject({ width: 2, colors: [P.surface] });
  });
});

describe("netDotplotOptions", () => {
  it("plots each category as a dot on a fixed 0–100 axis", () => {
    const { options, series } = netDotplotOptions(
      [{ category: "18-24", net: 51.2 }, { category: "65+", net: 28.4 }],
      "NET Support",
      P,
      LIGHT,
    );
    expect([options.xaxis?.min, options.xaxis?.max]).toEqual([0, 100]);
    expect(series).toEqual([
      { name: "NET Support", data: [{ x: 51.2, y: "18-24" }, { x: 28.4, y: "65+" }] },
    ]);
  });

  it("rings the markers in the surface colour so overlaps stay legible", () => {
    const { options } = netDotplotOptions([{ category: "a", net: 1 }], "n", P, LIGHT);
    expect(options.markers?.strokeColors).toBe(P.surface);
    expect(options.markers?.strokeWidth).toBe(2);
  });
});

describe("the real tokens flow through unchanged", () => {
  it("a palette built from globals.css reaches Apex as the validated hexes", () => {
    const real = buildPollPalette((n) =>
      ({
        "--poll-support-strong": "237.6 69% 50.6%",
        "--poll-oppose-strong": "8.4 74.8% 45.1%",
        "--seq-1": "212.6 76.6% 73.1%",
        "--seq-5": "213.5 77.9% 28.4%",
      })[n] ?? "",
    );
    expect(rankedBarOptions(ROWS, real, LIGHT).options.colors).toEqual(["#2a31d8"]);
    const ranges = heatmapOptions([{ name: "r", cells: [{ x: "a", y: 1 }] }], real, LIGHT).options.plotOptions?.heatmap
      ?.colorScale?.ranges;
    expect(ranges?.[0].color).toBe("#86b6ef");
    expect(ranges?.[4].color).toBe("#104281");
  });
});
