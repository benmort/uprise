"use client";

import {
  getCanvassAssignments,
  getVolunteerMetrics,
  listDispositions,
  type CanvassAssignment,
  type DispositionDef,
  type VolunteerMetrics,
} from "../api/canvass";
import { useApi } from "./use-api";

/**
 * Shared, cached canvasser data. Keyed by request path so every screen that needs
 * the "my turf" assignments (dashboard, walk view, door entry, shift summary, sync
 * centre) reads the SAME cache entry — one fetch, instant on revisit, revalidated in
 * the background. Replaces the per-screen `useEffect` + `fetch` that re-downloaded the
 * full payload on every mount.
 */
export function useAssignments(volunteerId: string | null) {
  return useApi<CanvassAssignment[]>(
    volunteerId ? `/canvass/assignments?volunteerId=${volunteerId}` : null,
    (signal) => getCanvassAssignments(volunteerId as string, signal),
    { ttlMs: 30_000 },
  );
}

export function useVolunteerMetrics(volunteerId: string | null) {
  return useApi<VolunteerMetrics>(
    volunteerId ? `/canvass/volunteer-metrics?volunteerId=${volunteerId}` : null,
    (signal) => getVolunteerMetrics(volunteerId as string, signal),
    { ttlMs: 30_000 },
  );
}

/** Disposition catalogue for the door form — reference data, cached 5 min. */
export function useDispositions(channel: "DOOR" | "SMS" = "DOOR") {
  return useApi<DispositionDef[]>(
    `/engagement/dispositions?channel=${channel}`,
    (signal) => listDispositions(channel, signal),
    { ttlMs: 300_000 },
  );
}
