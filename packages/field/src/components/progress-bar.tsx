import * as React from "react";
import { cn } from "@uprise/ui";

export type ProgressBarProps = {
  value: number;
  max?: number;
  className?: string;
  /** Override the fill colour; defaults to the success/green completion tone. */
  tone?: "success" | "primary" | "knock";
  label?: React.ReactNode;
};

const TONE_BG: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  success: "bg-[hsl(var(--success))]",
  primary: "bg-primary",
  knock: "bg-[hsl(var(--knock))]",
};

/** Green completion bar (visited/total). Width transitions for the design's motion. */
export function ProgressBar({ value, max = 100, className, tone = "success", label }: ProgressBarProps) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
          {label}
        </div>
      ) : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", TONE_BG[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
