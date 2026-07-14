"use client";

import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { listCampaigns } from "@/lib/api/campaigns";
import { useApi } from "@/lib/use-api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CampaignSwitcher } from "@/components/canvass/campaign-switcher";

/**
 * Shared header for the campaign-scoped canvass sub-pages. Renders the standard breadcrumb trail
 * (Canvassing › <title>) in the standard top position, then a title row with the campaign switcher
 * INLINE beside the title, plus an optional actions slot. Replaces the old per-page "‹ Canvass" back
 * buttons and the layout's detached campaign `<select>` — one header, every sub-page. The switcher
 * swaps the `[campaignId]` path segment in place (URL is the source of truth). Campaigns are fetched
 * through the cached `useApi`, so navigating between sub-pages doesn't refetch the list.
 */
export function CampaignPageHeader({
  title,
  icon: Icon,
  description,
  actions,
}: {
  title: string;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useApi("/canvass/campaigns", () => listCampaigns(), { ttlMs: 30_000 });
  const campaigns = data ?? [];

  const switchTo = (id: string) => {
    if (!id || id === campaignId) return;
    // Same sub-page, other campaign; the query string is dropped deliberately (turfId etc.
    // belong to the campaign being left).
    router.push(pathname.replace(`/canvass/${campaignId}`, `/canvass/${id}`));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" /> : null}
            <h1 className="text-2xl font-extrabold">{title}</h1>
          </div>
          {campaigns.length > 0 ? (
            <CampaignSwitcher campaigns={campaigns} activeId={campaignId} onSelect={switchTo} />
          ) : null}
        </div>
        {/* Actions, then the breadcrumb trail pinned to the far right of the title line. */}
        <div className="flex flex-wrap items-center gap-3">
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          <Breadcrumbs
            className="ml-auto"
            items={[{ label: "Canvassing", href: "/canvass" }, { label: title }]}
          />
        </div>
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </>
  );
}
