"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Check, DoorOpen, DownloadCloud, Loader2 } from "lucide-react";
import { getCanvassAssignments, type CanvassAssignment } from "@/lib/api";
import { getCanvasserId } from "@/lib/canvass/canvasser";
import { optimiseRoute, type Stop } from "@/lib/canvass/route";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useTilePreCache } from "@/hooks/use-tile-pre-cache";
import { WalkStopCard, type WalkStop } from "@/components/canvass/walk-stop-card";
import { WalkModeToggle, type WalkMode } from "@/components/canvass/walk-mode-toggle";
import { ProgressBar } from "@/components/canvass/progress-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Map is heavy + touches window: keep it out of the offline list-mode bundle.
const TurfMap = dynamic(() => import("@/components/canvass/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type FullStop = WalkStop & { lat: number; lng: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number.NaN;
}

export default function WalkViewPage() {
  const router = useRouter();
  const { turfId } = useParams<{ turfId: string }>();
  const [mode, setMode] = useLocalStorage<WalkMode>("yarns.walkMode", "list");
  const [assignment, setAssignment] = useState<CanvassAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const { fix, capture } = useGeolocation();

  useEffect(() => {
    const canvasserId = getCanvasserId();
    if (!canvasserId) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await getCanvassAssignments(canvasserId);
      if (!alive) return;
      if (res.ok) setAssignment(res.data.find((a) => a.turfId === turfId) ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [turfId]);

  // Locate the canvasser once when the map opens (battery: not a continuous watch).
  useEffect(() => {
    if (mode === "map") void capture();
  }, [mode, capture]);

  const stops = useMemo<FullStop[]>(() => {
    if (!assignment) return [];
    const items = assignment.walkLists.flatMap((wl) => wl.items);
    const mapped = items.map((it) => {
      const c = it.contact as Record<string, unknown>;
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || (c.fullName as string) || null;
      return {
        id: it.id,
        contactId: it.contact.id as string,
        orderIndex: it.orderIndex,
        status: it.status,
        name,
        address: (c.address as string) ?? null,
        lat: num(c.lat),
        lng: num(c.lng),
      } satisfies FullStop;
    });
    const ordered = optimiseRoute(mapped as Stop[]) as unknown as FullStop[];
    return ordered.map((s, i) => ({ ...s, orderIndex: i }));
  }, [assignment]);

  const nextStop = stops.find((s) => s.status === "PENDING");
  const doneCount = stops.filter((s) => s.status !== "PENDING").length;

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!assignment) return <EmptyState title="Turf not found" description="This turf isn't assigned to you." />;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{assignment.turf.name}</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {doneCount} of {stops.length} stops done
          </p>
        </div>
        <WalkModeToggle value={mode} onChange={setMode} />
      </div>

      <ProgressBar value={doneCount} max={stops.length || 1} />

      <OfflineMapsControl
        turfId={turfId}
        geometry={assignment.turf.geometry as GeoJSON.Geometry}
      />

      {mode === "map" ? (
        <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-xl border border-border">
          <TurfMap
            mode="view"
            stops={stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, status: s.status }))}
            turfGeometry={assignment.turf.geometry as GeoJSON.Geometry}
            activeStopId={nextStop?.id}
            userPosition={fix ? { lat: fix.lat, lng: fix.lng } : null}
            onStopTap={(id) => router.push(`/field/${turfId}/door/${id}`)}
          />
          {nextStop ? (
            <div className="absolute inset-x-3 bottom-3 animate-pop-in rounded-2xl border border-border bg-white p-3 shadow-float">
              <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                Next stop
              </p>
              <p className="truncate font-semibold text-foreground">{nextStop.name || "Resident"}</p>
              {nextStop.address ? (
                <p className="truncate text-xs text-muted-foreground">{nextStop.address}</p>
              ) : null}
              <Button
                className="mt-2 w-full"
                onClick={() => router.push(`/field/${turfId}/door/${nextStop.id}`)}
              >
                <DoorOpen className="mr-1.5 h-4 w-4" />
                Knock — next stop
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {nextStop ? (
            <Button
              className="h-12 w-full text-base"
              onClick={() => router.push(`/field/${turfId}/door/${nextStop.id}`)}
            >
              <DoorOpen className="mr-1.5 h-4 w-4" />
              Knock — next stop · {nextStop.name || "Resident"}
            </Button>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 p-4 text-center text-sm text-muted-foreground">
              All stops done. Nice work.
            </div>
          )}
          <div className="space-y-2">
            {stops.map((s) => (
              <div key={s.id} className={cn(s.status !== "PENDING" && "opacity-60")}>
                <WalkStopCard
                  stop={s}
                  isNext={s.id === nextStop?.id}
                  onOpen={() => router.push(`/field/${turfId}/door/${s.id}`)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Download maps for offline" — pre-caches the turf's tiles so the map renders
 *  with no signal. Hidden when no Mapbox token is configured. */
function OfflineMapsControl({
  turfId,
  geometry,
}: {
  turfId: string;
  geometry: GeoJSON.Geometry;
}) {
  const { available, status, done, total, capped, start, cancel } = useTilePreCache(turfId, geometry);
  if (!available) return null;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (status === "done") {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <Check className="h-3.5 w-3.5" />
        Maps saved for offline
      </p>
    );
  }

  if (status === "running") {
    return (
      <div className="space-y-1.5 rounded-xl border border-border bg-surface/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving maps for offline… {pct}%
          </span>
          <button type="button" className="underline text-muted-foreground" onClick={cancel}>
            Cancel
          </button>
        </div>
        <ProgressBar value={done} max={total || 1} />
        <p className="tabular-nums text-[11px] text-muted-foreground">
          {done} of {total} tiles{capped ? " (capped — large turf)" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" className="h-9 gap-1.5 text-sm" onClick={start}>
        <DownloadCloud className="h-4 w-4" />
        Download maps for offline
      </Button>
      {status === "error" ? (
        <span className="text-xs text-error">Download failed — retry</span>
      ) : status === "cancelled" ? (
        <span className="text-xs text-muted-foreground">Download cancelled</span>
      ) : null}
    </div>
  );
}
