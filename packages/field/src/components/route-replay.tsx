"use client";

// Shift replay — "play out the route". The hook orchestrates data (knock history + a
// street line between the knock points) and runs the 360× playback clock; the two
// components render inside/over the TurfMap. Pure timeline maths lives in
// lib/route-replay.ts (tested); this file is the glue + chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Popup, Source } from "react-map-gl/mapbox";
import { CHEVRON_LAYOUT } from "./turf-map";
import { History, Loader2, Pause, Play, X } from "lucide-react";
import { getTurfKnocks } from "../api";
import { fetchWalkingRouteGeometry } from "../lib/directions";
import { walkLineThrough } from "../lib/route";
import {
  buildReplayTimeline,
  eventsBetween,
  pinStatesAt,
  positionAt,
  replayClock,
  replayDurationMs,
  type ReplayTimeline,
} from "../lib/route-replay";

const PRIMARY = "#465fff";
const PAST_TRAIL = "#2e7d6a"; // where you've been reads as "done" green

export type ReplayStopInput = {
  id: string;
  contactId: string;
  lat: number;
  lng: number;
  status: string;
};

export type RouteReplayState = {
  /** True when the map should show the Replay pill (data prerequisites met). */
  available: boolean;
  active: boolean;
  playing: boolean;
  loading: boolean;
  /** 0–1 through the replay. */
  progress: number;
  /** Current shift-time (ms epoch) — the time chip. */
  shiftMs: number | null;
  nowMs: number;
  person: { lat: number; lng: number; projected: boolean } | null;
  /** stopId → display status while replaying (unflipped pins show PENDING). */
  displayStatus: (stop: { id: string; status: string }) => string;
  flippedCount: number;
  popup: { lat: number; lng: number; label: string; projected: boolean } | null;
  trails: { past: GeoJSON.LineString | null; future: GeoJSON.LineString | null };
  start: () => void;
  close: () => void;
  togglePlay: () => void;
  scrub: (fraction: number) => void;
};

const prettyDisposition = (code: string): string =>
  code.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Replay orchestration: on start, fetches the volunteer's knock history + a street line
 * through the knock points (public token), builds the timeline against the CURRENT
 * remaining route, then drives a rAF clock at 360×. Mid-shift by design: the past half
 * is what actually happened, the future half is the projected rest of the walk.
 */
