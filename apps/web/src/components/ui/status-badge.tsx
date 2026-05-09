import React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  DRAFTED: "bg-surface-variant text-muted-foreground",
  PROOFED: "bg-warning-container text-warning-foreground",
  SCHEDULED: "bg-secondary-container text-secondary-foreground",
  SENDING: "bg-primary-container text-primary-foreground",
  SENT: "bg-success-container text-success-foreground",
  FAILED: "bg-error-container text-error-foreground",
  ACTIVE: "bg-success-container text-success-foreground",
  ARCHIVED: "bg-surface-variant text-muted-foreground",
  RESPONDED: "bg-warning-container text-warning-foreground",
  DELIVERED: "bg-secondary-container text-secondary-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-label uppercase tracking-[0.05em]",
        STATUS_STYLES[status] || "bg-surface-variant text-muted-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}
