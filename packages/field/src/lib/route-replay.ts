// The shift-replay engine: pure time/space maths, no React, no network. The walk map's
// "play out the route" animates a person marker along two halves — the PAST (real knocks:
// GPS + timestamps, street-routed between them) and the FUTURE (the remaining route walked
// at the estimate pace from NOW) — at a fixed 360× time-compression (1 hour ≈ 10 seconds).
// The UI feeds it pre-fetched geometry + knock history and asks three questions per frame:
// where is the walker (`positionAt`), which pins have flipped (`pinStatesAt`), and what
// shift-time is it (`replayClock`).

export type ReplayPoint = { lat: number; lng: number };

export type ReplayKnock = {
  /** Walk-list item the knock belongs to (pin flips key off this). */
  stopId: string | null;
  lat: number;
  lng: number;
  atMs: number;
  disposition?: string | null;
};

export type ReplayStop = { id: string; lat: number; lng: number };

export type ReplayEvent = {
  atMs: number;
  stopId: string | null;
  disposition?: string | null;
  /** False = a real knock that happened; true = the projected future half. */
  projected: boolean;
};

export type TrackPoint = { atMs: number; lat: number; lng: number };

export type ReplayTimeline = {
  startMs: number;
  nowMs: number;
  endMs: number;
  events: ReplayEvent[];
  /** Timed positions, past then future, ascending — `positionAt` lerps between them. */
  track: TrackPoint[];
};

/** Replay speed: one hour of shift plays in ten seconds. */
export const REPLAY_SPEED = 360;

const WALK_PACE_MPS = 1.3;
const DWELL_S = 60;

