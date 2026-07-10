import type { ApexOptions } from "apexcharts";
import { readableOn, type PollPalette } from "./palette";
import type { Diverging } from "./topline";

/**
 * ApexCharts option builders, as pure functions of (data, palette).
 *
 * `ApexOptions` is imported as a type, so nothing here pulls the library in at runtime —
 * these run under vitest in node, and the components that render them import
 * `react-apexcharts` lazily.
 *
 * The reference dashboard these widgets come from writes `colors: ["#465FFF"]` and
 * `labels: { style: { colors: "#6B7280" } }` straight into every option object. That is
 * why its charts look identical in dark mode: the axis text stays mid-grey and the series
 * stays the same blue against a near-black surface. Every colour below comes from
 * `PollPalette` instead, which is read from the CSS custom properties on each theme flip.
 */

export type ApexBundle = { options: ApexOptions; series: ApexOptions["series"] };

/** Everything a builder needs about the surface it is drawn on. */
export type ChartCtx = { theme: "light" | "dark" };

const FONT = "var(--font-outfit), sans-serif";

/** Axis, grid, tooltip and legend chrome — identical for every chart, themed from tokens. */
function chrome(p: PollPalette, ctx: ChartCtx): ApexOptions {
  return {
    chart: {
      fontFamily: FONT,
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
      animations: { enabled: true, speed: 260 },
    },
    theme: { mode: ctx.theme },
    grid: {
      borderColor: p.grid,
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 4 },
    },
    tooltip: { theme: ctx.theme },
    legend: {
      fontFamily: FONT,
      labels: { colors: p.muted },
      markers: { size: 6 },
      itemMargin: { horizontal: 8, vertical: 2 },
    },
    dataLabels: { enabled: false },
    states: { active: { filter: { type: "none" } } },
  };
}

const axisLabel = (p: PollPalette) => ({
  style: { colors: p.muted, fontSize: "11px", fontFamily: FONT },
});

const pctFormatter = (v: number) => `${v.toFixed(1)}%`;

/**
 * A nominal question's responses, largest first.
 *
 * One hue for every bar. These categories have no order and no polarity, so tinting them
 * by rank would encode a magnitude the bar's length already carries — and inventing a
 * hue per party would collide with the diverging ramp, where red means "oppose".
 * Identity rides on the direct label instead, which is always on.
 */
export function rankedBarOptions(
  rows: Array<{ label: string; percent: number }>,
  p: PollPalette,
  ctx: ChartCtx,
): ApexBundle {
  return {
    options: {
      ...chrome(p, ctx),
      colors: [p.diverging[0]],
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          borderRadiusApplication: "end",
          barHeight: "62%",
          // Put the value past the end of the bar, not inside it. Ink on the bar's own
          // fill is illegible either way round — near-black on the light theme's deep
          // blue, near-white on the dark theme's pale blue — and a label that starts
          // inside a long bar and finishes outside a short one reads as two conventions.
          dataLabels: { position: "top" },
        },
      },
      dataLabels: {
        enabled: true,
        textAnchor: "start",
        formatter: (v) => pctFormatter(Number(v)),
        offsetX: 8,
        style: { fontSize: "11px", fontWeight: 600, fontFamily: FONT, colors: [p.ink] },
      },
      xaxis: {
        categories: rows.map((r) => r.label),
        labels: { ...axisLabel(p), formatter: (v) => `${Math.round(Number(v))}%` },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { ...axisLabel(p), maxWidth: 260 } },
      grid: {
        ...chrome(p, ctx).grid,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: false } },
        // Room for the longest bar's label, which now sits outside the plot's data area.
        padding: { left: 4, right: 40 },
      },
      tooltip: { theme: ctx.theme, y: { formatter: pctFormatter } },
    },
    series: [{ name: "Share", data: rows.map((r) => Number(r.percent.toFixed(2))) }],
  };
}

