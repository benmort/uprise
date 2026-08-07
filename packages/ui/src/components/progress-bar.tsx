import * as React from "react";
import { cn } from "../lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  /** Override the fill colour; defaults to the success/green completion tone. */
  tone?: "success" | "primary" | "knock";
  label?: React.ReactNode;
}

const TONE_BG: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  success: "bg-success",
  primary: "bg-primary",
  knock: "bg-knock",
};

/** Green completion bar (visited/total). Width transitions for the design's motion.
 *  Sibling of `Progress` (which is the plain determinate bar with a11y roles) — this one
 *  carries the label row + tone palette the canvass surfaces use. */
export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, max = 100, className, tone = "success", label, ...rest }, ref) => {
    const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    return (
      <div ref={ref} className={cn("w-full", className)} {...rest}>
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
  },
);
ProgressBar.displayName = "ProgressBar";
