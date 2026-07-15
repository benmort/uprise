"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "../hooks/use-online-status";

/**
 * Sticky bar shown when offline — reassures the volunteer that everything they log
 * is saved locally, with a count of items still waiting to sync.
 */
export function OfflineBanner({ pending = 0, force = false }: { pending?: number; force?: boolean }) {
  const online = useOnlineStatus();
  // `force` shows the banner regardless of connectivity — the organiser's read-only walk
  // preview renders it as a sample so the preview matches what canvassers see offline.
  if (online && !force) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-[hsl(var(--warning-container))] px-4 py-3 text-[hsl(var(--warning-foreground))]">
      <span className="flex items-center gap-2 text-sm font-bold leading-snug">
        <CloudOff className="h-4 w-4 shrink-0" />
        Offline — everything you log is saved on this phone
      </span>
      {pending > 0 ? (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-foreground shadow-card">
          <RefreshCw className="h-3.5 w-3.5" />
          {pending} to sync
        </span>
      ) : null}
    </div>
  );
}
