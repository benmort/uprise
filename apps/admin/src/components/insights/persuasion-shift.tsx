import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDelta, type Shift } from "@/lib/insights/topline";
import { DivergingBar, DivergingLegend } from "./diverging-bar";

/**
 * The same battery asked before and after respondents heard the arguments — the one
 * chart on this page that answers a campaign question rather than reporting a number.
 *
 * It is drawn as two bars on a shared 0–100 scale, never as a dual-axis or an indexed
 * "net shift" line. Movement is reported **per arm** because the two arms move
 * independently: in this poll support holds while opposition hardens, and any single
 * net figure averages that away into "no change".
 */
export function PersuasionShift({
  shift,
  beforeLabel,
  afterLabel,
  beforeHref,
  afterHref,
}: {
  shift: Shift;
  beforeLabel: string;
  afterLabel: string;
  beforeHref: string;
  afterHref: string;
}) {
  const rows = [
    { label: beforeLabel, data: shift.before, href: beforeHref },
    { label: afterLabel, data: shift.after, href: afterHref },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <Link href={r.href} className="text-xs font-semibold text-foreground hover:text-poll-accent">
                {r.label}
              </Link>
              <span className="flex items-baseline gap-3 text-xs tabular-nums">
                <span className="font-semibold text-poll-support-strong">{r.data.positive.toFixed(1)}%</span>
                <span className="text-muted-foreground">vs</span>
                <span className="font-semibold text-poll-oppose-strong">{r.data.negative.toFixed(1)}%</span>
              </span>
            </div>
            <DivergingBar data={r.data} size="lg" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Delta label="Support" delta={shift.positiveDelta} tone="support" />
        <Delta label="Undecided" delta={shift.neutralDelta} tone="neutral" />
        <Delta label="Opposition" delta={shift.negativeDelta} tone="oppose" />
      </div>

      <DivergingLegend data={shift.after} />
    </div>
  );
}

/**
 * A movement figure. The colour tracks the arm it belongs to — the entity — never the
 * direction of travel, so "opposition fell" and "opposition rose" stay the same hue.
 */
function Delta({ label, delta, tone }: { label: string; delta: number; tone: "support" | "neutral" | "oppose" }) {
  const tones = {
    support: "text-poll-support-strong",
    neutral: "text-muted-foreground",
    oppose: "text-poll-oppose-strong",
  } as const;

  return (
    <div className="rounded-[4px] border border-border bg-surface-variant/40 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-extrabold tracking-[-0.02em] tabular-nums", tones[tone])}>
        {formatDelta(delta)}
        {delta !== 0 ? <span className="ml-1 text-xs font-semibold text-muted-foreground">pts</span> : null}
      </p>
    </div>
  );
}

/** The one-line reading of the shift, above the chart. */
export function ShiftHeadline({ shift }: { shift: Shift }) {
  const held = Math.abs(shift.positiveDelta) < 1;
  const hardened = shift.negativeDelta >= 1;

  if (held && hardened) {
    return (
      <p className="text-sm text-muted-foreground">
        Hearing the arguments <span className="font-semibold text-foreground">did not move support</span> (
        {formatDelta(shift.positiveDelta)} pts), but it{" "}
        <span className="font-semibold text-foreground">hardened opposition</span> by{" "}
        {formatDelta(shift.negativeDelta)} points — drawn almost entirely out of the undecided.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      After the arguments, support moved {formatDelta(shift.positiveDelta)} points and opposition{" "}
      {formatDelta(shift.negativeDelta)} points.
    </p>
  );
}

/** The chart's own "read the crosstab" affordance. */
export function CrosstabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-poll-accent hover:underline"
    >
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
