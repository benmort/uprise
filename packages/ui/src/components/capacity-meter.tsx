import * as React from "react";
import { cn } from "../lib/utils";

export type CapacityMeterProps = {
  /** Confirmed heads (GOING + ATTENDED, incl. guests). */
  going: number;
  /** Heads waiting (rendered as a second, amber segment). */
  waitlist?: number;
  /** null ⇒ unbounded (no cap; the bar reads "N going"). */
  capacity: number | null;
  className?: string;
};

/**
 * A capacity bar: a filled GOING segment (brand primary) + an amber WAITLIST segment against the
 * event's capacity, with a plain-English summary above ("12 of 50 going · 38 spots left" →
 * "Full — waitlist open"). Design-tokens only. Shared by the admin detail + public event pages.
 */
export function CapacityMeter({ going, waitlist = 0, capacity, className }: CapacityMeterProps) {
  const cap = capacity != null && capacity > 0 ? capacity : null;
  const goingPct = cap ? Math.min(100, (going / cap) * 100) : going > 0 ? 100 : 0;
  const waitPct = cap ? Math.min(100 - goingPct, (waitlist / cap) * 100) : 0;
  const full = capacity != null && going >= capacity;
  const spotsLeft = capacity != null ? Math.max(0, capacity - going) : null;

  const label =
    capacity == null
      ? `${going.toLocaleString()} going`
      : full
        ? waitlist > 0
          ? `Full · ${waitlist.toLocaleString()} on the waitlist`
          : "Full — waitlist open"
        : `${going.toLocaleString()} of ${capacity.toLocaleString()} going · ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-variant"
        role="progressbar"
        aria-valuenow={going}
        aria-valuemin={0}
        aria-valuemax={capacity ?? undefined}
      >
        <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${goingPct}%` }} />
        {waitPct > 0 ? (
          <div
            className="h-full bg-warning-foreground transition-[width] duration-300 ease-out"
            style={{ width: `${waitPct}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}
