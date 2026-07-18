"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Alert, Spinner } from "@uprise/ui";
import { auth, tenants, tenantLogoUrl, type TenantBrand } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { useQueryParams } from "@/lib/use-query";
import { withReturnTo } from "@/lib/return-to";
import { VolunteerJoinHero } from "@/components/volunteer-join-hero";

/**
 * Volunteer landing (`/volunteer`) — the SAME two-column join hero as the per-campaign page
 * (`/volunteer/[campaignId]`), so the campaign-less entry reads identically. It wears Uprise's
 * brand colours by default; `?org=<slug>` scopes + brands it to one tenant. Because there's no
 * campaign chosen yet, "Get started" opens the open-opportunities board (pick a campaign) rather
 * than launching a campaign's onboarding wizard.
 */
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
  const params = useQueryParams();
  const returnTo = params.get("return_to");
  const orgSlug = params.get("org") || params.get("tenant");
  const [opportunities, setOpportunities] = useState<OpenJoinPreview[] | null>(null);
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Landing = the join hero; "Get started" reveals the campaign board (there's no single
  // campaign to onboard into from the generic route).
  const [view, setView] = useState<"hero" | "board">("hero");

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

  // Keep `?org` + `return_to` on every link out so brand + scope survive the hop.
  const withOrg = useMemo(
    () =>
      (href: string) => {
        const h = withReturnTo(href, returnTo);
        return orgSlug ? `${h}${h.includes("?") ? "&" : "?"}org=${encodeURIComponent(orgSlug)}` : h;
      },
    [orgSlug, returnTo],
  );
  const orgLogo = tenantLogoUrl(brand);

  // The open-opportunities board — rendered INSIDE the hero's right column (`rightOverride`),
  // so the brand hero stays on the left on desktop and the board fills the screen on mobile.
  const boardPanel = (
    <div className="w-full lg:max-w-xl">
      <button
        type="button"
        onClick={() => setView("hero")}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink/60 hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <h1 className="text-2xl font-extrabold text-ink lg:text-3xl">Open opportunities</h1>
      <p className="mt-1 text-base text-ink/60">Pick a campaign near you to get started.</p>

      <div className="mt-6">
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

      <p className="mt-6 text-center text-base sm:text-left">
        <Link href={withOrg("/volunteer/sign-in")} className="font-bold text-primary hover:underline">
          Already a volunteer? Sign in
        </Link>
      </p>
    </div>
  );

  // With an `?org`, hold the first paint until the brand resolves, so the page opens directly
  // in the org's colours + name — never a flash of Uprise's default brand snapping to the org's.
  // (No `?org` → Uprise's default brand is already correct, so paint immediately.)
  if (orgSlug && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f5]">
        <Spinner />
      </div>
    );
  }

  // Same two-column join hero throughout — "Get started" swaps the RIGHT column to the
  // opportunities board (via `rightOverride`) instead of switching to a separate shell.
  return (
    <VolunteerJoinHero
      tenantName={brand?.name ?? null}
      logoUrl={orgLogo}
      tenantId={brand?.id ?? null}
      // No brand → the hero keeps Uprise's default primary/secondary. `?org` wears the tenant's.
      primaryColour={brand?.primaryColour ?? null}
      secondaryColour={brand?.secondaryColour ?? null}
      customCss={brand?.customCss ?? null}
      eyebrow="Join the team"
      headline={`Become a volunteer${brand?.name ? ` with ${brand.name}` : ""}`}
      intro="Pick a campaign near you and start knocking on doors and talking to voters. Takes two minutes to set up – no app store needed."
      featureHeading="Open opportunities"
      onGetStarted={() => setView("board")}
      signInHref={withOrg("/volunteer/sign-in")}
      scrollHint={view === "hero"}
      rightOverride={view === "board" ? boardPanel : undefined}
    />
  );
}