export function useRouteReplay({
  turfId,
  volunteerId,
  stops,
  pendingStops,
  origin,
  futureLine,
}: {
  turfId: string;
  volunteerId: string | null;
  stops: ReplayStopInput[];
  pendingStops: ReplayStopInput[];
  origin: { lat: number; lng: number } | null;
  futureLine: GeoJSON.LineString | null;
}): RouteReplayState {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timeline, setTimeline] = useState<ReplayTimeline | null>(null);
  const [pastTrail, setPastTrail] = useState<GeoJSON.LineString | null>(null);
  const [shiftMs, setShiftMs] = useState<number | null>(null);
  const [popup, setPopup] = useState<RouteReplayState["popup"]>(null);

  // Playback clock: elapsed real ms accumulates while playing; scrubbing rewrites it.
  const elapsedRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const lastShiftRef = useRef<number>(0);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);

  const start = useCallback(() => {
    if (!volunteerId || loading) return;
    setLoading(true);
    void (async () => {
      const res = await getTurfKnocks(turfId, volunteerId);
      const knocksRaw = res.ok ? res.data : [];
      // Resolve each knock to coordinates: its own GPS, else the door's pin.
      const knocks = knocksRaw
        .map((k) => {
          const stop = k.walkListItemId ? stopById.get(k.walkListItemId) : undefined;
          const lat = k.lat ?? stop?.lat;
          const lng = k.lng ?? stop?.lng;
          return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
            ? {
                stopId: k.walkListItemId,
                lat,
                lng,
                atMs: Date.parse(k.at),
                disposition: k.dispositionCode,
              }
            : null;
        })
        .filter((k): k is NonNullable<typeof k> => k !== null && Number.isFinite(k.atMs));
      // Street line through the knock points (falls back to a straight thread offline).
      const knockPoints = knocks.map((k) => ({ lat: k.lat, lng: k.lng }));
      const pastLine =
        knockPoints.length >= 2
          ? (await fetchWalkingRouteGeometry(knockPoints)) ?? walkLineThrough(knockPoints)
          : null;
      const nowMs = Date.now();
      const tl = buildReplayTimeline({
        knocks,
        pendingStops: pendingStops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
        origin,
        nowMs,
        pastLine,
        futureLine,
      });
      setPastTrail(pastLine);
      setTimeline(tl);
      elapsedRef.current = 0;
      lastShiftRef.current = tl.startMs;
      setShiftMs(tl.startMs);
      setLoading(false);
      setActive(true);
      setPlaying(true);
    })();
  }, [turfId, volunteerId, loading, stopById, pendingStops, origin, futureLine]);

  const close = useCallback(() => {
    setActive(false);
    setPlaying(false);
    setTimeline(null);
    setPastTrail(null);
    setShiftMs(null);
    setPopup(null);
  }, []);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const scrub = useCallback(
    (fraction: number) => {
      if (!timeline) return;
      const f = Math.min(1, Math.max(0, fraction));
      elapsedRef.current = replayDurationMs(timeline) * f;
      const s = replayClock(timeline, elapsedRef.current);
      lastShiftRef.current = s;
      setShiftMs(s);
      setPopup(null);
    },
    [timeline],
  );

  // The rAF playback loop. Each frame advances the elapsed real clock, maps it to
  // shift-time, and surfaces any newly crossed knock as a transient popup.
  useEffect(() => {
    if (!active || !playing || !timeline) return;
    const tick = (t: number) => {
      if (lastFrameRef.current != null) elapsedRef.current += t - lastFrameRef.current;
      lastFrameRef.current = t;
      const s = replayClock(timeline, elapsedRef.current);
      const crossed = eventsBetween(timeline, lastShiftRef.current, s);
      const latest = [...crossed].reverse().find((e) => e.stopId);
      if (latest?.stopId) {
        const stop = stopById.get(latest.stopId);
        if (stop) {
          setPopup({
            lat: stop.lat,
            lng: stop.lng,
            label: latest.projected
              ? "Projected knock"
              : latest.disposition
                ? prettyDisposition(latest.disposition)
                : "Knocked",
            projected: latest.projected,
          });
          if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
          popupTimerRef.current = setTimeout(() => setPopup(null), 1400);
        }
      }
      lastShiftRef.current = s;
      setShiftMs(s);
      if (s >= timeline.endMs) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [active, playing, timeline, stopById]);

  useEffect(
    () => () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    },
    [],
  );

  const pinStates = useMemo(
    () => (timeline && shiftMs != null ? pinStatesAt(timeline, shiftMs) : new Map<string, { projected: boolean }>()),
    [timeline, shiftMs],
  );

  const displayStatus = useCallback(
    (stop: { id: string; status: string }): string => {
      if (!active) return stop.status;
      const flipped = pinStates.get(stop.id);
      if (!flipped) return "PENDING";
      // Real knocks flip to their true outcome; projected ones read as visited.
      return flipped.projected ? "VISITED" : stop.status === "PENDING" ? "VISITED" : stop.status;
    },
    [active, pinStates],
  );

  const person = timeline && shiftMs != null ? positionAt(timeline, shiftMs) : null;
  const progress =
    timeline && shiftMs != null && timeline.endMs > timeline.startMs
      ? (shiftMs - timeline.startMs) / (timeline.endMs - timeline.startMs)
      : 0;

  return {
    available: Boolean(volunteerId) && stops.length > 0,
    active,
    playing,
    loading,
    progress,
    shiftMs,
    nowMs: timeline?.nowMs ?? 0,
    person,
    displayStatus,
    flippedCount: pinStates.size,
    popup,
    trails: { past: pastTrail, future: active ? futureLine : null },
    start,
    close,
    togglePlay,
    scrub,
  };
}



