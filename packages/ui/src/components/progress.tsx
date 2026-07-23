import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const trackVariants = cva("w-full overflow-hidden rounded-full bg-surface-variant", {
  variants: { size: { sm: "h-1.5", md: "h-2", lg: "h-3" } },
  defaultVariants: { size: "md" },
});

const barVariants = cva("h-full rounded-full transition-[width] duration-300 ease-out", {
  variants: {
    tone: {
      primary: "bg-primary",
      success: "bg-success",
      warning: "bg-warning-foreground",
      error: "bg-error",
    },
  },
  defaultVariants: { tone: "primary" },
});

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof trackVariants>,
    VariantProps<typeof barVariants> {
  value: number;
  max?: number;
  /** Extra classes for the inner fill bar (the outer track takes `className`). */
  barClassName?: string;
}

/**
 * Determinate percentage bar (`role="progressbar"`). For a segmented wizard use
 * `StepProgress`; for a capacity/limit gauge use `CapacityMeter`.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, barClassName, value, max = 100, size, tone, ...props }, ref) => {
    const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(trackVariants({ size, className }))}
        {...props}
      >
        <div className={cn(barVariants({ tone, className: barClassName }))} style={{ width: `${pct}%` }} />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress, trackVariants as progressTrackVariants, barVariants as progressBarVariants };
