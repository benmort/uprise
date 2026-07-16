"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronUp, Clock, DownloadCloud, Home, Loader2, Navigation, Route } from "lucide-react";
import { Button, EmptyState, Skeleton, cn, useToast } from "@uprise/ui";
import { getWalkRoute, type CanvassAssignment, type WalkRoute } from "../api";
import { useAssignments } from "../hooks/use-canvass";
import { getVolunteerId } from "../lib/volunteer";
import { optimiseRoute, type Stop } from "../lib/route";
import { estimateWalk, formatMinutes, trimToBudget } from "../lib/walk-estimate";
import { formatDistance, type LatLng } from "../lib/directions";
import { useLocalStorage } from "../hooks/use-local-storage";
import { useGeolocation } from "../hooks/use-geolocation";
import { useTilePreCache } from "../hooks/use-tile-pre-cache";
import { useWalkingDirections } from "../hooks/use-walking-directions";
import { WalkStopCard, type WalkStop } from "../components/walk-stop-card";
import { WalkModeToggle, type WalkMode } from "../components/walk-mode-toggle";
import { ProgressBar } from "../components/progress-bar";

// Map is heavy + touches window: keep it out of the offline list-mode bundle.
const TurfMap = dynamic(() => import("../components/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type FullStop = WalkStop & { lat: number; lng: number; gnafPid: string | null };

// The List lazy-loads: an initial batch, then reveal-on-scroll (a turf can hold thousands
// of doors, so mounting every card up front is slow on a phone). View-only — the full route
// still drives the next-stop, progress, map and walk-budget.
const STOPS_PAGE = 25;

function num(v: unknown): number {
  return typeof v === "number" ? v : Number.NaN;
}

/**
 * Walk view — the working screen. List⇄Map toggle (list is the low-power default).
 * `readOnly` renders the organiser preview embedded in apps/admin: same map + route,
 * but no door navigation or offline-download controls.
 */
export function WalkView({
  turfId,
  readOnly = false,
  assignment: assignmentProp,
  sampleUserPosition,
  routeGeometry: routeGeometryProp,
}: {
  turfId: string;
  readOnly?: boolean;
  /** Pre-loaded assignment (organiser preview in apps/admin). When given, the
   *  screen skips the volunteer-scoped fetch and just renders it read-only. */
  assignment?: CanvassAssignment | null;
  /** Preview-only "you are here" dot when there's no live GPS (the organiser preview
   *  never captures GPS). Ignored once a real `fix` is available. */
  sampleUserPosition?: LatLng | null;
  /** Override the walking-route line drawn on the map. The organiser preview passes a
   *  walk-order LineString through all stops here, because the live turn-by-turn fetch
   *  is only origin→next-stop and needs a connection. Falls back to the live directions. */
  routeGeometry?: GeoJSON.LineString | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useLocalStorage<WalkMode>("uprise.walkMode", "list");
  const [showSteps, setShowSteps] = useState(false);
  const { fix, capture } = useGeolocation();
  // The applied "start from here" origin — persisted per turf so an accepted re-order
  // survives visiting a door and coming back. When set, the route optimises from it.
  const [startFix, setStartFix] = useLocalStorage<{ lat: number; lng: number } | null>(
    `uprise.walkStart.${turfId}`,
    null,
  );
  const [checking, setChecking] = useState(false);
  // The server's Mapbox-ordered route (real walking distances + footpath geometry), ordered from
  // `startFix` when set. Null until it loads / when offline — the client optimiser is the fallback.
  const [serverRoute, setServerRoute] = useState<WalkRoute | null>(null);
  const [routing, setRouting] = useState(false);

  // Organiser preview (apps/admin) supplies the assignment directly; the volunteer app
  // reads it from the SHARED assignments cache — so arriving from the dashboard is
  // instant (no refetch), the turf just being found in the already-cached list.
  const isPreview = assignmentProp !== undefined;
  const [volunteerId] = useState(() => (isPreview ? null : getVolunteerId()));
  const a = useAssignments(isPreview ? null : volunteerId);
  const assignment: CanvassAssignment | null = isPreview
    ? assignmentProp ?? null
    : a.data?.find((x) => x.turfId === turfId) ?? null;
  const loading = isPreview ? false : a.loading;

  // Locate the volunteer once when the map opens (battery: not a continuous watch).
  useEffect(() => {
    if (mode === "map" && !readOnly) void capture();
  }, [mode, capture, readOnly]);

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
        gnafPid: (c.gnafPid as string) ?? null,
        lat: num(c.lat),
        lng: num(c.lng),
      } satisfies FullStop;
    });
    // Prefer the server's Mapbox-ordered route (matched by contactId); fall back to the client
    // crow-flies optimiser offline or before it loads. Field stays offline-first either way.
    if (serverRoute && serverRoute.ordered.length > 0) {
      const rank = new Map(serverRoute.ordered.map((cid, i) => [cid, i]));
      const sorted = [...mapped].sort(
        (a, b) =>
          (rank.get(a.contactId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.contactId) ?? Number.MAX_SAFE_INTEGER),
      );
      return sorted.map((s, i) => ({ ...s, orderIndex: i }));
    }
    const ordered = optimiseRoute(mapped as Stop[], startFix ?? undefined) as unknown as FullStop[];
    return ordered.map((s, i) => ({ ...s, orderIndex: i }));
  }, [assignment, startFix, serverRoute]);

  const nextStop = stops.find((s) => s.status === "PENDING");
  const doneCount = stops.filter((s) => s.status !== "PENDING").length;

  // Walk-time estimate for the turf + an optional "how long can you walk" budget that
  // trims the pending stops to those that fit (client-side view trim, offline).
  const walk = useMemo(() => estimateWalk(stops as Stop[]), [stops]);
  const pending = useMemo(() => stops.filter((s) => s.status === "PENDING"), [stops]);
  const [budgetMin, setBudgetMin] = useState<number | "">("");

  // Lazy-load window for the List. Reveal more as the sentinel scrolls into view; reset when the
  // route changes (a turf/assignment switch rebuilds `stops`, so collapse back to the first batch).
  const [visibleCount, setVisibleCount] = useState(STOPS_PAGE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setVisibleCount(STOPS_PAGE);
  }, [stops.length]);
  useEffect(() => {
    if (mode === "map" || visibleCount >= stops.length) return;
    const el = loadMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((n) => Math.min(n + STOPS_PAGE, stops.length));
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mode, stops.length, visibleCount]);

  const fitIds = useMemo(() => {
    if (typeof budgetMin !== "number" || budgetMin <= 0) return null;
    const { fit } = trimToBudget(pending as Stop[], budgetMin, fix ? { start: { lat: fix.lat, lng: fix.lng } } : {});
    return new Set(fit.map((s) => s.id));
  }, [budgetMin, pending, fix]);

  // Walking turn-by-turn directions to the next stop. Origin is the canvasser's
  // live GPS; in the organiser preview (no GPS) we fall back to the first stop so
  // the same route line + steps still render. Network-only (offline → no route).
  const finite = (p: LatLng | null): LatLng | null =>
    p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  const origin =
    finite(fix ? { lat: fix.lat, lng: fix.lng } : null) ??
    (readOnly && stops[0] ? finite({ lat: stops[0].lat, lng: stops[0].lng }) : null);
  const dest = nextStop ? finite({ lat: nextStop.lat, lng: nextStop.lng }) : null;
  const { directions, online: directionsOnline } = useWalkingDirections(origin, dest, mode === "map");

  // Live GPS wins; else the preview's sample position (organiser preview has no GPS). The map
  // route is the caller override (preview walk-order line) if given, else the live directions.
  const userPosition = fix ? { lat: fix.lat, lng: fix.lng } : (sampleUserPosition ?? null);
  const mapRoute = routeGeometryProp ?? serverRoute?.geometry ?? directions?.geometry ?? null;

  const openDoor = (id: string) => {
    if (readOnly) return;
    router.push(`/field/${turfId}/door/${id}`);
  };

  // Fetch the server's Mapbox walk route (ordered from `startFix` when set). Online-only — a
  // failure/offline just leaves the client crow-flies fallback in place. Not run in the organiser
  // preview (no volunteer / it's fed a route line directly).
  useEffect(() => {
    if (readOnly || isPreview || !assignment || !volunteerId) return;
    let cancelled = false;
    setRouting(true);
    void getWalkRoute(turfId, volunteerId, startFix ?? undefined).then((res) => {
      if (cancelled) return;
      setRouting(false);
      if (res.ok) setServerRoute(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [turfId, volunteerId, startFix, assignment, readOnly, isPreview]);

  // "Start from my location" — capture GPS once and pin it as the route origin. The fetch effect
  // above then re-orders the list + line + totals in place from where the volunteer is standing.
  const useMyLocation = useCallback(async () => {
    if (readOnly) return;
    setChecking(true);
    const gps = await capture();
    setChecking(false);
    if (!gps) {
      showToast({ tone: "error", title: "Couldn't get your location", description: "Enable location to re-route from here." });
      return;
    }
    setStartFix({ lat: gps.lat, lng: gps.lng });
  }, [readOnly, capture, showToast, setStartFix]);

  // A just-claimed turf (or one whose walk list the server is still building) isn't in the
  // cached assignments payload yet — and a <30s-old cache won't auto-revalidate. Rather than
  // flash "Turf not found", force a refetch and poll for a short grace window, showing a
  // loading state meanwhile. `settled` flips true once the turf appears or the window elapses,
  // so a genuine miss still reaches the empty state.
  const hasAssignment = !isPreview && Boolean(assignment);
  const refetchAssignments = a.refetch;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (isPreview || hasAssignment) {
      setSettled(true);
      return;
    }
    setSettled(false);
    let tries = 0;
    void refetchAssignments();
    const id = setInterval(() => {
      tries += 1;
      if (tries >= 12) {
        setSettled(true);
        clearInterval(id);
        return;
      }
      void refetchAssignments();
    }, 2000);
    return () => clearInterval(id);
  }, [isPreview, hasAssignment, turfId, refetchAssignments]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!assignment) {
    if (!settled) {
      return (
        <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="font-bold text-foreground">Getting your turf ready…</p>
            <p className="text-sm text-muted-foreground">
              Setting up your walk list — this can take a moment after claiming.
            </p>
          </div>
        </div>
      );
    }
    return <EmptyState title="Turf not found" description="This turf isn't assigned to you." />;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        {!readOnly ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/field")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground">{assignment.turf.name}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {doneCount} of {stops.length} stops done
          </p>
        </div>
        <WalkModeToggle value={mode} onChange={setMode} />
      </div>

      <ProgressBar value={doneCount} max={stops.length || 1} tone="success" />

      {!readOnly ? (
        <OfflineMapsControl turfId={turfId} geometry={assignment.turf.geometry as GeoJSON.Geometry} />
      ) : null}

      {!readOnly && stops.length >= 2 ? (
        <button
          type="button"
          onClick={() => void useMyLocation()}
          disabled={checking || routing}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
        >
          {checking || routing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4 text-primary" />
          )}
          {checking
            ? "Getting your location…"
            : routing
              ? "Optimising from your location…"
              : startFix
                ? "Re-optimise from my location"
                : "Start from my location"}
        </button>
      ) : null}

      {mode === "map" ? (
        <div
          className="relative flex-1 overflow-hidden rounded-xl border border-border"
          // Inline min-height (not a Tailwind arbitrary class): the height must not depend on
          // admin's Tailwind build generating a field-only utility, which it didn't — the
          // container collapsed to 0 and the map stayed blank. `absolute inset-0` below then
          // gives mapbox a definite height to size its `height:100%` canvas against.
          style={{ minHeight: "60vh" }}
        >
          <div className="absolute inset-0">
            <TurfMap
              mode="view"
              stops={stops.map((s) => ({
                id: s.id,
                lat: s.lat,
                lng: s.lng,
                status: s.status,
                gnafPid: s.gnafPid,
                address: s.address,
                contactId: s.contactId,
                contactName: s.name,
              }))}
              turfGeometry={assignment.turf.geometry as GeoJSON.Geometry}
              activeStopId={nextStop?.id}
              userPosition={userPosition}
              // Tap a door → info popover. Live app: its "Knock at this door" button runs
              // openDoor (the knock flow, now fronted by the bubble). Read-only preview:
              // no knock, a "View full detail" link to the admin address page instead.
              onStopTap={readOnly ? undefined : (id) => openDoor(id)}
              stopPopup
              buildDetailHref={readOnly ? (pid) => `/data/addresses/${encodeURIComponent(pid)}` : undefined}
              routeGeometry={mapRoute}
            />
          </div>
          {nextStop ? (
            <div className="absolute inset-x-3 bottom-3 animate-pop-in rounded-2xl border border-border bg-surface p-4 shadow-float">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[hsl(var(--success))]">
                <Route className="h-3.5 w-3.5" />
                Next stop{directions ? ` · ${formatDistance(directions.distanceM)} away` : ""}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {/* Address first — cold doors have no contact, so the address is the identifier. */}
                  <p className="truncate font-bold text-foreground">{nextStop.address || "No address"}</p>
                  <p className="truncate text-sm text-muted-foreground">{nextStop.name || "Resident"}</p>
                </div>
                {!readOnly ? (
                  <Button className="h-11 shrink-0 gap-2 px-5 text-base" onClick={() => openDoor(nextStop.id)}>
                    <Home className="h-5 w-5" />
                    Knock
                  </Button>
                ) : null}
              </div>

              {directions && directions.steps.length > 0 ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowSteps((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg bg-surface-variant px-2.5 py-1.5 text-xs font-semibold text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <Navigation className="h-3.5 w-3.5 text-primary" />
                      Walking directions
                    </span>
                    {showSteps ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                  {showSteps ? (
                    <ol className="mt-1.5 max-h-32 space-y-1 overflow-auto pr-1 text-xs text-muted-foreground">
                      {directions.steps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="shrink-0 tabular-nums text-foreground">{i + 1}.</span>
                          <span className="flex-1">{s.instruction}</span>
                          {s.distanceM > 0 ? (
                            <span className="shrink-0 tabular-nums">{formatDistance(s.distanceM)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : !directionsOnline ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Directions need a connection — pins and the address work offline.
                </p>
              ) : null}
              {directions ? (
                <p className="mt-2 text-[10px] text-muted-foreground">Directions © Mapbox © OpenStreetMap</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <Route className="h-4 w-4" />
              {serverRoute && serverRoute.totalM > 0
                ? `${formatDistance(serverRoute.totalM)} · ${formatMinutes(
                    Math.max(1, Math.round(serverRoute.totalS / 60)),
                  )} walk${serverRoute.source === "crowflies" ? " (estimated)" : ""}`
                : "Route-optimised · shortest path"}
            </p>
            {serverRoute?.source === "directions" ? (
              <p className="mt-1 text-[10px] text-muted-foreground">Walking route © Mapbox © OpenStreetMap</p>
            ) : null}
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 p-2.5 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">I can walk for</span>
              <input
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value ? Number(e.target.value) : "")}
                placeholder={String(walk.minutes)}
                className="w-16 rounded-md border border-border bg-transparent px-2 py-1 tabular-nums text-foreground"
              />
              <span className="text-muted-foreground">min</span>
              {fitIds ? (
                <button
                  type="button"
                  onClick={() => setBudgetMin("")}
                  className="ml-auto text-xs font-semibold text-primary"
                >
                  {fitIds.size} of {pending.length} fit — clear
                </button>
              ) : null}
            </div>
          ) : null}
          {!nextStop ? (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 p-4 text-center text-sm text-muted-foreground">
              All stops done. Nice work.
            </div>
          ) : null}
          <div className="space-y-3">
            {stops.slice(0, visibleCount).map((s) => {
              const beyond = fitIds !== null && s.status === "PENDING" && !fitIds.has(s.id);
              return (
                <div key={s.id} className={cn(beyond && "opacity-40")}>
                  <WalkStopCard stop={s} isNext={s.id === nextStop?.id} onOpen={() => openDoor(s.id)} />
                </div>
              );
            })}
          </div>
          {visibleCount < stops.length ? (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center gap-2 py-3 text-xs font-medium text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading more stops… ({visibleCount} of {stops.length})
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** "Download maps for offline" — pre-caches the turf's tiles so the map renders
 *  with no signal. Hidden when no Mapbox token is configured. */
function OfflineMapsControl({ turfId, geometry }: { turfId: string; geometry: GeoJSON.Geometry }) {
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
        {status === "incomplete" ? "Retry offline download" : "Download maps for offline"}
      </Button>
      {status === "error" ? (
        <span className="text-xs text-error">Download failed — retry</span>
      ) : status === "incomplete" ? (
        <span className="text-xs text-error">Some tiles didn&apos;t save — retry before going offline</span>
      ) : status === "cancelled" ? (
        <span className="text-xs text-muted-foreground">Download cancelled</span>
      ) : null}
    </div>
  );
}
