/**
 * The maths behind the queue firehose's cycle ribbon.
 *
 * A background job is not a progress bar. It is a repeating cycle — claim, fetch a page, map,
 * persist, checkpoint, re-enqueue — and when a cycle fails it does not stop, it waits. BullMQ backs
 * off exponentially, so the gaps between attempts GROW: 9.5 minutes, then 19, then 38, out to weeks.
 *
 * That is the fact a progress bar cannot express, and not expressing it is what let a sync sit
 * "queued" for months while the worker picked it up and died on every attempt. The ribbon exists to
 * make the widening gap visible, so "nothing is happening" and "the next attempt is in nine days"
 * stop looking the same.
 */

export type CycleOutcome = "advanced" | "failed" | "running" | "waiting";

export type Cycle = {
  /** 1-based attempt number, as BullMQ counts it. */
  attempt: number;
  at: string;
  outcome: CycleOutcome;
  /** What the cycle achieved — "page 3 of ~12", "1,204 contacts". Empty for a failure. */
  detail?: string;
  error?: string;
};

/** Plain-English elapsed time. Short units up close, coarse ones far out — nobody needs "13,140 min". */
export function humaniseGap(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 1_000) return "instant";
  if (abs < 60_000) return `${Math.round(abs / 1_000)}s`;
  if (abs < 3_600_000) {
    const mins = abs / 60_000;
    return `${mins < 10 ? mins.toFixed(1).replace(/\.0$/, "") : Math.round(mins)} min`;
  }
  if (abs < 86_400_000) {
    const hours = abs / 3_600_000;
    return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)}h`;
  }
  const days = abs / 86_400_000;
  return `${days < 10 ? days.toFixed(1).replace(/\.0$/, "") : Math.round(days)} days`;
}

/**
 * Horizontal position (0–1) for each cycle. Each SEGMENT's width is proportional to the log of the
 * wait it represents, so the widths are directly comparable: a longer bar means a longer wait.
 *
 * Linear spacing is useless here — against a nine-day tail the first four attempts collapse into a
 * single pixel. But spacing by the log of CUMULATIVE elapsed time is worse than it looks: log(0) is
 * the origin, so the jump to the first non-zero reading eats half the track and a 9.5-minute wait
 * draws wider than the 19-minute one that follows it. That is backwards, and the ribbon exists
 * precisely to show waits growing.
 *
 * Per-gap widths answer the real question — "are the waits getting longer?" — by making that
 * literally the shape. The scale is still non-linear and the UI says so; a chart that silently
 * rescales time is a chart that lies.
 */
export function ribbonOffsets(cycles: Cycle[]): number[] {
  if (cycles.length === 0) return [];
  if (cycles.length === 1) return [0];

  // log1p keeps a zero-length gap at zero width instead of -Infinity.
  const widths = gapsBetween(cycles).map((gap) => Math.log1p(Math.max(0, gap / 1_000)));
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (!Number.isFinite(total) || total <= 0) {
    // Every beat at the same instant — space them evenly rather than stacking them.
    return cycles.map((_, i) => i / (cycles.length - 1));
  }
  let running = 0;
  return widths.map((w) => {
    running += w;
    return running / total;
  });
}

export type Verdict = "healthy" | "working" | "stalled" | "failing" | "idle";

/**
 * One word for what this queue is doing, derived from the cycles alone.
 *
 * "failing" and "stalled" are kept apart on purpose. Failing means attempts are happening and
 * losing; stalled means nothing is attempting at all. They call for different actions — read the
 * error versus check the worker — and collapsing them into "stuck" is what produced a UI that told
 * someone to check a worker that was running perfectly well.
 */
export function verdictOf(cycles: Cycle[], now = Date.now()): Verdict {
  if (cycles.length === 0) return "idle";
  const last = cycles[cycles.length - 1];
  if (last.outcome === "running") return "working";

  const recentFailures = cycles.slice(-3).filter((c) => c.outcome === "failed").length;
  if (recentFailures >= 2) return "failing";

  if (last.outcome === "waiting") {
    // Waiting is normal between cycles; waiting a long time is not.
    return now - Date.parse(last.at) > 10 * 60_000 ? "stalled" : "working";
  }
  return cycles.some((c) => c.outcome === "failed") ? "working" : "healthy";
}

/** Gap from the previous cycle, for the ribbon's spacing labels. */
export function gapsBetween(cycles: Cycle[]): number[] {
  return cycles.map((cycle, i) =>
    i === 0 ? 0 : Date.parse(cycle.at) - Date.parse(cycles[i - 1].at),
  );
}

/**
 * Is the backoff still growing? Two consecutive widening gaps is enough to say so, and it is the
 * signal that a job is heading for a next attempt measured in days rather than minutes.
 */
export function isBackingOff(cycles: Cycle[]): boolean {
  const gaps = gapsBetween(cycles).slice(1);
  if (gaps.length < 2) return false;
  return gaps[gaps.length - 1] > gaps[gaps.length - 2];
}
