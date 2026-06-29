"use client";

import { StatusBadge } from "@uprise/ui";
import type { OutboxStatus } from "../lib/sync-queue";

/** Surfaces the outbox state. Wraps StatusBadge (extended with the sync keys).
 *  Shows the pending count when there's unsynced work. */
export function SyncStatusBadge({
  counts,
  online,
}: {
  counts: Record<OutboxStatus, number>;
  online: boolean;
}) {
  if (!online && counts.PENDING === 0 && counts.SYNCING === 0) {
    return <StatusBadge status="OFFLINE" />;
  }
  if (counts.CONFLICT > 0) {
    return <StatusBadge status="SYNC_CONFLICT" className="gap-1.5" />;
  }
  if (counts.SYNCING > 0) {
    return <StatusBadge status="SYNCING" />;
  }
  if (counts.PENDING > 0) {
    return (
      <StatusBadge status="PENDING_SYNC" className="gap-1.5">
        {counts.PENDING}
      </StatusBadge>
    );
  }
  return <StatusBadge status="SYNCED" />;
}
