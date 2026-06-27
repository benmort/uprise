"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleUser, DoorOpen } from "lucide-react";
import { getCanvassAssignments, type CanvassAssignment } from "@/lib/api";
import { getVolunteerId } from "@/lib/canvass/volunteer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { MapThumbnail } from "@/components/canvass/map-thumbnail";
import { FieldOnboarding } from "@/components/canvass/field-onboarding";
import { useOnlineStatus } from "@/hooks/use-online-status";

/** Outer ring [lng,lat][] from a GeoJSON Polygon/MultiPolygon for the thumbnail. */
function outerRing(geometry: unknown): Array<[number, number]> | undefined {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g.type !== "string") return undefined;
  if (g.type === "Polygon") return (g.coordinates as Array<Array<[number, number]>>)?.[0];
  if (g.type === "MultiPolygon")
    return (g.coordinates as Array<Array<Array<[number, number]>>>)?.[0]?.[0];
  return undefined;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [assignments, setAssignments] = useState<CanvassAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const volunteerId = getVolunteerId();
    if (!volunteerId) {
      setError("No volunteer identity on this device. Log in as a volunteer.");
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await getCanvassAssignments(volunteerId);
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setAssignments(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tally = useMemo(() => {
    const items = assignments.flatMap((a) => a.walkLists.flatMap((wl) => wl.items));
    const total = items.length;
    const done = items.filter((i) => i.status !== "PENDING").length;
    return { total, done, togo: total - done };
  }, [assignments]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) return <EmptyState title="Can't load assignments" description={error} />;

  return (
    <div className="space-y-4">
      <FieldOnboarding />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Today
          </p>
          <h1 className="text-2xl font-extrabold">Your turf</h1>
        </div>
        <Link
          href="/field/me"
          aria-label="Sync centre & profile"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-variant text-foreground"
        >
          <CircleUser className="h-6 w-6" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Doors" value={tally.total} />
        <KpiTile label="Done" value={tally.done} />
        <KpiTile label="To go" value={tally.togo} />
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          title="No turf assigned yet"
          description="An organiser needs to assign you a turf before you can start knocking."
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const items = a.walkLists.flatMap((wl) => wl.items);
            const stopCount = items.length;
            return (
              <div key={a.turfId} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <MapThumbnail polygon={outerRing(a.turf.geometry)} className="h-24 w-full" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 font-bold text-foreground">
                      <DoorOpen className="h-4 w-4 text-primary" />
                      {a.turf.name}
                    </h2>
                    <StatusBadge status={online ? "SYNCED" : "OFFLINE"} />
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {stopCount} doors · {a.walkLists.length} walk list
                    {a.walkLists.length === 1 ? "" : "s"}
                  </p>
                  <Button className="w-full" onClick={() => router.push(`/field/${a.turfId}`)}>
                    Start walking
                    <ArrowRight className="ml-1.5 h-4 w-4" />
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
