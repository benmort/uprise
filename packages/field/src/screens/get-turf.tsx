"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, MapPin, PencilLine, Squircle } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@uprise/ui";
import { getSelfServeAvailable, claimExistingTurf, type SelfServeAvailable } from "../api";
import { MapThumbnail } from "../components/map-thumbnail";

const TurfMap = dynamic(() => import("../components/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});

function outerRing(geometry: unknown): Array<[number, number]> | undefined {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g.type !== "string") return undefined;
  if (g.type === "Polygon") return (g.coordinates as Array<Array<[number, number]>>)?.[0];
  if (g.type === "MultiPolygon") return (g.coordinates as Array<Array<Array<[number, number]>>>)?.[0]?.[0];
  return undefined;
}

/**
 * "Get turf" — volunteer self-serve, gated by the campaign's `volunteerCanSelfClaimTurf`.
 * Mode C (claim a ready-made unassigned turf) is the fully in-app path; modes A (claim
 * unclaimed areas) and B (draw your own) need a draw-capable map — their claim endpoints
 * are live, so they're surfaced but pointed at the desktop tool until the field map gains
 * drawing. `?campaignId=` scopes the screen.
 */
export function GetTurf() {
  const router = useRouter();
  const params = useSearchParams();
  const campaignId = params.get("campaignId") ?? "";
  const [data, setData] = useState<SelfServeAvailable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setLoading(false);
      setError("No campaign selected.");
      return;
    }
    let alive = true;
    void (async () => {
      const res = await getSelfServeAvailable(campaignId);
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const claimReady = async (turfId: string) => {
    setClaiming(turfId);
    const res = await claimExistingTurf(campaignId, turfId);
    setClaiming(null);
    if (res.ok) router.push(`/field/${turfId}`);
    else setError(res.error);
  };

  const modes = useMemo(() => new Set(data?.modes ?? []), [data]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error && !data) {
    return (
      <EmptyState
        title="Can't get turf"
        description={error === "No campaign selected." ? "Open this from a campaign link." : error}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Pinned header + boundary map — only the turf list below scrolls. */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/field")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-extrabold">Get turf</h1>
        </div>

        {data?.boundary ? (
          <div className="h-40 overflow-hidden rounded-xl border border-border">
            <TurfMap mode="edit" turfGeometry={data.boundary as GeoJSON.Geometry} stops={[]} />
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* Mode C — ready-made turf */}
      {modes.has("existing") ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">Claim a ready turf</h2>
          {data && data.readyTurfs.length > 0 ? (
            <div className="space-y-2">
              {data.readyTurfs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                  <MapThumbnail polygon={outerRing(t.geometry)} className="h-12 w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.contactCount} doors</p>
                  </div>
                  <Button className="h-9 shrink-0" disabled={claiming === t.id} onClick={() => claimReady(t.id)}>
                    {claiming === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No ready-made turf available right now.
            </p>
          )}
        </section>
      ) : null}

      {/* Modes A + B — need a draw-capable map (desktop for now) */}
      {(modes.has("area") || modes.has("draw")) && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">Carve your own</h2>
          <div className="space-y-2">
            {modes.has("area") ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
                <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-sm text-muted-foreground">
                  Claim unclaimed areas within the campaign — pick meshblocks on a bigger screen for now.
                </p>
                <Squircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ) : null}
            {modes.has("draw") ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
                <PencilLine className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-sm text-muted-foreground">
                  Draw your own turf within the campaign boundary — available from a desktop for now.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
