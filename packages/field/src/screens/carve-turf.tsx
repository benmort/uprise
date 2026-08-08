"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, MapPin, PencilLine, Trash2, Undo2 } from "lucide-react";
import { Button, EmptyState, Skeleton, cn, useLocalStorage, useToast } from "@uprise/ui";
import {
  claimArea,
  claimDraw,
  getSelfServeClaimable,
  type ClaimableAreas,
  type SelfServeClaimable,
  type SelfServeLayer,
} from "../api";
import {
  DENSITY_PRESETS,
  MAX_SHIFTS_PER_TURF,
  buildTurf,
  estimateTurf,
  formatHours,
} from "../lib/turf-planner";
import {
  DRAW_ISSUE_MESSAGE,
  addVertex,
  doorsInsideRing,
  drawDoorEstimate,
  formatArea,
  ringAreaSqM,
  ringToPolygon,
  undoVertex,
  validateRing,
} from "../lib/turf-draw";
import type { LngLat } from "../lib/geo";

const TurfMap = dynamic(() => import("../components/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[52vh] min-h-[320px] w-full" />,
});

type Mode = "area" | "draw";

/** The levels worth carving at on a phone, coarsest first. Meshblocks are the finest cut
 *  (a block of ~40 dwellings); SA2 is the escape hatch for a rural campaign whose SA1s are
 *  each a day's driving. */
const LEVELS: Array<{ id: SelfServeLayer; label: string }> = [
  { id: "sa2", label: "Suburb" },
  { id: "sa1", label: "Neighbourhood" },
  { id: "mb", label: "Block" },
];

/**
 * "Carve turf" — the mobile half of self-serve turf, and the surface that used to say
 * "available from a desktop for now". Two modes, both ending in the same claim:
 *
 *  - **Areas**: tap ASGS areas (suburb → block) to bank them. The areas come from the
 *    campaign-scoped self-serve endpoint, not the organiser-only /geo tiles.
 *  - **Draw**: tap out corners. Tap-to-drop rather than freehand — a thumb can't trace a
 *    boundary, and the numbered handles make Undo obvious.
 *
 * The running estimate is the planner's model (`../lib/turf-planner`) fed the volunteer's
 * saved density and session length, so "is this too much turf?" is answered here in the
 * same numbers the Turf planner screen quotes.
 */
