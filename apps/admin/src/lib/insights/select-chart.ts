import type { ToplineRow } from "@/lib/api/insights";
import { diverging, topResponses } from "./topline";

/**
 * Which chart a slice of poll data deserves.
 *
 * The rule is that the shape of the data picks the chart, never the author's taste. A
 * five-point battery has polarity, so it gets a diverging bar; a party-competence matrix
 * has magnitude on two axes, so it gets a heatmap; six parties' primary votes have
 * neither order nor polarity, so they get ranked bars where length carries the number and
 * the label carries the identity.
 *
 * Kept pure and separate from the components so the mapping is unit-tested rather than
 * discovered by clicking through 33 questions.
 */
export type ChartType =
  /** Five-point Likert on the whole sample – the existing CSS `DivergingBar`. */
  | "diverging"
  /** The same battery asked twice – the existing `PersuasionShift`. */
  | "persuasion-shift"
  /** A Likert battery across a crossbreak's categories – 100% stacked bars. */
  | "grouped-stacked"
  /** One NET across a crossbreak's categories – a dot plot on a common axis. */
  | "net-dotplot"
  /** Two or three mutually exclusive parts of a whole. */
  | "donut"
  /** Four or more nominal responses, ordered by size. */
  | "ranked-bar"
  /** A single headline percentage. */
  | "radial-gauge"
  /** A battery of questions against shared responses. */
  | "heatmap"
  /** A response across geographies – the existing Mapbox `PollChoroplethMap`. */
  | "choropleth"
  /** Nothing reportable to draw. */
  | "none";

export type SelectChartInput = {
  /** The column being charted: the whole sample, or one crossbreak category. */
  topline: ToplineRow[];
  /** `"Total"`, or the name of the active breakdown group. */
  group: string;
  /** Set when the active group's columns carry a geo code (`sed_upper`). */
  geoKind?: string | null;
  /** The caller has a battery of questions sharing one response set (`C3_1`…`C3_12`). */
  matrix?: boolean;
  /** The caller wants one number emphasised rather than a distribution. */
  headline?: boolean;
  /** The caller has a before/after pair of the same battery. */
  compare?: boolean;
  /** Above this many nominal responses, a donut becomes unreadable. */
  donutMax?: number;
};

export type ChartChoice = { type: ChartType; reason: string };

/**
 * The most slices a donut may have.
 *
 * Three, because each slice needs a hue the eye can separate from its neighbours, and the
 * validated palette offers exactly three that qualify: the two poles and the neutral
 * midpoint. A fourth would have to be invented, and the obvious candidates — party
 * colours — put a red slice next to a diverging ramp where red already means "oppose".
 */
const DONUT_MAX = 3;

export function selectChart(input: SelectChartInput): ChartChoice {
  const { topline, group, geoKind, matrix, headline, compare, donutMax = DONUT_MAX } = input;

  if (matrix) return { type: "heatmap", reason: "a battery of questions over shared responses" };
  if (compare) return { type: "persuasion-shift", reason: "the same battery asked before and after" };
  if (geoKind) return { type: "choropleth", reason: `responses carry a ${geoKind} geography` };

  const reportable = topline.filter((r) => !r.isNet && r.percent !== null);
  if (reportable.length === 0) return { type: "none", reason: "no reportable responses" };

  if (headline) return { type: "radial-gauge", reason: "a single headline percentage" };

  const battery = diverging(topline);

  if (group === "Total") {
    if (battery) return { type: "diverging", reason: "a five-point battery on the whole sample" };
    const n = topResponses(topline, Number.MAX_SAFE_INTEGER).length;
    return n <= donutMax
      ? { type: "donut", reason: `${n} mutually exclusive parts of a whole` }
      : { type: "ranked-bar", reason: `${n} nominal responses – too many for a donut` };
  }

  if (battery) {
    return { type: "grouped-stacked", reason: `a five-point battery across ${group}` };
  }
  return { type: "ranked-bar", reason: `nominal responses across ${group}` };
}

/**
 * Whether a crossbreak of a Likert battery is better read as a dot plot of its NET.
 *
 * A stacked bar per category shows the full distribution but makes the *gap* between
 * categories hard to measure; once there are enough categories, one dot per category on a
 * shared axis answers "who is furthest apart" at a glance. Offered as a toggle rather than
 * imposed, because the distribution is the honest default.
 */
export function canDotplot(topline: ToplineRow[], group: string): boolean {
  return group !== "Total" && diverging(topline) !== null && topline.some((r) => r.isNet);
}
