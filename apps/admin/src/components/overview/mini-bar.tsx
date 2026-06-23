import * as React from "react";
import { cn } from "@/lib/utils";

export type MiniBarTone = "primary" | "success" | "warning" | "error" | "knock" | "muted";

const TONE_BG: Record<MiniBarTone, string> = {
  primary: "bg-primary",
  success: "bg-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning-foreground))]",
  error: "bg-[hsl(var(--error))]",
  knock: "bg-[hsl(var(--knock))]",
  muted: "bg-surface-variant",
};

export type MiniBarSegment = { value: number; tone: MiniBarTone; label?: string };

/** A thin horizontal proportion bar (hand-rolled; no chart lib). */
export function MiniBar({ segments, className }: { segments: MiniBarSegment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-surface-variant", className)}>
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            className={TONE_BG[s.tone]}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={s.label}
          />
        ) : null,
      )}
    </div>
  );
}
