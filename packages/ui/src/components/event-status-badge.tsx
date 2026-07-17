import * as React from "react";
import { cn } from "../lib/utils";

export type DerivedEventStatus = "draft" | "upcoming" | "ongoing" | "completed" | "cancelled";

/** Token pill per derived event status (blue upcoming, green ongoing, grey done, red cancelled). */
const PILL: Record<DerivedEventStatus, string> = {
  upcoming: "bg-primary-container text-foreground",
  ongoing: "bg-success-container text-success",
  completed: "bg-surface-variant text-foreground",
  cancelled: "bg-error-container text-error",
  draft: "bg-secondary-container text-secondary-foreground",
};

export function EventStatusBadge({ status, className }: { status: DerivedEventStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", PILL[status], className)}>
      {status}
    </span>
  );
}
