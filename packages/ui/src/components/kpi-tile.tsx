import * as React from "react";
import { cn } from "../lib/utils";
import { MicroLabel } from "./micro-label";

export interface KpiTileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The micro-label above the number (a node so callers can append a TooltipHint). */
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: { value: string; direction?: "up" | "down" | "flat" };
  icon?: React.ReactNode;
  /** Headline value scale: sm = text-xl, md = text-2xl, lg = text-3xl (the field default). */
  size?: "sm" | "md" | "lg";
  /** Small line under the value — for a qualifier the delta shape doesn't fit. */
  caption?: React.ReactNode;
}

const VALUE_SIZE: Record<NonNullable<KpiTileProps["size"]>, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
};

/** A single headline metric: big tabular number + uppercase micro-label + optional delta. */
export const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  ({ label, value, delta, icon, size = "lg", caption, className, ...rest }, ref) => {
    const dir = delta?.direction ?? "flat";
    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}
        {...rest}
      >
        <div className="flex items-center justify-between">
          <MicroLabel className="inline-flex items-center gap-1">{label}</MicroLabel>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <div className={cn("mt-2 font-extrabold tabular-nums text-foreground", VALUE_SIZE[size])}>
          {value}
        </div>
        {delta ? (
          <div
            className={cn(
              "mt-1 text-xs font-semibold tabular-nums",
              dir === "up" && "text-success",
              dir === "down" && "text-error",
              dir === "flat" && "text-muted-foreground",
            )}
          >
            {delta.value}
          </div>
        ) : null}
        {caption ? <div className="mt-1 text-xs text-muted-foreground">{caption}</div> : null}
      </div>
    );
  },
);
KpiTile.displayName = "KpiTile";