export function CarveTurf() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useSearchParams();
  const campaignId = params.get("campaignId") ?? "";

  const [mode, setMode] = useState<Mode>("area");
  const [level, setLevel] = useState<SelfServeLayer>("sa1");
  const [data, setData] = useState<SelfServeClaimable | null>(null);
  const [areas, setAreas] = useState<ClaimableAreas | null>(null);
  const [loading, setLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [picked, setPicked] = useState<Array<{ code: string; name: string | null; addresses: number }>>([]);
  const [ring, setRing] = useState<LngLat[]>([]);

  // The planner's saved settings, so a selection is priced against THIS volunteer's shift
  // rather than a generic one. Defaults match the planner's own.
  const [densityId] = useLocalStorage("uprise.planner.density", DENSITY_PRESETS[1]!.id);
  const [sessionHours] = useLocalStorage("uprise.planner.sessionHours", 4);
  const [effectivePct] = useLocalStorage("uprise.planner.effectivePct", 69);
  const density = DENSITY_PRESETS.find((d) => d.id === densityId) ?? DENSITY_PRESETS[1]!;

  // Boot: boundary + what's already taken + which modes this campaign allows. No layer —
  // the modes aren't known yet, and asking for areas on a draw-only campaign 403s the mode.
  useEffect(() => {
    if (!campaignId) {
      setLoading(false);
      setError("No campaign selected.");
      return;
    }
    let alive = true;
    void (async () => {
      const res = await getSelfServeClaimable(campaignId);
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        // Land on a mode the campaign actually allows.
        if (!res.data.modes.includes("area")) setMode("draw");
      } else setError(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [campaignId]);

  // The claimable areas for the chosen level — fetched only while the Areas tab is open.
  useEffect(() => {
    if (!campaignId || mode !== "area" || !data?.modes.includes("area")) return;
    let alive = true;
    const ac = new AbortController();
    setAreasLoading(true);
    void (async () => {
      const res = await getSelfServeClaimable(campaignId, level, ac.signal);
      if (!alive) return;
      if (res.ok) setAreas(res.data.areas);
      else setError(res.error);
      setAreasLoading(false);
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [campaignId, level, mode, data]);

  // Switching level abandons a basket keyed to the old level's codes.
  useEffect(() => {
    setPicked([]);
  }, [level]);

  const toggleArea = (code: string, name: string | null) => {
    const feature = areas?.features.find((f) => f.properties.code === code);
    setPicked((prev) =>
      prev.some((p) => p.code === code)
        ? prev.filter((p) => p.code !== code)
        : [...prev, { code, name, addresses: feature?.properties.addresses ?? 0 }],
    );
  };

  // ── The running estimate, in the planner's numbers ────────────────────────
  // `areas` is null on a draw-only campaign (the claimable endpoint gates ?layer= on AREA mode),
  // and `?? []` used to turn that into a confident 0 door count — see drawDoorEstimate.
  const drawn = drawDoorEstimate(ring, areas?.features ?? null);
  const doors = mode === "area" ? picked.reduce((n, p) => n + p.addresses, 0) : drawn.doors;
  const doorsKnown = mode === "area" || drawn.known;
  const estimate = useMemo(() => {
    if (doors <= 0) return null;
    const turf = buildTurf(doors, density.doorsPerBuilding, density.gapMetres);
    const e = estimateTurf(turf.buildings, turf.walkSeconds);
    const effFraction = Math.max(0.01, effectivePct / 100);
    const hours = e.totalSeconds / 3600 / effFraction;
    return { hours, shifts: sessionHours > 0 ? hours / sessionHours : 0 };
  }, [doors, density, effectivePct, sessionHours]);
  const oversized = (estimate?.shifts ?? 0) > MAX_SHIFTS_PER_TURF;

  const drawIssue = ring.length > 0 ? validateRing(ring, data?.boundary) : null;
  const canClaim =
    !claiming && (mode === "area" ? picked.length > 0 : ring.length >= 3 && drawIssue === null);

  const claim = async () => {
    if (!canClaim) return;
    setClaiming(true);
    const res =
      mode === "area"
        ? await claimArea(campaignId, picked.map((p) => ({ layer: level, code: p.code })))
        : await claimDraw(campaignId, ringToPolygon(ring));
    setClaiming(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't claim that turf", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Turf claimed" });
    router.push(`/${res.data.id}`);
  };

  if (loading) return <Skeleton className="h-[70vh] w-full" />;
  if (error && !data) {
    return (
      <EmptyState
        title="Can't carve turf"
        description={error === "No campaign selected." ? "Open this from a campaign link." : error}
      />
    );
  }

  const modes = data?.modes ?? [];
  const canArea = modes.includes("area");
  const canDraw = modes.includes("draw");
  if (!canArea && !canDraw) {
    return (
      <EmptyState
        title="Carving is off for this campaign"
        description="An organiser cuts the turf here. Claim a ready-made one instead."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 pb-2">
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push(campaignId ? `/get-turf?campaignId=${encodeURIComponent(campaignId)}` : "/")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-extrabold">Carve turf</h1>
      </div>

      {/* Mode switch — only the modes this campaign allows. */}
      {canArea && canDraw ? (
        <div className="flex shrink-0 gap-2 rounded-xl bg-surface-variant p-1" role="tablist" aria-label="Carve mode">
          {([
            { id: "area" as const, label: "Pick areas", icon: MapPin },
            { id: "draw" as const, label: "Draw it", icon: PencilLine },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => setMode(t.id)}
              className={cn(
                "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition",
                mode === t.id ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Level picker — areas mode only. */}
      {mode === "area" ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-1 gap-2" role="group" aria-label="Area size">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={level === l.id}
                onClick={() => setLevel(l.id)}
                className={cn(
                  "h-9 flex-1 rounded-lg border text-xs font-bold transition",
                  level === l.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          {areasLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : null}

      <div className="h-[52vh] min-h-[320px] shrink-0 overflow-hidden rounded-xl border border-border">
        <TurfMap
          mode="edit"
          stops={[]}
          turfGeometry={(data?.boundary ?? null) as GeoJSON.Geometry | null}
          unavailableGeometry={(data?.claimed ?? null) as GeoJSON.Geometry | null}
          areaFeatures={mode === "area" ? (areas as GeoJSON.FeatureCollection | null) : null}
          selectedAreaCodes={picked.map((p) => p.code)}
          onAreaTap={mode === "area" ? toggleArea : undefined}
          drawRing={mode === "draw" ? ring : undefined}
          onMapTap={mode === "draw" ? (p) => setRing((r) => addVertex(r, p)) : undefined}
        />
      </div>

      {mode === "area" && data?.truncated ? (
        <p className="shrink-0 rounded-lg bg-warning-container px-3 py-2 text-xs text-warning">
          This campaign has more areas than the map will show at this size. Pick a bigger area size to see all of it.
        </p>
      ) : null}

      {mode === "draw" && ring.length === 0 ? (
        <p className="shrink-0 text-center text-sm text-muted-foreground">
          Tap the map to drop a corner. Three or more corners make a turf.
        </p>
      ) : null}

      {/* The running total + the claim. */}
      <div className="shrink-0 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {mode === "area"
                ? `${picked.length} area${picked.length === 1 ? "" : "s"}`
                : `${ring.length} corner${ring.length === 1 ? "" : "s"}`}
            </p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {mode === "draw" && ring.length >= 3 ? `${formatArea(ringAreaSqM(ring))} · ` : ""}
              {doors > 0 ? (
                <>
                  {mode === "draw" ? "≈ " : ""}
                  {doors.toLocaleString()} doors
                  {estimate ? ` · ~${formatHours(estimate.hours)}` : ""}
                </>
              ) : !doorsKnown && ring.length >= 3 ? (
                // A drawn ring with no address data behind it. Saying "Nothing picked yet" beside
                // a real polygon read as "this turf is empty", which is a different claim from
                // "we cannot price it here" — and it is the one that let an oversized turf pass.
                "Door count not available for this campaign"
              ) : (
                "Nothing picked yet"
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {mode === "draw" && ring.length > 0 ? (
              <button
                type="button"
                aria-label="Undo last corner"
                onClick={() => setRing(undoVertex)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground"
              >
                <Undo2 className="h-4 w-4" />
              </button>
            ) : null}
            {(mode === "area" ? picked.length > 0 : ring.length > 0) ? (
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => (mode === "area" ? setPicked([]) : setRing([]))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Why the claim is blocked, in one actionable line. */}
        {mode === "draw" && drawIssue ? (
          <p className="text-xs font-medium text-warning">{DRAW_ISSUE_MESSAGE[drawIssue]}</p>
        ) : null}

        {oversized && estimate ? (
          <p className="text-xs font-medium text-warning">
            That&apos;s about {estimate.shifts.toFixed(1)} shifts of knocking. Take less and finish it — a half-knocked
            list is worse than a small one.
          </p>
        ) : null}

        <Button className="h-12 w-full text-base" disabled={!canClaim} onClick={claim}>
          {claiming ? <Loader2 className="h-5 w-5 animate-spin" /> : "Claim this turf"}
        </Button>
      </div>
    </div>
  );
}