/**
 * A two- or three-way split of a whole.
 *
 * Capped at three slices on purpose: beyond that the slices need as many distinguishable
 * hues, and we have exactly three validated ones — the two poles and the neutral. Four or
 * more categories go to {@link rankedBarOptions}, which compares lengths rather than
 * angles and needs only one hue.
 */
export function donutOptions(
  rows: Array<{ label: string; percent: number }>,
  p: PollPalette,
  ctx: ChartCtx,
): ApexBundle {
  // Two slices take the two poles. Only a three-way split earns the neutral, and then
  // only in the middle — giving "No" the recessive grey in a Yes/No donut would paint the
  // majority as the colour reserved for "nothing".
  const scheme =
    rows.length <= 2
      ? [p.diverging[0], p.diverging[4]]
      : [p.diverging[0], p.diverging[2], p.diverging[4]];
  const colours = scheme.slice(0, rows.length);

  return {
    options: {
      ...chrome(p, ctx),
      colors: colours,
      labels: rows.map((r) => r.label),
      stroke: { width: 2, colors: [p.surface] }, // the 2px surface gap between fills
      plotOptions: {
        pie: {
          donut: {
            size: "68%",
            labels: {
              show: true,
              name: { fontFamily: FONT, color: p.muted, fontSize: "12px" },
              value: {
                fontFamily: FONT,
                color: p.ink,
                fontSize: "22px",
                fontWeight: 700,
                formatter: (v) => `${Number(v).toFixed(1)}%`,
              },
              total: { show: false },
            },
          },
        },
      },
      dataLabels: { enabled: false }, // the legend carries label + value
      legend: { ...chrome(p, ctx).legend, position: "bottom", horizontalAlign: "center" },
      tooltip: { theme: ctx.theme, y: { formatter: pctFormatter } },
    },
    series: rows.map((r) => Number(r.percent.toFixed(2))),
  };
}

/**
 * One headline percentage as a half-gauge — the shape borrowed from the reference
 * dashboard's monthly-target widget, with its hardcoded `#465FFF` and `#E4E7EC` swapped
 * for the support pole and the no-data grey.
 */
export function radialGaugeOptions(value: number, label: string, p: PollPalette, ctx: ChartCtx): ApexBundle {
  return {
    options: {
      ...chrome(p, ctx),
      colors: [p.diverging[0]],
      chart: { ...chrome(p, ctx).chart, sparkline: { enabled: true } },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          hollow: { size: "62%" },
          track: { background: p.nodata, strokeWidth: "100%", margin: 4 },
          dataLabels: {
            name: { offsetY: 22, color: p.muted, fontSize: "12px", fontFamily: FONT },
            value: {
              offsetY: -18,
              color: p.ink,
              fontSize: "30px",
              fontWeight: 700,
              fontFamily: FONT,
              formatter: (v) => `${Number(v).toFixed(1)}%`,
            },
          },
        },
      },
      stroke: { lineCap: "round" },
      labels: [label],
    },
    series: [Number(value.toFixed(2))],
  };
}

export type HeatRow = { name: string; cells: Array<{ x: string; y: number | null }> };

/**
 * A battery of questions against a shared set of responses — twelve issues by six parties.
 *
 * Colour encodes magnitude, so this takes the sequential ramp, not the diverging one:
 * "the Coalition leads on crime" is a bigger number, not a more positive one. Suppressed
 * cells arrive as null and Apex leaves them unpainted rather than drawing them as zero.
 */
