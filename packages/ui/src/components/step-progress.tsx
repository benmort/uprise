"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface StepProgressProps {
  /** 1-based count of completed/active steps (fills segments 0..current-1). */
  current: number;
  total: number;
  className?: string;
  /**
   * Makes each segment a button that jumps to that step (1-based). Omit for a plain
   * indicator — the admin onboarding meters have nowhere to jump to.
   */
  onSelect?: (step: number) => void;
  /** Highest step that may be jumped to (1-based). Defaults to `current`. */
  reachable?: number;
  /** Step names, used to name each button for a screen reader. */
  labels?: readonly string[];
}

const BAR = "h-1.5 rounded-full transition-colors duration-300";

/**
 * Segmented step indicator — the onboarding wizard's header bar. Filled segments are
 * the brand colour, the rest are the track. Equal-width, full-width row.
 *
 * With `onSelect` the segments become navigation back through the flow, and keep exactly
 * the same 1.5px bars: the touch target is grown with transparent vertical padding that a
 * negative margin takes straight back out of the layout, so the row's height is unchanged.
 */
export function StepProgress({ current, total, className, onSelect, reachable, labels }: StepProgressProps) {
  if (!onSelect) {
    return (
      <div
        className={cn("flex items-center gap-2", className)}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemax={total}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn(BAR, "flex-1", i < current ? "bg-primary" : "bg-border")} />
        ))}
      </div>
    );
  }

  const canReach = reachable ?? current;

  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label="Progress">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < current;
        const enabled = i < canReach;
        const name = labels?.[i];
        return (
          <button
            key={i}
            type="button"
            disabled={!enabled}
            onClick={() => onSelect(i + 1)}
            aria-current={i === current - 1 ? "step" : undefined}
            aria-label={name ? `Step ${i + 1} of ${total}: ${name}` : `Step ${i + 1} of ${total}`}
            className={cn("group -my-2 flex-1 py-2 outline-none disabled:cursor-default", enabled && "cursor-pointer")}
          >
            <span
              className={cn(
                BAR,
                "block w-full",
                filled ? "bg-primary" : "bg-border",
                enabled && "group-hover:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-ring",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
