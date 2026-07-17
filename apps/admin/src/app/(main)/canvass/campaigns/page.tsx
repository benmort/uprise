"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, DoorOpen, Layers, MapPinned } from "lucide-react";
import {
  getCampaignSummary,
  listCampaigns,
  type CampaignKpis,
  type CampaignSummary,
} from "@/lib/api/campaigns";
import { listTurfs, type TurfSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MapThumbnail } from "@uprise/field";
import { ProgressBar } from "@uprise/field";
import { CampaignNavCards } from "@uprise/field";
import { outerRing } from "@/lib/geometry";
import { CAMPAIGN_COLORS } from "@/components/canvass/campaigns-map";

// mapbox-gl touches window — keep the shared map out of SSR.
const CampaignsMap = dynamic(
  () => import("@/components/canvass/campaigns-map").then((m) => m.CampaignsMap),
  { ssr: false, loading: () => <Skeleton className="h-[340px] w-full rounded-2xl" /> },
);

type Loaded = { campaign: CampaignSummary; kpis: CampaignKpis | null; turfs: TurfSummary[] };

const THUMBS = 6;

export default function CampaignsIndexPage() {
  const [rows, setRows] = useState<Loaded[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      const loaded = await Promise.all(
        res.data.map(async (campaign) => {
          const [s, t] = await Promise.all([getCampaignSummary(campaign.id), listTurfs(campaign.id)]);
          return { campaign, kpis: s.ok ? s.data : null, turfs: t.ok ? t.data : [] };
        }),
      );
      if (alive) setRows(loaded);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/canvass">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Canvass
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">Every campaign, its claimed turf and where to go next.</p>
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Can't load campaigns" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign on the canvass overview to start cutting turf."
        />
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
              <MapPinned className="h-4 w-4 text-primary" />
              All campaigns
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Every campaign&apos;s claimed turf on one map — click a shape to open that campaign.
            </p>
            <CampaignsMap
              campaigns={rows.map(({ campaign, turfs }, idx) => ({
                id: campaign.id,
                name: campaign.name,
                color: CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length],
                geometries: turfs.map((t) => t.geometry).filter(Boolean) as GeoJSON.Geometry[],
              }))}
            />
          </section>
          {rows.map(({ campaign, kpis, turfs }, idx) => {
            const color = CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length];
            const doors = turfs.reduce((sum, t) => sum + t.contactCount, 0);
            const shown = turfs.slice(0, THUMBS);
            const more = turfs.length - shown.length;
            return (
              <section key={campaign.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    <h2 className="text-lg font-bold text-foreground">{campaign.name}</h2>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                    <Layers className="h-3.5 w-3.5" />
                    {campaign.turfCount} turf{campaign.turfCount === 1 ? "" : "s"}
                    <span className="text-border">·</span>
                    <DoorOpen className="h-3.5 w-3.5" />
                    {doors} door{doors === 1 ? "" : "s"}
                  </p>
                </div>

                {shown.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shown.map((t) => (
                      <div key={t.id} className="w-28">
                        <MapThumbnail polygon={outerRing(t.geometry)} className="h-16 w-full" />
                        <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground" title={t.name}>
                          {t.name}
                        </p>
                      </div>
                    ))}
                    {more > 0 ? (
                      <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground">
                        +{more} more
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No turf cut yet.</p>
                )}

                {kpis ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <ProgressBar
                      value={kpis.knockedStops}
                      max={kpis.totalStops || 1}
                      label={
                        <>
                          <span>Knocked</span>
                          <span className="tabular-nums">
                            {kpis.knockedStops}/{kpis.totalStops} · {kpis.turfCompletePct}%
                          </span>
                        </>
                      }
                    />
                    <p className="text-sm text-muted-foreground tabular-nums sm:text-right">
                      {kpis.contactRate}% contact rate
                    </p>
                  </div>
                ) : null}

                <CampaignNavCards campaignId={campaign.id} className="mt-4" />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
