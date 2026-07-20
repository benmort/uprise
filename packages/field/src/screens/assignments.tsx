"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
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
import { getVolunteerId, getTenantBrand } from "../lib/volunteer";
import { reverseGeocode } from "../lib/geocode";
import { useMeDrawer } from "./me-drawer";
import { MapThumbnail } from "../components/map-thumbnail";
import { bboxRing } from "../lib/geo";
import { formatMinutes } from "../lib/walk-estimate";
import { useGeolocation } from "../hooks/use-geolocation";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useTurfDownload } from "../hooks/use-turf-download";

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
  const { openMe } = useMeDrawer();
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

  // Prefetch the walk view for the volunteer's turfs the moment assignments land, so
  // tapping a turf swaps in a warm route chunk instead of loading it on the spot.
  useEffect(() => {
    for (const asg of assignments.slice(0, 3)) {
      if (asg.turf?.id) router.prefetch(`/${asg.turf.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments.length]);
  const metrics = m.data ?? null;
  const loading = a.loading;
  const error = !volunteerId
    ? "No volunteer identity on this device. Log in as a volunteer."
    : a.error ?? "";
  // The campaign brand for the header — a landscape logo (falls back to the org name).
  const brand = getTenantBrand();

  // One-tap claim of a recommended turf, then straight into the walk view. Mirrors get-turf.
  const claimRecommended = async (campaignId: string, turfId: string) => {
    setClaiming(turfId);
    const res = await claimExistingTurf(campaignId, turfId);
    setClaiming(null);
    if (res.ok) router.push(`/${turfId}`);
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
          onClick={openMe}
          className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-4 font-semibold text-foreground"
        >
          <Menu className="h-5 w-5" />
          Menu
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-end">
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo is a runtime URL
            <img
              src={brand.logoUrl}
              alt={brand.name ? `${brand.name} logo` : "Organisation"}
              className="h-10 w-auto max-w-full object-contain"
            />
          ) : (
            <h1 className="truncate text-3xl font-extrabold leading-tight">{brand?.name || "My turf"}</h1>
          )}
        </div>
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
        <StatCard label="persuasion" value={metrics?.persuasionToday ?? 0} />
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
                  href={`/get-turf?campaignId=${recommended[0].campaignId}`}
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
                    <MapThumbnail
                      geometry={t.geometry}
                      polygon={bboxRing(t.bbox)}
                      className="h-14 w-14 shrink-0 rounded-xl"
                    />
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
            // The list payload is slim — per-list counts, not door items. The walk view
            // (one tap away) fetches the full turf and shows the real route + time.
            const onList = a.walkLists.reduce((n, wl) => n + wl.total, 0);
            const done = a.walkLists.reduce((n, wl) => n + (wl.total - wl.pending), 0);
            // Rough time left on the remaining (pending) doors from the turf's density estimate
            // (reachable doors/hour). Omitted until the turf is priced or when nothing's pending.
            const pending = onList - done;
            const dph = a.turf.doorsPerHour ?? 0;
            const remainingMin = dph > 0 && pending > 0 ? Math.round((pending / dph) * 60) : null;
            return (
              <div key={a.turfId} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
                {/* Per-turf offline state isn't known at this level — the real offline-download
                    control lives inside each turf's walk view (OfflineMapsControl). */}
                <div className="relative">
                  <MapThumbnail
                    geometry={a.turf.geometry}
                    polygon={bboxRing(a.turf.bbox)}
                    color={TURF_SWATCHES[i % TURF_SWATCHES.length]}
                    className="h-40 w-full"
                  />
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h2 className="text-xl font-extrabold text-foreground">{a.turf.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      {onList} on your walk list · {done} done
                      {remainingMin != null ? ` · ~${formatMinutes(remainingMin)} left` : ""}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      className="h-14 flex-1 gap-2 text-base"
                      onClick={() => router.push(`/${a.turfId}`)}
                    >
                      <PersonStanding className="h-5 w-5" />
                      Start walking
                    </Button>
                    <TurfDownloadButton turfId={a.turfId} geometry={a.turf.geometry} />
                  </div>
                </div>
              </div>
            );
          })}
          {assignments[0]?.turf.campaignId ? (
            <>
              {/* Only when the campaign allows volunteer self-serve — else the link dead-ends on
                  a get-turf page with nothing claimable. */}
              {assignments[0].turf.canSelfClaim ? (
                <Link href={`/get-turf?campaignId=${assignments[0].turf.campaignId}`} className="block">
                  <Button variant="outline" className="h-12 w-full text-base">
                    Get more turf
                  </Button>
                </Link>
              ) : null}
              {/* Only when the campaign actually has shifts to pick from. */}
              {assignments[0].turf.hasShifts ? (
                <Link href={`/shifts?campaignId=${assignments[0].turf.campaignId}`} className="block">
                  <Button variant="outline" className="h-12 w-full text-base">
                    Pick a shift
                  </Button>
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A determinate circular progress ring with the percent inside — the "downloading" face of
 *  the turf card's download button. */
function CircularProgress({ pct }: { pct: number }) {
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - clamped / 100);
  return (
    <span className="relative flex h-9 w-9 items-center justify-center text-primary">
      <svg viewBox="0 0 24 24" className="h-9 w-9 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.5} />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[9px] font-bold tabular-nums">{clamped}</span>
    </span>
  );
}

/**
 * The per-turf offline-download control on the My turf card. Shares the turf-download manager
 * with the walk-view control and the installed app's background auto-downloader, so it shows a
 * live circular indicator while downloading and a tick once the pack is saved locally — no
 * matter who started the download. Idle taps start the download in place (no navigation).
 */
function TurfDownloadButton({ turfId, geometry }: { turfId: string; geometry: unknown }) {
  const { available, status, done, total, start } = useTurfDownload(
    turfId,
    geometry as GeoJSON.Geometry | undefined,
  );
  if (!available) return null; // no Mapbox token — nothing to download

  if (status === "done") {
    return (
      <div
        aria-label="Saved for offline"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-success/40 text-success"
      >
        <Check className="h-6 w-6" />
      </div>
    );
  }

  if (status === "running") {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div
        aria-label={`Downloading maps ${pct}%`}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border"
      >
        {total > 0 ? <CircularProgress pct={pct} /> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
      </div>
    );
  }

  const failed = status === "error" || status === "incomplete";
  return (
    <button
      type="button"
      aria-label={failed ? "Retry offline download" : "Download for offline"}
      onClick={start}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${
        failed ? "border-error/50 text-error" : "border-border text-foreground"
      }`}
    >
      <Download className="h-5 w-5" />
    </button>
  );
}
