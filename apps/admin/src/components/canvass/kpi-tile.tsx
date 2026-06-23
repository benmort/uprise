import * as React from "react";
import { cn } from "@/lib/utils";

export type KpiTileProps = {
  label: string;
  value: React.ReactNode;
  delta?: { value: string; direction?: "up" | "down" | "flat" };
  icon?: React.ReactNode;
  className?: string;
};

/** A single headline metric: big tabular number + uppercase micro-label + optional delta. */
export function KpiTile({ label, value, delta, icon, className }: KpiTileProps) {
  const dir = delta?.direction ?? "flat";
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">{value}</div>
      {delta ? (
        <div
          className={cn(
            "mt-1 text-xs font-semibold tabular-nums",
            dir === "up" && "text-[hsl(var(--success))]",
            dir === "down" && "text-[hsl(var(--error))]",
            dir === "flat" && "text-muted-foreground",
          )}
        >
          {delta.value}
        </div>
      ) : null}
    </div>
  );
}
