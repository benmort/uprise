import * as React from "react";
import { cn } from "@uprise/ui";
import { SUPPORT_META, SUPPORT_ORDER, supportColor, type SupportLevel } from "./support-level";

export type SupportLevelBarProps = {
  /** Counts per support level. Missing levels are treated as 0. */
  counts: Partial<Record<SupportLevel, number>>;
  showLegend?: boolean;
  className?: string;
};

/** Left-to-right stacked bar of the support-level distribution, with optional %-legend. */
export function SupportLevelBar({ counts, showLegend = true, className }: SupportLevelBarProps) {
  const total = SUPPORT_ORDER.reduce((sum, level) => sum + (counts[level] ?? 0), 0);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-variant">
        {SUPPORT_ORDER.map((level) => {
          const count = counts[level] ?? 0;
          if (total <= 0 || count <= 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={level}
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%`, backgroundColor: supportColor(level) }}
              title={`${SUPPORT_META[level].label}: ${count}`}
            />
          );
        })}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SUPPORT_ORDER.map((level) => {
            const count = counts[level] ?? 0;
            const pct = total <= 0 ? 0 : Math.round((count / total) * 100);
            return (
              <span key={level} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: supportColor(level) }} />
                <span className="text-foreground">{SUPPORT_META[level].label}</span>
                <span className="tabular-nums">{pct}%</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
