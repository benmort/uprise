import type { ToplineRow } from "@/lib/api/insights";

/**
 * Reading a question's whole-sample column into a chart shape.
 *
 * The instrument's Likert batteries are regular: five substantive responses in ordinal
 * order from strongly-positive to strongly-negative, then two NET rows. Nothing here
 * matches on the wording ("support" vs "agree"), because the two batteries differ only
 * in vocabulary — the shape is what matters, and it is asserted rather than assumed.
 */

/** Slot names for the diverging ramp, in the token order defined in `@uprise/ui`. */
export const DIVERGING_SLOTS = [
  "support-strong",
  "support-soft",
  "neutral",
  "oppose-soft",
  "oppose-strong",
] as const;
export type DivergingSlot = (typeof DIVERGING_SLOTS)[number];

export type DivergingSegment = {
  slot: DivergingSlot;
  label: string;
  percent: number;
  /** Which arm the segment sits on — drives layout, not colour. */
  side: "positive" | "neutral" | "negative";
};

export type Diverging = {
  segments: DivergingSegment[];
  /** Sum of the two positive segments — the left arm's width. */
  positive: number;
  neutral: number;
  negative: number;
  /** The instrument's own NET rows, when it publishes them. */
  nets: { label: string; percent: number }[];
};

const SIDES: DivergingSegment["side"][] = ["positive", "positive", "neutral", "negative", "negative"];

/**
 * A five-point Likert battery, or null.
 *
 * Null whenever the shape is not exactly five substantive responses — a single-choice
 * question, or one whose cells were suppressed. Callers fall back to a nominal bar.
 * A suppressed cell inside an otherwise-valid battery makes the whole bar unreadable
 * (the arms would not sum), so it is rejected rather than drawn with a hole.
 */
export function diverging(topline: ToplineRow[]): Diverging | null {
  const substantive = topline.filter((r) => !r.isNet);
  if (substantive.length !== 5) return null;
  if (substantive.some((r) => r.percent == null)) return null;

  const segments = substantive.map((r, i) => ({
    slot: DIVERGING_SLOTS[i],
    label: r.label,
    percent: r.percent as number,
    side: SIDES[i],
  }));
  const sum = (side: DivergingSegment["side"]) =>
    segments.filter((s) => s.side === side).reduce((a, s) => a + s.percent, 0);

  return {
    segments,
    positive: sum("positive"),
    neutral: sum("neutral"),
    negative: sum("negative"),
    nets: topline
      .filter((r) => r.isNet && r.percent != null)
      .map((r) => ({ label: r.label, percent: r.percent as number })),
  };
}

/**
 * The substantive responses, largest first — the reading order for a nominal question.
 * Suppressed cells drop out; ties keep their source order, so a stable chart.
 */
export function topResponses(topline: ToplineRow[], limit = 4): Array<{ label: string; percent: number }> {
  return topline
    .filter((r) => !r.isNet && r.percent != null)
    .map((r) => ({ label: r.label, percent: r.percent as number }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

/** A NET row by prefix — `netRow(t, "Support")` finds `"NET Support"`. */
export function netRow(topline: ToplineRow[], name: string): number | null {
  const hit = topline.find((r) => r.isNet && r.label.toLowerCase().endsWith(name.toLowerCase()));
  return hit?.percent ?? null;
}

export type ChartKind = "diverging" | "nominal" | "none";

/** Which chart a question's topline can support. */
export function chartKind(topline: ToplineRow[]): ChartKind {
  if (diverging(topline)) return "diverging";
  if (topResponses(topline, 1).length > 0) return "nominal";
  return "none";
}

/**
 * Movement between the same battery asked twice.
 *
 * Reported per arm rather than as one number: a Treaty can hold its support while its
 * opposition hardens, and a single "net shift" figure hides exactly that. Returns null
 * unless both questions are readable five-point batteries.
 */
export type Shift = {
  before: Diverging;
  after: Diverging;
  positiveDelta: number;
  negativeDelta: number;
  neutralDelta: number;
};

export function shift(before: ToplineRow[], after: ToplineRow[]): Shift | null {
  const b = diverging(before);
  const a = diverging(after);
  if (!b || !a) return null;
  return {
    before: b,
    after: a,
    positiveDelta: round1(a.positive - b.positive),
    negativeDelta: round1(a.negative - b.negative),
    neutralDelta: round1(a.neutral - b.neutral),
  };
}

/** Percentages arrive with two decimals; deltas of hundredths are noise, not movement. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "+2.6" / "-0.2" / "no change" — a delta as a reader sees it. */
export function formatDelta(n: number): string {
  if (n === 0) return "no change";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
}
