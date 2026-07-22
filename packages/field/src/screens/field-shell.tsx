"use client";

import { useEffect, useState } from "react";
import {
  BrandLoadingScreen,
  BrandStyle,
  Skeleton,
  TenantHead,
  brandVarsCss,
  writeBrandCookie,
  type BrandStyleFields,
} from "@uprise/ui";
import { tenants, type TenantBrand as ApiTenantBrand } from "@uprise/api-client";
import { useSyncQueue } from "../hooks/use-sync-queue";
import { useTurfAutoDownload } from "../hooks/use-turf-auto-download";
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
  // Volunteer id in React state so the installed-app auto-downloader fires once the session
  // resolves (the lib getter is set imperatively; state makes the hook react to it).
  const [volunteerId, setVid] = useState<string | null>(() => getVolunteerId());
  useTurfAutoDownload(volunteerId);
  const [brandStyle, setBrandStyle] = useState<BrandStyleFields | null>(null);
  // Cached tenant brand (logo/name) for the boot loader — instant on a returning device.
  const [bootBrand, setBootBrand] = useState<{ name?: string; logoUrl?: string | null } | null>(null);
  // Tenant tab title + favicon — seeded from the cache, refreshed from the brand fetch. (The PWA
  // install name/icon is branded separately, per-tenant, by app/manifest.webmanifest/route.ts.)
  const [head, setHead] = useState<{ title: string | null; faviconUrl: string | null }>(() => {
    const c = getTenantBrand();
    return { title: c?.name ?? null, faviconUrl: c?.logoUrl ?? null };
  });

  // The httpOnly session cookie is the proof of auth (meld doc 14). We validate it via
  // /auth/check — but for a RETURNING canvasser (a volunteer id already cached), render
  // immediately and run the check in the BACKGROUND, so the assignments fetch overlaps auth
  // instead of waiting behind it (a serial round-trip was the main cold-load delay). A first
  // visit (no cached id) still waits for the check, showing the branded loader.
  useEffect(() => {
    let alive = true;
    const cached = getTenantBrand();
    if (cached) setBootBrand({ name: cached.name, logoUrl: cached.logoUrl });
    // The pre-hydration layout script already injected the persisted `css` (no flash); mirror
    // it into React state so <BrandStyle> owns it from the first render onward.
    if (cached?.primaryColour || cached?.secondaryColour) {
      setBrandStyle({ primaryColour: cached.primaryColour, secondaryColour: cached.secondaryColour });
    }
    // Persisted tenant slug drives the org-branded login bounce on session expiry. The layout
    // script seeds this pre-hydration; re-assert it here in case that ran before the cache existed.
    if (cached?.slug) (window as unknown as { __LOGIN_ORG__?: string }).__LOGIN_ORG__ = cached.slug;
    if (getVolunteerId()) setReady(true); // optimistic — don't block on /auth/check
    // Ask the OS to keep this origin's storage — the offline map pack + knock outbox must
    // survive storage pressure across a shift. Best-effort; fire-and-forget.
    void requestPersistentStorage();

    // Apply a freshly fetched brand everywhere: live styles + head, the persisted cache
    // (with the PRECOMPUTED css the pre-paint script injects next boot) and the
    // parent-domain cookie (so auth/field first-paints stay branded).
    const applyBrand = (brand: ApiTenantBrand, ids: { id: string; name: string; slug: string; logoUrl: string | null }) => {
      setBrandStyle(brand);
      if (brand.logoBlockUrl) setHead((h) => ({ ...h, faviconUrl: brand.logoBlockUrl }));
      const css = brandVarsCss(brand) || null;
      setTenantBrand({
        id: ids.id,
        name: ids.name,
        logoUrl: ids.logoUrl,
        slug: ids.slug,
        logoBlockUrl: brand.logoBlockUrl ?? null,
        primaryColour: brand.primaryColour ?? null,
        secondaryColour: brand.secondaryColour ?? null,
        css,
      });
      writeBrandCookie({
        slug: ids.slug,
        name: ids.name,
        logoUrl: ids.logoUrl,
        logoBlockUrl: brand.logoBlockUrl ?? null,
        css,
      });
    };

    // Colours refresh in PARALLEL with the session check when we already know the slug —
    // one round-trip to a fully branded shell instead of two serial ones.
    const cachedSlug = cached?.slug ?? null;
    const brandPromise = cachedSlug ? tenants.brandBySlug(cachedSlug) : null;

    void (async () => {
      const session = await getSession();
      if (!alive) return;
      if (!session) {
        goToLogin();
        return;
      }
      setVolunteerId(session.id);
      setVid(session.id);
      // Stash the current tenant so My turf can show the campaign brand badge, and persist the
      // slug so an expired session bounces to that tenant's branded volunteer sign-in.
      const current =
        session.memberships?.find((m) => m.tenantId === session.tenantId) ?? session.memberships?.[0];
      if (current) {
        const prior = getTenantBrand();
        setTenantBrand({
          // Keep the cached colours/css until the fresh brand lands — never regress to blue.
          ...(prior && prior.slug === (current.tenantSlug ?? null) ? prior : {}),
          id: current.tenantId,
          name: current.tenantName,
          logoUrl: current.logoUrl ?? null,
          slug: current.tenantSlug ?? null,
        });
        setHead((h) => ({ title: current.tenantName, faviconUrl: current.logoUrl ?? h.faviconUrl }));
        if (current.tenantSlug)
          (window as unknown as { __LOGIN_ORG__?: string }).__LOGIN_ORG__ = current.tenantSlug;
      }
      setReady(true);
      const ids = current
        ? {
            id: current.tenantId,
            name: current.tenantName,
            slug: current.tenantSlug ?? "",
            logoUrl: current.logoUrl ?? null,
          }
        : null;
      // The membership carries only the logo; the brand fetch carries colours + custom CSS.
      // Use the parallel fetch when its slug still matches the session; else refetch.
      if (ids?.slug) {
        const res =
          brandPromise && cachedSlug === ids.slug ? await brandPromise : await tenants.brandBySlug(ids.slug);
        if (alive && res.ok && res.data) applyBrand(res.data, ids);
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
      <TenantHead title={head.title} faviconUrl={head.faviconUrl} />
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
