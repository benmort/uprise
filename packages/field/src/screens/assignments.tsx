"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleUser,
  Download,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  PersonStanding,
} from "lucide-react";
import { Button, EmptyState, Skeleton } from "@uprise/ui";
import { useAssignments, useRecommendedTurf, useVolunteerMetrics } from "../hooks/use-canvass";
import { claimExistingTurf } from "../api/canvass";
import { getVolunteerId, getVolunteerName } from "../lib/volunteer";
import { reverseGeocode } from "../lib/geocode";
import { MapThumbnail } from "../components/map-thumbnail";
import { estimateWalk, formatMinutes } from "../lib/walk-estimate";
import { useGeolocation } from "../hooks/use-geolocation";
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

/** Per-turf swatch — the map thumbnail's outline/tint, cycled by position (blue, purple, …). */
const TURF_SWATCHES = ["#2f5bd6", "#7c3aed", "#0e9488", "#b45309", "#dc2626", "#16a34a"];

/** A day-stat tile: big headline count, muted label beneath (the "My turf" header row). */
function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="text-3xl font-extrabold leading-none tabular-nums text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export function Assignments() {
  const router = useRouter();
  const online = useOnlineStatus();
  // Volunteer identity is device-local; read once. The shared cache means the
  // assignments/metrics payload is fetched once across every screen and served
  // instantly on revisit (revalidated in the background).
  const [volunteerId] = useState(() => getVolunteerId());
  const a = useAssignments(volunteerId ?? null);
  const m = useVolunteerMetrics(volunteerId ?? null);
  const rec = useRecommendedTurf(volunteerId ?? null);
  // Acquire the volunteer's position as soon as My turf loads (post-login) so turf
  // features can use it. Best-effort — a denial just leaves the chip in its retry state.
  const { fix, locating, capture: locate } = useGeolocation({ auto: true });
  // Reverse-geocode the fix to a human place ("46 Simmons Street, Newtown") so the chip tells the
  // volunteer where it thinks they are. Best-effort — falls back to "Location on" if it can't resolve.
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    if (!fix) {
      setPlace(null);
      return;
    }
    const ac = new AbortController();
    void reverseGeocode(fix.lat, fix.lng, ac.signal).then((p) => {
      if (!ac.signal.aborted) setPlace(p);
    });
    return () => ac.abort();
  }, [fix?.lat, fix?.lng]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const assignments = a.data ?? [];
  const metrics = m.data ?? null;
  const loading = a.loading;
  const error = !volunteerId
    ? "No volunteer identity on this device. Log in as a volunteer."
    : a.error ?? "";
  const name = getVolunteerName();

  // One-tap claim of a recommended turf, then straight into the walk view. Mirrors get-turf.
  const claimRecommended = async (campaignId: string, turfId: string) => {
    setClaiming(turfId);
    const res = await claimExistingTurf(campaignId, turfId);
    setClaiming(null);
    if (res.ok) router.push(`/field/${turfId}`);
  };

  const recommended = rec.data ?? [];

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

      {/* Location — acquired on entry so nearest-turf features can use the volunteer's position */}
      <div className="flex items-center gap-1.5 text-xs">
        {locating ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Finding your location…
          </span>
        ) : fix ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <LocateFixed className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
            <span className="truncate">
              {place ?? "Location on"}
              {fix.accuracy ? ` · ±${Math.round(fix.accuracy)} m` : ""}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void locate()}
            className="inline-flex items-center gap-1.5 font-semibold text-primary"
          >
            <MapPin className="h-3.5 w-3.5" />
            Enable location
          </button>
        )}
      </div>

      {/* Day tiles — today's headline count + label */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="doors today" value={metrics?.doorsToday ?? 0} />
        <StatCard label="conversations" value={metrics?.conversationsToday ?? 0} />
        <StatCard label="surveys" value={metrics?.surveysToday ?? 0} />
      </div>

      {assignments.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No turf assigned yet"
            description="An organiser can assign you a turf — or claim a recommended one below to start knocking."
          />
          {recommended.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-foreground">Recommended turf</h2>
                <Link
                  href={`/field/get-turf?campaignId=${recommended[0].campaignId}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary"
                >
                  See all turf
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-3">
                {recommended.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card"
                  >
                    <MapThumbnail polygon={outerRing(t.geometry)} className="h-14 w-14 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.campaignName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{t.contactCount} doors</p>
                    </div>
                    <Button
                      className="h-11 shrink-0"
                      disabled={claiming === t.id}
                      onClick={() => claimRecommended(t.campaignId, t.id)}
                    >
                      {claiming === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim"}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {assignments.map((a, i) => {
            const items = a.walkLists.flatMap((wl) => wl.items);
            const onList = items.length;
            const walkMin = estimateWalk(
              items.map((it) => {
                const c = it.contact as Record<string, unknown>;
                return { id: it.id, lat: Number(c.lat), lng: Number(c.lng) };
              }),
            ).minutes;
            return (
              <div key={a.turfId} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
                {/* Per-turf offline state isn't known at this level — the real offline-download
                    control lives inside each turf's walk view (OfflineMapsControl). */}
                <div className="relative">
                  <MapThumbnail
                    polygon={outerRing(a.turf.geometry)}
                    color={TURF_SWATCHES[i % TURF_SWATCHES.length]}
                    className="h-40 w-full"
                  />
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h2 className="text-xl font-extrabold text-foreground">{a.turf.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      {onList} on your walk list · ~{formatMinutes(walkMin)} walk
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
                      <Download className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {assignments[0]?.turf.campaignId ? (
            <Link href={`/field/get-turf?campaignId=${assignments[0].turf.campaignId}`} className="block">
              <Button variant="outline" className="h-12 w-full text-base">
                Get more turf
              </Button>
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
