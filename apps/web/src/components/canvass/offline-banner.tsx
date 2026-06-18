"use client";

import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

/** Sticky bar shown only when the device is offline. Reassures the canvasser
 *  that knocks are saved locally and will sync. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-surface-variant px-3 py-2 text-xs font-medium text-foreground">
      <CloudOff className="h-4 w-4" />
      Offline — knocks are saved on this device and will sync when you reconnect.
    </div>
  );
}
