"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface StepProgressProps {
  /** 1-based count of completed/active steps (fills segments 0..current-1). */
  current: number;
  total: number;
  className?: string;
}

/**
 * Segmented step indicator — the onboarding wizard's header bar. Filled segments are
 * the brand colour, the rest are the track. Equal-width, full-width row.
 */
export function StepProgress({ current, total, className }: StepProgressProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="progressbar" aria-valuenow={current} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            i < current ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}
