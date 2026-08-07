"use client";

import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { listCampaigns } from "@/lib/api/campaigns";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/shell/page-header";
import { CampaignSwitcher } from "@/components/canvass/campaign-switcher";

/**
 * Shared header for the campaign-scoped canvass sub-pages: the unified `PageHeader`
 * with the campaign switcher in the `titleAccessory` slot and a `Canvassing › <title>`
 * trail. The switcher swaps the `[campaignId]` path segment in place (URL is the source
 * of truth); campaigns come through the cached `useApi`, so navigating between sub-pages
 * doesn't refetch the list.
 */
export function CampaignPageHeader({
  title,
  icon,
  description,
  actions,
  allowAllCampaigns = true,
}: {
  title: string;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  /** Show the "All campaigns" option — it routes to the campaign-less variant of THIS page
   *  (e.g. /canvass/{id}/results → /canvass/results). Set false on inherently per-campaign
   *  pages (turf, goals) where an aggregate view has no meaning. */
  allowAllCampaigns?: boolean;
}) {
  // Undefined on the campaign-less aggregate routes (/canvass/results, …) — that absence is
  // how we detect "All campaigns" mode; defined on the [campaignId] scoped routes.
  const { campaignId } = useParams<{ campaignId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useApi("/canvass/campaigns", () => listCampaigns(), { ttlMs: 30_000 });
  const campaigns = data ?? [];

  // The sub-page path after the campaign scope — "/results", "/walklists", …. Preserved across
  // a scope change so switching campaign (or to "All campaigns") keeps you on the same page.
  // The query string is dropped deliberately (turfId etc. belong to the campaign being left).
  const subPath = campaignId
    ? pathname.split(`/canvass/${campaignId}`)[1] ?? ""
    : pathname.replace(/^\/canvass/, "");

  const switchTo = (id: string) => {
    if (!id || id === campaignId) return;
    router.push(`/canvass/${id}${subPath}`);
  };

  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      actions={actions}
      breadcrumbs={[{ label: "Canvassing", href: "/canvass" }, { label: title }]}
      titleAccessory={
        campaigns.length > 0 ? (
          <CampaignSwitcher
            campaigns={campaigns}
            activeId={campaignId ?? ""}
            allActive={!campaignId}
            onSelect={switchTo}
            onSelectAll={allowAllCampaigns ? () => router.push(`/canvass${subPath}`) : undefined}
          />
        ) : null
      }
    />
  );
}
