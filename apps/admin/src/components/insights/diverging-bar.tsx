import { cn } from "@/lib/utils";
import type { Diverging, DivergingSlot } from "@/lib/insights/topline";

/**
 * Charts for a poll question's whole-sample column. Hand-rolled SVG-free CSS — the
 * monorepo carries no charting library, and a stacked bar does not warrant one.
 *
 * Colour comes from the validated `--poll-*` diverging ramp in `@uprise/ui`. Two things
 * about it are load-bearing and must not be "tidied":
 *
 *  - **The 2px gaps between fills are the secondary encoding.** Within an arm the two
 *    steps differ only in lightness (ΔE ~14 under deuteranopia); the gap is what keeps
 *    them separable. Do not collapse the bar into one continuous run.
 *  - **No label sits inside a fill.** The neutral step is deliberately low-contrast
 *    (1.27:1) so "neither" recedes, which means text on it would be unreadable. Values
 *    are printed beside a swatch below the bar instead — so identity is never carried
 *    by colour alone, and the legend and the direct labels are the same object.
 */

/** Slot → fill utility. Written out so Tailwind's scanner sees each literal class. */
const SLOT_BG: Record<DivergingSlot, string> = {
  "support-strong": "bg-poll-support-strong",
  "support-soft": "bg-poll-support-soft",
  neutral: "bg-poll-neutral",
  "oppose-soft": "bg-poll-oppose-soft",
  "oppose-strong": "bg-poll-oppose-strong",
};

const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * The stacked bar itself.
 *
 * Segments are laid out with `flex-grow` proportional to their percentage and
 * `flex-basis: 0`, so the 2px gaps are taken out of the free space rather than pushing
 * the total past 100%. Zero-width segments are dropped, or they would contribute a gap
 * with nothing either side of it.
 */
export function DivergingBar({ data, size = "sm" }: { data: Diverging; size?: "sm" | "lg" }) {
  const drawn = data.segments.filter((s) => s.percent > 0);
  const summary = drawn.map((s) => `${s.label} ${pct(s.percent)}`).join(", ");

  return (
    <div
      role="img"
      aria-label={summary}
      className={cn("flex w-full gap-[2px] overflow-hidden", size === "lg" ? "h-6" : "h-3")}
    >
      {drawn.map((s, i) => (
        <div
          key={s.slot}
          tabIndex={0}
          title={`${s.label} — ${pct(s.percent)}`}
          style={{ flex: `${s.percent} 1 0` }}
          className={cn(
            "group/seg relative min-w-0 outline-none",
            SLOT_BG[s.slot],
            i === 0 && "rounded-l-[4px]",
            i === drawn.length - 1 && "rounded-r-[4px]",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-card transition-opacity group-hover/seg:opacity-100 group-focus/seg:opacity-100"
          >
            {s.label} · {pct(s.percent)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The two NET figures, flanking the bar. These are the pollster's own rows, not our
 * sums – `diverging()` asserts the two agree.
 */
export function DivergingNets({ data }: { data: Diverging }) {
  if (data.nets.length < 2) return null;
  const [support, oppose] = data.nets;
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="font-semibold text-poll-support-strong tabular-nums">
        {support.label} {pct(support.percent)}
      </span>
      <span className="font-semibold text-poll-oppose-strong tabular-nums">
        {oppose.label} {pct(oppose.percent)}
      </span>
    </div>
  );
}

/**
 * Legend and direct labels in one: a swatch, the response's own wording, its value.
 * Labels are read off the data, so an agree/disagree battery legends itself correctly
 * without the component knowing the vocabulary.
 */
export function DivergingLegend({ data }: { data: Diverging }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {data.segments.map((s) => (
        <li key={s.slot} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[2px]", SLOT_BG[s.slot])} aria-hidden />
          <span>{s.label}</span>
          <span className="font-semibold text-foreground tabular-nums">{pct(s.percent)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A nominal question's top responses. One hue for every bar: these categories have no
 * order and no polarity, so colouring them by rank would encode a magnitude that is
 * already carried by the bar's length.
 */
export function NominalBars({ rows }: { rows: Array<{ label: string; percent: number }> }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.percent));

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <span className="text-xs font-semibold text-foreground tabular-nums">{pct(r.percent)}</span>
          <div className="col-span-2 h-1.5 w-full rounded-[4px] bg-surface-variant">
            <div
              className="h-full rounded-[4px] bg-poll-support-strong"
              style={{ width: `${max > 0 ? (r.percent / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
