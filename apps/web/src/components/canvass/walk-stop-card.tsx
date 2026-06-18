"use client";

import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type WalkStop = {
  id: string; // WalkListItem id
  contactId: string;
  orderIndex: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
  name?: string | null;
  address?: string | null;
};

/** One household on a walk list. Wraps Card + reuses Button/StatusBadge. */
export function WalkStopCard({
  stop,
  isNext,
  onOpen,
}: {
  stop: WalkStop;
  isNext?: boolean;
  onOpen: () => void;
}) {
  return (
    <Card className={cn("flex items-center gap-3 p-3", isNext && "ring-2 ring-primary")}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-variant text-sm font-medium">
        {stop.orderIndex + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{stop.name || "Unknown resident"}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {stop.address || "No address"}
        </p>
      </div>
      <StatusBadge status={stop.status} />
      <Button
        size="sm"
        variant={stop.status === "PENDING" ? "default" : "outline"}
        onClick={onOpen}
      >
        {stop.status === "PENDING" ? "Knock" : "View"}
      </Button>
    </Card>
  );
}
