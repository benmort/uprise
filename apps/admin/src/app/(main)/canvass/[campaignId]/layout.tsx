"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { listCampaigns, type CampaignSummary } from "@/lib/api/campaigns";

/**
 * Shared chrome for every campaign-scoped page (turf, walk lists, live, results,
 * …): a campaign switcher that swaps the [campaignId] path segment in place, so
 * the URL is always the source of truth for which campaign you're working in —
 * same model as the /canvass overview's ?campaign= selector.
 */
export default function CampaignScopedLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ campaignId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (alive && res.ok) setCampaigns(res.data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const switchTo = (id: string) => {
    if (!id || id === params.campaignId) return;
    // Same subpage, other campaign; the query string is dropped deliberately
    // (turfId etc. belong to the campaign being left).
    router.push(pathname.replace(`/canvass/${params.campaignId}`, `/canvass/${id}`));
  };

  return (
    <>
      {/* Chrome, not a data surface: if the list hasn't loaded (or the user can't
          list campaigns) the row simply doesn't render — the page still works. */}
      {campaigns.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign</span>
          <select
            value={params.campaignId}
            onChange={(e) => switchTo(e.target.value)}
            aria-label="Campaign"
            className="h-9 rounded-[11px] border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          >
            {/* Keep the current id selectable even if it's not in the list (stale link). */}
            {campaigns.some((c) => c.id === params.campaignId) ? null : (
              <option value={params.campaignId}>Unknown campaign</option>
            )}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {children}
    </>
  );
}
