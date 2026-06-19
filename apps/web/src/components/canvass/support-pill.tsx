import * as React from "react";
import { cn } from "@/lib/utils";
import { SUPPORT_META, supportColor, type SupportLevel } from "./support-level";

export type SupportPillProps = {
  level: SupportLevel;
  variant?: "pill" | "dot";
  className?: string;
};

/** Campaign support level as a coloured pill (label) or a dot chip. */
export function SupportPill({ level, variant = "pill", className }: SupportPillProps) {
  const meta = SUPPORT_META[level];
  const color = supportColor(level);
  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-foreground", className)}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {meta.label}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {meta.label}
    </span>
  );
}
