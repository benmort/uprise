import React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  DRAFTED: "bg-secondary text-secondary-foreground",
  PROOFED: "bg-warning text-warning-foreground",
  SCHEDULED: "bg-primary text-primary-foreground",
  SENDING: "bg-primary text-primary-foreground",
  SENT: "bg-success text-success-foreground",
  FAILED: "bg-error text-error-foreground",
  ACTIVE: "bg-success text-success-foreground",
  ARCHIVED: "bg-secondary text-secondary-foreground",
  UPLOADING: "bg-primary text-primary-foreground",
  PROCESSING: "bg-warning text-warning-foreground",
  COMPLETED: "bg-success text-success-foreground",
  RESPONDED: "bg-warning text-warning-foreground",
  DELIVERED: "bg-primary text-primary-foreground",
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
        STATUS_STYLES[status] || "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}
