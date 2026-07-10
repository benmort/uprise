"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, LogoMark, Spinner } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { useQueryParams } from "@/lib/use-query";
import { withReturnTo } from "@/lib/return-to";

/**
 * Generic volunteer landing (`/volunteer`, no campaign) – the same chrome + hero as
 * the per-campaign page (`/volunteer/[campaignId]`), a generic sign-up pitch, then a
 * board of every open volunteering opportunity. Picking one deep-links into that
 * campaign's page, which runs the actual onboarding wizard. Pre-session (the
 * open-join board endpoint is allowlisted).
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
  const returnTo = useQueryParams().get("return_to");
  const [opportunities, setOpportunities] = useState<OpenJoinPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await auth.openJoinList();
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpportunities(res.data);
    })();
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero — identical style to the per-campaign page, generic copy. */}
      <section className="rounded-b-[1.625rem] bg-primary px-[1.625rem] pb-7 pt-8 text-white">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
          <LogoMark className="h-8 w-8 text-white" />
        </span>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.08em] text-white/80">Join the team</p>
        <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.1]">Become a volunteer</h1>
        <p className="mt-3 text-base leading-snug text-white/85">
          Pick a campaign near you and start knocking on doors and talking to voters. Takes two
          minutes to set up – no app store needed.
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
                  href={withReturnTo(`/volunteer/${o.campaignId}`, returnTo)}
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
          <Link href={withReturnTo("/v", returnTo)} className="font-bold text-primary hover:underline">
            Already a volunteer? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
