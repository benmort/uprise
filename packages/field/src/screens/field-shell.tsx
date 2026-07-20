"use client";

import { useEffect, useState } from "react";
import { BrandLoadingScreen, BrandStyle, Skeleton, type BrandStyleFields } from "@uprise/ui";
import { tenants } from "@uprise/api-client";
import { useSyncQueue } from "../hooks/use-sync-queue";
import { getSession, goToLogin } from "../lib/session";
import { getTenantBrand, getVolunteerId, setTenantBrand, setVolunteerId } from "../lib/volunteer";
import { requestPersistentStorage } from "../lib/storage-persist";
import { OfflineBanner } from "../components/offline-banner";
import { LocationGate } from "../components/location-gate";
import { MeDrawerProvider } from "./me-drawer";

/**
 * Mobile-first shell for the volunteer field PWA — deliberately sidebar-less
 * (the desktop 220px aside is wrong for one-handed field use). Carries only the
 * offline banner; each screen owns its own header (back + title). Used by
 * apps/field's root layout.
 */
export function FieldShell({ children }: { children: React.ReactNode }) {
  const { counts } = useSyncQueue();
  const [ready, setReady] = useState(false);
  const [brandStyle, setBrandStyle] = useState<BrandStyleFields | null>(null);
  // Cached tenant brand (logo/name) for the boot loader — instant on a returning device.
  const [bootBrand, setBootBrand] = useState<{ name?: string; logoUrl?: string | null } | null>(null);

  // The httpOnly session cookie is the proof of auth (meld doc 14). We validate it via
  // /auth/check — but for a RETURNING canvasser (a volunteer id already cached), render
  // immediately and run the check in the BACKGROUND, so the assignments fetch overlaps auth
  // instead of waiting behind it (a serial round-trip was the main cold-load delay). A first
  // visit (no cached id) still waits for the check, showing the branded loader.
  useEffect(() => {
    let alive = true;
    const cached = getTenantBrand();
    if (cached) setBootBrand({ name: cached.name, logoUrl: cached.logoUrl });
    if (getVolunteerId()) setReady(true); // optimistic — don't block on /auth/check
    // Ask the OS to keep this origin's storage — the offline map pack + knock outbox must
    // survive storage pressure across a shift. Best-effort; fire-and-forget.
    void requestPersistentStorage();

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
      if (current)
        setTenantBrand({ id: current.tenantId, name: current.tenantName, logoUrl: current.logoUrl ?? null });
      setReady(true);
      // The membership carries only the logo; fetch the tenant's colours + custom CSS so the
      // whole field PWA wears the campaign brand. Best-effort — a miss just leaves defaults.
      if (current?.tenantSlug) {
        const res = await tenants.brandBySlug(current.tenantSlug);
        if (alive && res.ok && res.data) setBrandStyle(res.data);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Until the session resolves (first visit), paint the shell + a branded loader OVER the
  // skeleton — never a blank screen. This component SSRs, so it's in the very first HTML.
  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 overflow-auto p-4">
          <BrandLoadingScreen
            logoUrl={bootBrand?.logoUrl ?? undefined}
            name={bootBrand?.name}
            message="Loading your turf…"
          />
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
    <MeDrawerProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <BrandStyle brand={brandStyle} />
        <OfflineBanner pending={counts.PENDING ?? 0} />
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
      {/* Shift-start location prompt — blocks over the content until granted or dismissed. */}
      <LocationGate />
    </MeDrawerProvider>
  );
}
