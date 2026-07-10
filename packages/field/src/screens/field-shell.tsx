"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@uprise/ui";
import { useSyncQueue } from "../hooks/use-sync-queue";
import { getSession, goToLogin } from "../lib/session";
import { setTenantBrand, setVolunteerId } from "../lib/volunteer";
import { OfflineBanner } from "../components/offline-banner";

/**
 * Mobile-first shell for the volunteer field PWA — deliberately sidebar-less
 * (the desktop 220px aside is wrong for one-handed field use). Carries only the
 * offline banner; each screen owns its own header (back + title). Used by
 * apps/field's root layout.
 */
export function FieldShell({ children }: { children: React.ReactNode }) {
  const { counts } = useSyncQueue();
  const [ready, setReady] = useState(false);

  // The httpOnly session cookie is the proof of auth (meld doc 14). Resolve the
  // principal to seed the volunteer id the field pages read from localStorage.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await getSession();
      if (!alive) return;
      if (!session) {
        goToLogin();
        return;
      }
      setVolunteerId(session.id);
      // Stash the current tenant so My turf can show the campaign brand badge.
      const current =
        session.memberships?.find((m) => m.tenantId === session.tenantId) ?? session.memberships?.[0];
      if (current) setTenantBrand({ id: current.tenantId, name: current.tenantName });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Until the session resolves, paint the shell + a skeleton (not a blank screen).
  // This component SSRs, so the skeleton is in the very first HTML — the app never
  // shows nothing while `/auth/check` is in flight.
  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 overflow-auto p-4">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner pending={counts.PENDING ?? 0} />
      <main className="flex-1 overflow-auto p-4">{children}</main>
    </div>
  );
}
