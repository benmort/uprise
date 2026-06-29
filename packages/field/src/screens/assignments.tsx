"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleUser, DownloadCloud, Menu, PersonStanding } from "lucide-react";
import { Button, EmptyState, Skeleton, cn } from "@uprise/ui";
import {
  getCanvassAssignments,
  getVolunteerMetrics,
  type CanvassAssignment,
  type VolunteerMetrics,
} from "../api";
import { getVolunteerId, getVolunteerName } from "../lib/volunteer";
import { KpiTile } from "../components/kpi-tile";
import { MapThumbnail } from "../components/map-thumbnail";
import { useOnlineStatus } from "../hooks/use-online-status";

/** Outer ring [lng,lat][] from a GeoJSON Polygon/MultiPolygon for the thumbnail. */
function outerRing(geometry: unknown): Array<[number, number]> | undefined {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g.type !== "string") return undefined;
  if (g.type === "Polygon") return (g.coordinates as Array<Array<[number, number]>>)?.[0];
  if (g.type === "MultiPolygon")
    return (g.coordinates as Array<Array<Array<[number, number]>>>)?.[0]?.[0];
  return undefined;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Assignments() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [assignments, setAssignments] = useState<CanvassAssignment[]>([]);
  const [metrics, setMetrics] = useState<VolunteerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const name = getVolunteerName();

  useEffect(() => {
    const volunteerId = getVolunteerId();
    if (!volunteerId) {
      setError("No volunteer identity on this device. Log in as a volunteer.");
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const [aRes, mRes] = await Promise.all([
        getCanvassAssignments(volunteerId),
        getVolunteerMetrics(volunteerId),
      ]);
      if (!alive) return;
      if (!aRes.ok) setError(aRes.error);
      else setAssignments(aRes.data);
      if (mRes.ok) setMetrics(mRes.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Today's tile values with the all-time total as the muted secondary line.
  const allTime = (n: number) => ({ value: `${n.toLocaleString()} all-time`, direction: "flat" as const });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error) return <EmptyState title="Can't load assignments" description={error} />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => router.push("/field/me")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight">My turf</h1>
        </div>
        <Link
          href="/field/me"
          aria-label="Profile"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <CircleUser className="h-6 w-6" />
        </Link>
      </div>

      {/* Day tiles — today's value big, all-time total beneath */}
      <div className="grid grid-cols-3 gap-2.5">
        <KpiTile
          label="doors today"
          value={metrics?.doorsToday ?? 0}
          delta={metrics ? allTime(metrics.doorsTotal) : undefined}
        />
        <KpiTile
          label="conversations"
          value={metrics?.conversationsToday ?? 0}
          delta={metrics ? allTime(metrics.conversationsTotal) : undefined}
        />
        <KpiTile
          label="surveys"
          value={metrics?.surveysToday ?? 0}
          delta={metrics ? allTime(metrics.surveysTotal) : undefined}
        />
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          title="No turf assigned yet"
          description="An organiser needs to assign you a turf before you can start knocking."
        />
      ) : (
        <div className="space-y-5">
          {assignments.map((a, i) => {
            const items = a.walkLists.flatMap((wl) => wl.items);
            const onList = items.length;
            const synced = online && i === 0; // per-turf offline-cache state lands later
            return (
              <div key={a.turfId} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
                <div className="relative">
                  <MapThumbnail polygon={outerRing(a.turf.geometry)} className="h-40 w-full" />
                  <span
                    className={cn(
                      "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-bold shadow-card",
                      synced ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning-foreground))]",
                    )}
                  >
                    {synced ? <Check className="h-4 w-4" /> : <DownloadCloud className="h-4 w-4" />}
                    {synced ? "Synced" : "Download"}
                  </span>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h2 className="text-xl font-extrabold text-foreground">{a.turf.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      {onList} doors · {onList} on your walk list
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      className="h-14 flex-1 gap-2 text-base"
                      onClick={() => router.push(`/field/${a.turfId}`)}
                    >
                      <PersonStanding className="h-5 w-5" />
                      Start walking
                    </Button>
                    <button
                      type="button"
                      aria-label="Download for offline"
                      onClick={() => router.push(`/field/${a.turfId}`)}
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
                    >
                      <DownloadCloud className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
