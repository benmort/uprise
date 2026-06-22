import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CloudOff,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../lib/utils";

const STATUS_STYLES: Record<string, string> = {
  DRAFTED: "bg-secondary-container text-secondary-foreground",
  PROOFED: "bg-warning-container text-warning-foreground",
  SCHEDULED: "bg-primary-container text-foreground",
  SENDING: "bg-primary-container text-foreground",
  SENT: "bg-success-container text-success",
  FAILED: "bg-error-container text-error",
  ACTIVE: "bg-success-container text-success",
  ARCHIVED: "bg-surface-variant text-foreground",
  UPLOADING: "bg-primary-container text-foreground",
  PROCESSING: "bg-primary-container text-foreground",
  COMPLETED: "bg-success-container text-success",
  RESPONDED: "bg-warning-container text-warning-foreground",
  DELIVERED: "bg-primary-container text-foreground",
  READ: "bg-success-container text-success",
  OPTED_OUT: "bg-error-container text-error",
  SLA_WARNING: "bg-warning-container text-warning-foreground",
  SLA_BREACH: "bg-error-container text-error",
  // Canvassing offline-sync states
  SYNCED: "bg-success-container text-success",
  PENDING_SYNC: "bg-warning-container text-warning-foreground",
  SYNCING: "bg-primary-container text-foreground",
  SYNC_CONFLICT: "bg-error-container text-error",
  OFFLINE: "bg-surface-variant text-foreground",
  // Walk-list item states
  PENDING: "bg-secondary-container text-secondary-foreground",
  VISITED: "bg-success-container text-success",
  SKIPPED: "bg-surface-variant text-foreground",
  // Turf assignment states
  UNASSIGNED: "bg-secondary-container text-secondary-foreground",
  IN_PROGRESS: "bg-primary-container text-foreground",
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  DRAFTED: CircleDashed,
  PROOFED: ShieldCheck,
  SCHEDULED: Clock3,
  SENDING: Send,
  SENT: CheckCircle2,
  FAILED: AlertCircle,
  ACTIVE: CheckCircle2,
  ARCHIVED: CircleDashed,
  UPLOADING: Send,
  PROCESSING: Clock3,
  COMPLETED: CheckCircle2,
  RESPONDED: MessageCircleMore,
  DELIVERED: CheckCircle2,
  READ: CheckCircle2,
  OPTED_OUT: AlertCircle,
  SLA_WARNING: Clock3,
  SLA_BREACH: AlertCircle,
  SYNCED: CheckCircle2,
  PENDING_SYNC: Clock3,
  SYNCING: RefreshCw,
  SYNC_CONFLICT: AlertCircle,
  OFFLINE: CloudOff,
  PENDING: CircleDashed,
  VISITED: CheckCircle2,
  SKIPPED: CircleDashed,
  UNASSIGNED: CircleDashed,
  IN_PROGRESS: Clock3,
};

export function StatusBadge({
  status,
  className,
  children,
}: {
  status: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const Icon = STATUS_ICONS[status] || CircleDashed;
  const label = status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-label font-medium tracking-[0.04em]",
        STATUS_STYLES[status] || "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {children != null && <span className="ml-0.5 tabular-nums">{children}</span>}
    </span>
  );
}
