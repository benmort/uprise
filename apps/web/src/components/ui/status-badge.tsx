import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  MessageCircleMore,
  Send,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  SLA_WARNING: "bg-warning-container text-warning-foreground",
  SLA_BREACH: "bg-error-container text-error",
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
  SLA_WARNING: Clock3,
  SLA_BREACH: AlertCircle,
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
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
    </span>
  );
}
