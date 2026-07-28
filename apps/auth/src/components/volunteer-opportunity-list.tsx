"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, Spinner } from "@uprise/ui";
import type { OpenJoinPreview } from "@uprise/contracts";

/** Deterministic per-tenant gradient – the fallback avatar when an org has set no logo (the same
 *  treatment the tenant selector uses, so an org looks like itself everywhere). */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
export function tenantGradient(id: string): string {
  const h1 = hashHue(id);
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${h2} 76% 46%))`;
}

/**
 * The open-opportunities card list, with all four feedback states. Shared by the `/volunteer`
 * board and the branded "sign-ups closed" page, so a campaign card looks identical wherever a
 * volunteer meets one. The caller owns the heading, the link target (`hrefFor` – the board keeps
 * `?org`/`return_to` on the hop) and the empty copy, since "no campaigns at all" and "this org has
 * nothing else open" want different words.
 */
export function VolunteerOpportunityList({
  opportunities,
  loading,
  error,
  hrefFor,
  emptyBody,
  emptyAction,
}: {
  opportunities: OpenJoinPreview[] | null;
  loading: boolean;
  error: string | null;
  hrefFor: (o: OpenJoinPreview) => string;
  emptyBody: string;
  /** Optional CTA under the empty copy – e.g. "Browse every open campaign". */
  emptyAction?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (error) return <Alert variant="error" title={error} />;
  if (!opportunities || opportunities.length === 0) {
    return (
      <div className="rounded-[0.9rem] border border-dashed border-ink/15 px-4 py-8 text-center">
        <p className="text-sm text-ink/55">{emptyBody}</p>
        {emptyAction ? <div className="mt-4">{emptyAction}</div> : null}
      </div>
    );
  }
  return (
    <ul className="space-y-2.5">
      {opportunities.map((o) => (
        <li key={o.campaignId}>
          <Link
            href={hrefFor(o)}
            className="flex items-center gap-3 rounded-[0.9rem] border border-ink/10 bg-white p-3 transition hover:border-primary/40 hover:bg-primary/[0.03] dark:bg-white/[0.05] dark:hover:bg-primary/[0.12]"
          >
            {/* Off-white plate behind the logo in dark mode – tenant logos are drawn
                for light backgrounds and vanish on the dark card without it. */}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl dark:bg-[#f4f3f0] dark:p-1">
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt={o.tenantName} className="h-full w-full rounded-lg object-cover" />
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
              {o.tenantName ? <span className="block truncate text-sm text-ink/55">{o.tenantName}</span> : null}
            </span>
            <span aria-hidden className="shrink-0 text-lg text-ink/30">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