function metres(a: ReplayPoint, b: ReplayPoint): number {
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

/** Line coords ([lng,lat]) as points, or [] for a missing line. */
function lineToPoints(line: GeoJSON.LineString | null | undefined): ReplayPoint[] {
  if (!line || line.type !== "LineString") return [];
  return line.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/** Nearest vertex of `pts` to `target`, searching forward from `fromIdx` only — via-points
 *  come in walk order, so a monotonic search can't snap back to a street walked earlier. */
function nearestVertexFrom(pts: ReplayPoint[], target: ReplayPoint, fromIdx: number): number {
  let best = fromIdx;
  let bestD = Infinity;
  for (let i = fromIdx; i < pts.length; i += 1) {
    const d = metres(pts[i], target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Timed track along `line` visiting `vias` (in order) at the given times: each line vertex
 *  between two vias gets a time interpolated by distance along that span. */
function timedTrackAlong(
  line: ReplayPoint[],
  vias: Array<{ point: ReplayPoint; atMs: number }>,
): TrackPoint[] {
  if (vias.length === 0) return [];
  if (line.length < 2) {
    // No geometry — the track is just the vias themselves (straight-line lerp between them).
    return vias.map((v) => ({ atMs: v.atMs, lat: v.point.lat, lng: v.point.lng }));
  }
  // Map each via to a line vertex, monotonically.
  const idx: number[] = [];
  let from = 0;
  for (const v of vias) {
    const i = nearestVertexFrom(line, v.point, from);
    idx.push(i);
    from = i;
  }
  const track: TrackPoint[] = [];
  for (let v = 0; v < vias.length - 1; v += 1) {
    const a = idx[v];
    const b = idx[v + 1];
    const t0 = vias[v].atMs;
    const t1 = vias[v + 1].atMs;
    // Distance profile across this span.
    let span = 0;
    for (let i = a; i < b; i += 1) span += metres(line[i], line[i + 1]);
    let walked = 0;
    for (let i = a; i <= b; i += 1) {
      if (i > a) walked += metres(line[i - 1], line[i]);
      const frac = span > 0 ? walked / span : i === b ? 1 : 0;
      track.push({ atMs: t0 + frac * (t1 - t0), lat: line[i].lat, lng: line[i].lng });
    }
  }
  if (track.length === 0) {
    const only = vias[0];
    track.push({ atMs: only.atMs, lat: only.point.lat, lng: only.point.lng });
  }
  return track;
}

/**
 * Build the full replay timeline. The PAST half threads `knocks` (chronological) along
 * `pastLine` between their real timestamps; the FUTURE half starts at `nowMs` from
 * `origin` and walks `futureLine` visiting `pendingStops` in order at the walk-estimate
 * pace (1.3 m/s + 60 s dwell per door). Either half may be empty.
 */
export function buildReplayTimeline(input: {
  knocks: ReplayKnock[];
  pendingStops: ReplayStop[];
  origin: ReplayPoint | null;
  nowMs: number;
  pastLine: GeoJSON.LineString | null;
  futureLine: GeoJSON.LineString | null;
  paceMps?: number;
  dwellS?: number;
}): ReplayTimeline {
  const pace = input.paceMps ?? WALK_PACE_MPS;
  const dwellMs = (input.dwellS ?? DWELL_S) * 1000;
  const knocks = [...input.knocks].sort((a, b) => a.atMs - b.atMs);
  const events: ReplayEvent[] = knocks.map((k) => ({
    atMs: k.atMs,
    stopId: k.stopId,
    disposition: k.disposition ?? null,
    projected: false,
  }));

  // Past track: line vertices timed between the knock timestamps.
  const pastTrack = timedTrackAlong(
    lineToPoints(input.pastLine),
    knocks.map((k) => ({ point: { lat: k.lat, lng: k.lng }, atMs: k.atMs })),
  );

  // Future track: from the origin (where the volunteer stands NOW), vias are the pending
  // stops with arrival times from constant pace + dwell at each door.
  const futureStart: ReplayPoint | null =
    input.origin ?? (knocks.length > 0 ? { lat: knocks[knocks.length - 1].lat, lng: knocks[knocks.length - 1].lng } : null);
  let futureTrack: TrackPoint[] = [];
  if (futureStart && input.pendingStops.length > 0) {
    const vias: Array<{ point: ReplayPoint; atMs: number }> = [{ point: futureStart, atMs: input.nowMs }];
    let t = input.nowMs;
    let prev = futureStart;
    for (const stop of input.pendingStops) {
      const d = metres(prev, stop);
      t += (d / pace) * 1000;
      vias.push({ point: { lat: stop.lat, lng: stop.lng }, atMs: t });
      events.push({ atMs: t, stopId: stop.id, projected: true });
      t += dwellMs; // knocking the door
      prev = stop;
    }
    futureTrack = timedTrackAlong(lineToPoints(input.futureLine), vias);
  }

  events.sort((a, b) => a.atMs - b.atMs);
  const track = [...pastTrack, ...futureTrack].sort((a, b) => a.atMs - b.atMs);
  const startMs = track.length > 0 ? track[0].atMs : input.nowMs;
  const endMs = events.length > 0 ? Math.max(events[events.length - 1].atMs, input.nowMs) : input.nowMs;
  return { startMs, nowMs: input.nowMs, endMs, events, track };
}

/** Shift-time for elapsed real (wall-clock) replay milliseconds at 360×, clamped to the end. */
export function replayClock(timeline: ReplayTimeline, elapsedRealMs: number, speed = REPLAY_SPEED): number {
  return Math.min(timeline.startMs + elapsedRealMs * speed, timeline.endMs);
}

/** Total real (wall-clock) duration of the replay at the given speed. */
export function replayDurationMs(timeline: ReplayTimeline, speed = REPLAY_SPEED): number {
  return Math.max(0, (timeline.endMs - timeline.startMs) / speed);
}

/** The walker's position at a shift-time: lerped between the surrounding track points.
 *  `projected` is true once the clock passes NOW (the ghost half). Null with no track. */
export function positionAt(
  timeline: ReplayTimeline,
  shiftMs: number,
): { lat: number; lng: number; projected: boolean } | null {
  const { track } = timeline;
  if (track.length === 0) return null;
  const projected = shiftMs > timeline.nowMs;
  if (shiftMs <= track[0].atMs) return { lat: track[0].lat, lng: track[0].lng, projected };
  const last = track[track.length - 1];
  if (shiftMs >= last.atMs) return { lat: last.lat, lng: last.lng, projected };
  // Binary search for the segment containing shiftMs.
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].atMs <= shiftMs) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const f = b.atMs > a.atMs ? (shiftMs - a.atMs) / (b.atMs - a.atMs) : 0;
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, projected };
}

/** Which stops have been reached by `shiftMs` — stopId → whether it was a real knock or a
 *  projected (future) one. Drives the pin flips and the progress counter. */
export function pinStatesAt(timeline: ReplayTimeline, shiftMs: number): Map<string, { projected: boolean }> {
  const out = new Map<string, { projected: boolean }>();
  for (const e of timeline.events) {
    if (e.atMs > shiftMs) break;
    if (e.stopId) out.set(e.stopId, { projected: e.projected });
  }
  return out;
}

/** The events newly crossed between two shift-times — the popup queue's feed. */
export function eventsBetween(timeline: ReplayTimeline, fromMs: number, toMs: number): ReplayEvent[] {
  return timeline.events.filter((e) => e.atMs > fromMs && e.atMs <= toMs);
}
