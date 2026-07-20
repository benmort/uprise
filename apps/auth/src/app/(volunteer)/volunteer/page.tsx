import type { Metadata } from "next";
import { tenants, type TenantBrand } from "@uprise/api-client";
import { VolunteerBoardClient } from "./volunteer-board-client";

/** Per-tenant tab title + favicon (square block logo) when the board is org-scoped (`?org=`). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { org?: string; tenant?: string };
}): Promise<Metadata> {
  const orgSlug = searchParams.org || searchParams.tenant || null;
  if (!orgSlug) return {};
  try {
    const res = await tenants.brandBySlug(orgSlug);
    if (res.ok && res.data) {
      return {
        title: res.data.name,
        ...(res.data.logoBlockUrl ? { icons: { icon: res.data.logoBlockUrl } } : {}),
      };
    }
  } catch {
    /* fall back to the app default metadata */
  }
  return {};
}

/**
 * Volunteer landing (`/volunteer`) — the SAME two-column join hero as the per-campaign page
 * (`/volunteer/[campaignId]`). Uprise's brand by default; `?org=<slug>` scopes + brands it to
 * one tenant. SERVER component: it resolves the tenant brand here (server-side), so the first
 * byte of HTML is already in the org's colours + name — the client half (VolunteerBoardClient)
 * seeds its state from `initialBrand`, so there's no flash of the default brand snapping to the
 * org's on load. The org's opportunities list still loads on the client.
 */
export default async function VolunteerLandingPage({
  searchParams,
}: {
  searchParams: { org?: string; tenant?: string; return_to?: string };
}) {
  const orgSlug = searchParams.org || searchParams.tenant || null;
  const returnTo = searchParams.return_to || null;

  // Fetch the brand up-front (public GET) so the hero renders branded on first paint. Any
  // failure (unknown slug, API hiccup) falls back to Uprise's default brand — never a blank page.
  let initialBrand: TenantBrand | null = null;
  if (orgSlug) {
    try {
      const res = await tenants.brandBySlug(orgSlug);
      if (res.ok) initialBrand = res.data;
    } catch {
      /* fall back to the default brand */
    }
  }

  return <VolunteerBoardClient initialBrand={initialBrand} orgSlug={orgSlug} returnTo={returnTo} />;
}
