"use client";

import { DoorOpen } from "lucide-react";
import { StatusBadge, cn } from "@uprise/ui";

export type WalkStop = {
  id: string; // WalkListItem id
  contactId: string;
  orderIndex: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
  name?: string | null;
  address?: string | null;
};

/**
 * One household on a walk list — number badge, name/address, status, and a knock
 * action. The next pending stop is highlighted with the brand ring + a primary
 * "Knock — next stop" button; other pending stops get a plain "Knock here"; visited
 * stops show no action.
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
        !pending && "bg-surface/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
            isNext ? "bg-primary text-white" : "bg-surface-variant text-foreground",
          )}
        >
          {stop.orderIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">{stop.name || "Resident"}</p>
          <p className="truncate text-sm text-muted-foreground">{stop.address || "No address"}</p>
        </div>
        <StatusBadge status={stop.status} />
      </div>
      {pending ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors",
            isNext
              ? "bg-primary text-white hover:bg-primary-600"
              : "border border-primary/30 text-primary hover:bg-primary/5",
          )}
        >
          {isNext ? (
            <>
              <DoorOpen className="h-5 w-5" />
              Knock — next stop
            </>
          ) : (
            "Knock here"
          )}
        </button>
      ) : null}
    </div>
  );
}
