"use client";

import { Home } from "lucide-react";
import { cn } from "@uprise/ui";

export type WalkStop = {
  id: string; // WalkListItem id
  contactId: string;
  orderIndex: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
  name?: string | null;
  address?: string | null;
};

/** Status pill — muted "Pending"/"Skipped", green "Visited" (no icon, matching the design). */
function StopStatusPill({ status }: { status: WalkStop["status"] }) {
  const visited = status === "VISITED";
  const label = visited ? "Visited" : status === "SKIPPED" ? "Skipped" : "Pending";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        visited ? "bg-success-container text-success" : "bg-surface-variant text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * One household on a walk list — number badge, name/address, status pill, and a
 * knock action. The next pending stop is highlighted with the brand ring + a
 * primary "Knock — next stop" button; other pending stops get an outline "Knock
 * here"; visited stops are dimmed and show no action.
 */
export function WalkStopCard({
  stop,
  isNext,
  onOpen,
}: {
  stop: WalkStop;
  isNext?: boolean;
  onOpen: () => void;
}) {
  const pending = stop.status === "PENDING";
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-card",
        isNext ? "border-primary ring-1 ring-primary" : "border-border",
        !pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
            isNext ? "bg-primary text-white" : "bg-surface-variant text-muted-foreground",
          )}
        >
          {stop.orderIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">{stop.name || "Resident"}</p>
          <p className="truncate text-sm text-muted-foreground">{stop.address || "No address"}</p>
        </div>
        <StopStatusPill status={stop.status} />
      </div>
      {pending ? (
        isNext ? (
          <button
            type="button"
            onClick={onOpen}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white transition-colors hover:bg-primary/90"
          >
            <Home className="h-5 w-5" />
            Knock — next stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-border text-base font-bold text-primary transition-colors hover:bg-primary/5"
          >
            Knock here
          </button>
        )
      ) : null}
    </div>
  );
}
