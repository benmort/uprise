"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, BrandStyle, LogoMark, Spinner } from "@uprise/ui";
import { auth, tenants, tenantLogoUrl, type TenantBrand } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { useQueryParams } from "@/lib/use-query";
import { withReturnTo } from "@/lib/return-to";
import { VolunteerFlowShell } from "@/components/volunteer-flow-shell";

/**
 * Volunteer landing (`/volunteer`) – a hero + a board of open volunteering opportunities. Picking one
 * deep-links into that campaign's page, which runs the onboarding wizard. Pre-session (allowlisted).
 *
 * Two modes, one page:
 *  - GENERIC (`/volunteer`): Uprise-branded, every open campaign across all tenants.
 *  - TENANT-WIDE (`/volunteer?org=<slug>`): scoped to one tenant + wearing its brand — the hero fills
 *    with the tenant's PRIMARY colour, shows its logo/name, and the board lists only its campaigns.
 */

// Deterministic fallback avatar (mirrors the campaign page + admin's TenantAvatar):
// a gradient disc keyed on the tenant id when the org hasn't uploaded a logo.
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function tenantGradient(id: string): string {
  const h1 = hashHue(id);
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${h2} 76% 46%))`;
}

export default function VolunteerBoardPage() {
  // The field app bounces unauthenticated volunteers here. Carry its `return_to` through
  // every link out of this page, or finishing the flow strands them on the wrong app.
  const params = useQueryParams();
  const returnTo = params.get("return_to");
  // Tenant-wide recruit mode: `?org=<slug>` (or `?tenant=`) scopes + brands the board.
  const orgSlug = params.get("org") || params.get("tenant");
  const [opportunities, setOpportunities] = useState<OpenJoinPreview[] | null>(null);
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [list, b] = await Promise.all([
        auth.openJoinList(orgSlug ?? undefined),
        orgSlug ? tenants.brandBySlug(orgSlug) : Promise.resolve(null),
      ]);
      setLoading(false);
      if (b && b.ok) setBrand(b.data);
      if (!list.ok) {
        setError(list.error);
        return;
      }
      setOpportunities(list.data);
    })();
  }, [orgSlug]);

  // Keep `?org` on every link out so the brand + scope survive the hop into a campaign / sign-in.
  const withOrg = useMemo(
    () =>
      (href: string) => {
        const h = withReturnTo(href, returnTo);
        return orgSlug ? `${h}${h.includes("?") ? "&" : "?"}org=${encodeURIComponent(orgSlug)}` : h;
      },
    [orgSlug, returnTo],
  );
  const orgLogo = tenantLogoUrl(brand);

  return (
    <VolunteerFlowShell>
    {/* Tenant-wide mode wears the org brand (primary fills the hero via --primary). */}
    {brand ? <BrandStyle brand={brand} /> : null}
    <div className="flex flex-1 flex-col">
      {/* Hero — Uprise-branded generically, or the tenant's logo/name/primary in `?org` mode. */}
      <section className="rounded-b-[1.625rem] bg-primary px-[1.625rem] pb-7 pt-8 text-white">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
          {orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogo} alt={brand?.name ?? "Organisation"} className="h-full w-full object-contain p-1" />
          ) : orgSlug ? (
            <LogoMark className="h-9 w-9 text-primary" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/uprise-icon.svg" alt="Uprise" className="h-11 w-11 rounded-xl" />
          )}
        </span>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.08em] text-white/80">Join the team</p>
        <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.1]">
          Become a volunteer{brand?.name ? ` with ${brand.name}` : ""}
        </h1>
        <p className="mt-3 text-base leading-snug text-white/85">
          Pick a campaign{brand?.name ? "" : " near you"} and start knocking on doors and talking to voters.
          Takes two minutes to set up – no app store needed.
        </p>
      </section>

      {/* Opportunities board */}
      <div className="flex-1 px-[1.625rem] pt-6">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-ink/50">
          Open opportunities
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <Alert variant="error" title={error} />
        ) : opportunities && opportunities.length > 0 ? (
          <ul className="space-y-2.5">
            {opportunities.map((o) => (
              <li key={o.campaignId}>
                <Link
                  href={withOrg(`/volunteer/${o.campaignId}`)}
                  className="flex items-center gap-3 rounded-[0.9rem] border border-ink/10 bg-white p-3 transition hover:border-primary/40 hover:bg-primary/[0.03]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                    {o.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.logoUrl} alt={o.tenantName} className="h-full w-full object-cover" />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-base font-extrabold text-white"
                        style={{ background: tenantGradient(o.tenantId) }}
                      >
                        {(o.tenantName || o.campaignName).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{o.campaignName}</span>
                    {o.tenantName ? (
                      <span className="block truncate text-sm text-ink/55">{o.tenantName}</span>
                    ) : null}
                  </span>
                  <span aria-hidden className="shrink-0 text-lg text-ink/30">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[0.9rem] border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/55">
            No open opportunities right now. Check back soon.
          </p>
        )}
      </div>

      {/* Sign in */}
      <div className="px-[1.625rem] pb-5 pt-5">
        <p className="text-center text-base">
          <Link href={withOrg("/volunteer/sign-in")} className="font-bold text-primary hover:underline">
            Already a volunteer? Sign in
          </Link>
        </p>
      </div>
    </div>
    </VolunteerFlowShell>
  );
}
