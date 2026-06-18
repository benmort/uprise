"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, DoorOpen, Plus, Target, TrendingUp, Users } from "lucide-react";
import { listTurfs, type TurfSummary } from "@/lib/api";
import {
  createCampaign,
  getCampaignSummary,
  listCampaigns,
  type CampaignKpis,
  type CampaignSummary,
} from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { MapThumbnail } from "@/components/canvass/map-thumbnail";
import { ProgressBar } from "@/components/canvass/progress-bar";
import { useToast } from "@/components/ui/toast";

/** Pull the outer ring ([lng,lat][]) out of a GeoJSON Polygon/MultiPolygon for the thumbnail. */
function outerRing(geometry: unknown): Array<[number, number]> | undefined {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g.type !== "string") return undefined;
  if (g.type === "Polygon") return (g.coordinates as Array<Array<[number, number]>>)?.[0];
  if (g.type === "MultiPolygon")
    return (g.coordinates as Array<Array<Array<[number, number]>>>)?.[0]?.[0];
  return undefined;
}

export default function CanvassPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [turfs, setTurfs] = useState<TurfSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Load the campaign list once, default to the first.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setCampaigns(res.data);
      setActiveId((cur) => cur || res.data[0]?.id || "");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load KPIs + turf for the active campaign.
  useEffect(() => {
    if (!activeId) {
      setKpis(null);
      setTurfs([]);
      return;
    }
    let alive = true;
    void (async () => {
      const [s, t] = await Promise.all([getCampaignSummary(activeId), listTurfs(activeId)]);
      if (!alive) return;
      if (s.ok) setKpis(s.data);
      if (t.ok) setTurfs(t.data);
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  const handleCreateCampaign = useCallback(async () => {
    const name = window.prompt("Name this campaign");
    if (!name?.trim()) return;
    setCreating(true);
    const res = await createCampaign({ name: name.trim() });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create campaign", description: res.error });
      return;
    }
    setCampaigns((cur) => [res.data, ...cur]);
    setActiveId(res.data.id);
    showToast({ tone: "success", title: "Campaign created", description: res.data.name });
  }, [showToast]);

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <EmptyState title="Can't load canvassing" description={error} />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="page-stack">
        <div>
          <h1 className="text-2xl font-extrabold">Canvassing</h1>
          <p className="text-sm text-muted-foreground">
            Create a campaign to start cutting turf and assigning canvassers.
          </p>
        </div>
        <EmptyState
          title="No campaigns yet"
          description="A campaign holds your turf, walk lists and goals."
          ctaLabel="New campaign"
          onCta={handleCreateCampaign}
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Canvassing</h1>
          <p className="text-sm text-muted-foreground">
            Cut turf, build walk lists and track the doors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="h-9 rounded-[11px] border border-border bg-white px-3 text-sm font-semibold text-foreground"
            aria-label="Campaign"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={handleCreateCampaign} disabled={creating}>
            <Plus className="mr-1.5 h-4 w-4" />
            New campaign
          </Button>
          {activeId ? (
            <Button asChild>
              <Link href={`/canvass/${activeId}/turf`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Cut new turf
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {activeId ? (
        <div id="tour-canvass-ops" className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/canvass/${activeId}/live`}>Live war-room</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/canvass/${activeId}/results`}>Results</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/canvass/${activeId}/goals`}>Goals</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/canvass/${activeId}/shifts`}>Shifts</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/canvass/${activeId}/qa`}>QA</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/canvass/canvassers">Canvassers</Link>
          </Button>
        </div>
      ) : null}

      <div id="tour-canvass-kpis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Doors today"
          value={kpis?.doorsToday ?? "—"}
          icon={<DoorOpen className="h-4 w-4" />}
        />
        <KpiTile
          label="Turf complete"
          value={kpis ? `${kpis.turfCompletePct}%` : "—"}
          icon={<Target className="h-4 w-4" />}
        />
        <KpiTile
          label="Contact rate"
          value={kpis ? `${kpis.contactRate}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiTile
          label="Canvassers out"
          value={kpis?.canvassersOut ?? "—"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {turfs.length === 0 ? (
        <EmptyState
          title="No turf in this campaign"
          description="Draw turf on the map, then build a walk list and assign a canvasser."
          ctaLabel={activeId ? "Cut new turf" : undefined}
          onCta={activeId ? () => router.push(`/canvass/${activeId}/turf`) : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {turfs.map((t) => {
            const pct =
              t.totalStops > 0 ? Math.round((t.visitedStops / t.totalStops) * 100) : 0;
            const status =
              t.totalStops > 0 && t.visitedStops >= t.totalStops
                ? "COMPLETED"
                : t.assignedTo
                  ? "IN_PROGRESS"
                  : "UNASSIGNED";
            return (
              <div key={t.id} className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                <MapThumbnail polygon={outerRing(t.geometry)} className="h-24 w-full" />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-foreground">{t.name}</h3>
                    {t.assignedTo ? (
                      <p className="text-xs text-muted-foreground">{t.assignedTo.name}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                  <Users className="h-3.5 w-3.5" />
                  {t.contactCount} doors · {t.walkListCount} walk list
                  {t.walkListCount === 1 ? "" : "s"}
                </p>
                <ProgressBar
                  className="mt-3"
                  value={t.visitedStops}
                  max={t.totalStops || 1}
                  label={
                    <>
                      <span>Knocked</span>
                      <span>
                        {t.visitedStops}/{t.totalStops} · {pct}%
                      </span>
                    </>
                  }
                />
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/canvass/${t.campaignId ?? activeId}/walklists?turfId=${t.id}`}>
                      Manage
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