/** Map-content half: the past/future trails (chevroned), the walking person marker
 *  (solid, then ghost past NOW) and the transient knock popup. Render as TurfMap children. */
export function ReplayMapContent({ replay }: { replay: RouteReplayState }) {
  if (!replay.active) return null;
  return (
    <>
      {replay.trails.past && (
        <Source id="replay-past" type="geojson" data={{ type: "Feature", geometry: replay.trails.past, properties: {} }}>
          <Layer
            id="replay-past-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PAST_TRAIL, "line-width": 4.5, "line-opacity": 0.55 }}
          />
          <Layer
            id="replay-past-chevrons"
            type="symbol"
            layout={CHEVRON_LAYOUT}
            paint={{ "text-color": PAST_TRAIL, "text-opacity": 0.8, "text-halo-color": "#ffffff", "text-halo-width": 1 }}
          />
        </Source>
      )}
      {replay.trails.future && (
        <Source id="replay-future" type="geojson" data={{ type: "Feature", geometry: replay.trails.future, properties: {} }}>
          <Layer
            id="replay-future-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PRIMARY, "line-width": 4, "line-opacity": 0.35, "line-dasharray": [1.5, 1.5] }}
          />
          <Layer
            id="replay-future-chevrons"
            type="symbol"
            layout={CHEVRON_LAYOUT}
            paint={{ "text-color": PRIMARY, "text-opacity": 0.5, "text-halo-color": "#ffffff", "text-halo-width": 1 }}
          />
        </Source>
      )}
      {replay.person && (
        <Marker latitude={replay.person.lat} longitude={replay.person.lng} anchor="center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 bg-surface text-lg shadow-float"
            style={{
              borderColor: replay.person.projected ? PRIMARY : PAST_TRAIL,
              borderStyle: replay.person.projected ? "dashed" : "solid",
              opacity: replay.person.projected ? 0.75 : 1,
            }}
            aria-label={replay.person.projected ? "Projected position" : "Replayed position"}
          >
            🚶
          </div>
        </Marker>
      )}
      {replay.popup && (
        <Popup
          latitude={replay.popup.lat}
          longitude={replay.popup.lng}
          anchor="bottom"
          offset={26}
          closeButton={false}
          closeOnClick={false}
          maxWidth="none"
        >
          <span className="text-xs font-bold" style={{ color: replay.popup.projected ? PRIMARY : PAST_TRAIL }}>
            {replay.popup.label}
          </span>
        </Popup>
      )}
    </>
  );
}

/** Overlay half: the Replay pill (idle) or the playback bar (playing) — play/pause,
 *  scrubber, shift-time chip, knocked counter and close. Sits over the map. */
export function ReplayControls({ replay, totalStops }: { replay: RouteReplayState; totalStops: number }) {
  if (!replay.available) return null;

  if (!replay.active) {
    return (
      <button
        type="button"
        onClick={replay.start}
        disabled={replay.loading}
        className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant disabled:opacity-60"
        style={{ marginLeft: 40 }} // clear of the fullscreen control
      >
        {replay.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5 text-primary" />}
        Replay shift
      </button>
    );
  }

  const timeLabel =
    replay.shiftMs != null
      ? new Date(replay.shiftMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
  const past = replay.shiftMs != null && replay.shiftMs <= replay.nowMs;

  return (
    <div className="absolute inset-x-3 top-3 z-10 rounded-2xl border border-border bg-surface/95 p-3 shadow-float backdrop-blur">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={replay.togglePlay}
          aria-label={replay.playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white"
        >
          {replay.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(replay.progress * 1000)}
            onChange={(e) => replay.scrub(Number(e.target.value) / 1000)}
            aria-label="Replay position"
            className="w-full accent-[#465fff]"
          />
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span className="tabular-nums">
              {timeLabel}
              {past ? "" : " · projected"}
            </span>
            <span className="tabular-nums">
              {replay.flippedCount}/{totalStops} doors
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={replay.close}
          aria-label="Close replay"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
