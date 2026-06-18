"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { OfflineBanner } from "@/components/canvass/offline-banner";
import { SyncStatusBadge } from "@/components/canvass/sync-status-badge";

/**
 * Mobile-first shell for the canvasser field PWA — deliberately sidebar-less
 * (the desktop 220px aside is wrong for one-handed field use). Top bar carries
 * the offline banner and live sync status.
 */
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const { counts, online } = useSyncQueue();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner />
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href="/field" className="flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          Canvass
        </Link>
        <SyncStatusBadge counts={counts} online={online} />
      </header>
      <main className="flex-1 overflow-auto p-4">{children}</main>
    </div>
  );
}