export function heatmapOptions(rows: HeatRow[], p: PollPalette, ctx: ChartCtx): ApexBundle {
  const values = rows.flatMap((r) => r.cells.map((c) => c.y).filter((v): v is number => v !== null));
  const max = values.length > 0 ? Math.max(...values) : 100;
  const step = max / p.seq.length;

  return {
    options: {
      ...chrome(p, ctx),
      plotOptions: {
        heatmap: {
          radius: 3,
          enableShades: false,
          colorScale: {
            ranges: p.seq.map((colour, i) => ({
              from: i === 0 ? -0.01 : i * step,
              to: (i + 1) * step,
              color: colour,
              // Measured against the cell's own fill, not chosen by its position in the
              // ramp: the ramp runs light→dark in one theme and dark→light in the other,
              // so a rule keyed on the index is legible in exactly one of them.
              foreColor: readableOn(colour, p.ink, p.surface),
            })),
          },
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (v) => (Number(v) > 0 ? `${Math.round(Number(v))}` : ""),
        style: { fontSize: "10px", fontWeight: 600, fontFamily: FONT },
      },
      stroke: { width: 2, colors: [p.surface] }, // the surface gap between adjacent cells
      xaxis: { labels: axisLabel(p), axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { ...axisLabel(p), maxWidth: 240 } },
      grid: { ...chrome(p, ctx).grid, yaxis: { lines: { show: false } } },
      legend: { show: false },
      tooltip: { theme: ctx.theme, y: { formatter: pctFormatter } },
    },
    // Apex stacks the first series at the *bottom* of a heatmap. Reverse so the caller's
    // first row reads at the top, which is where a reader starts.
    series: [...rows].reverse().map((r) => ({ name: r.name, data: r.cells })),
  };
}

export type StackedCategory = { category: string; diverging: Diverging };

/**
 * The same five-point battery across the categories of a crossbreak — one 100% stacked
 * bar per category, sharing the validated diverging ramp and its 2px surface gaps.
 */
export function groupedStackedOptions(
  cats: StackedCategory[],
  labels: string[],
  p: PollPalette,
  ctx: ChartCtx,
): ApexBundle {
  const series = labels.map((label, slot) => ({
    name: label,
    data: cats.map((c) => Number((c.diverging.segments[slot]?.percent ?? 0).toFixed(2))),
  }));

  return {
    options: {
      ...chrome(p, ctx),
      colors: [...p.diverging],
      chart: { ...chrome(p, ctx).chart, stacked: true, stackType: "100%" },
      plotOptions: { bar: { horizontal: true, barHeight: "64%", borderRadius: 4, borderRadiusApplication: "end" } },
      stroke: { width: 2, colors: [p.surface] },
      xaxis: {
        categories: cats.map((c) => c.category),
        labels: { ...axisLabel(p), formatter: (v) => `${Math.round(Number(v))}%` },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { ...axisLabel(p), maxWidth: 200 } },
      legend: { ...chrome(p, ctx).legend, position: "bottom", horizontalAlign: "left" },
      tooltip: { theme: ctx.theme, y: { formatter: pctFormatter } },
    },
    series,
  };
}

/**
 * The NET across a crossbreak's categories, as a dot plot.
 *
 * Preferred over a bar when the question is "how far apart are these groups" — a dot on a
 * common axis reads the gap directly, and unlike a bar it need not start at zero.
 */
export function netDotplotOptions(
  points: Array<{ category: string; net: number }>,
  seriesName: string,
  p: PollPalette,
  ctx: ChartCtx,
): ApexBundle {
  return {
    options: {
      ...chrome(p, ctx),
      colors: [p.diverging[0]],
      chart: { ...chrome(p, ctx).chart, type: "scatter" },
      markers: { size: 7, strokeWidth: 2, strokeColors: p.surface, hover: { size: 9 } },
      xaxis: {
        type: "numeric",
        min: 0,
        max: 100,
        tickAmount: 5,
        labels: { ...axisLabel(p), formatter: (v) => `${Math.round(Number(v))}%` },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: { ...axisLabel(p), maxWidth: 200 },
      },
      grid: { ...chrome(p, ctx).grid, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
      tooltip: { theme: ctx.theme, x: { formatter: pctFormatter } },
    },
    series: [
      {
        name: seriesName,
        data: points.map((pt) => ({ x: Number(pt.net.toFixed(2)), y: pt.category })),
      },
    ],
  };
}
