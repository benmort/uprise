"use client";

import {
  getCanvassAssignments,
  getRecommendedTurf,
  getVolunteerMetrics,
  listDispositions,
  type CanvassAssignment,
  type DispositionDef,
  type RecommendedTurf,
  type VolunteerMetrics,
} from "../api/canvass";
import { listSurveys, getSurvey, type SurveyListItem, type Survey } from "../api/engagement";
import { getContactProfile, type ContactProfile } from "../api/contacts";
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

/** Recommended ready-made turf for the volunteer — shown on My turf when nothing is assigned. */
export function useRecommendedTurf(volunteerId: string | null) {
  return useApi<RecommendedTurf[]>(
    volunteerId ? `/canvass/recommended-turf?volunteerId=${volunteerId}` : null,
    (signal) => getRecommendedTurf(volunteerId as string, signal),
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

/**
 * Survey catalogue + one survey's full schema — routed through useApi (not a raw per-door
 * fetch) so the schema lands in the durable cache and a door opened offline still shows its
 * questions. Cached 5 min; `useSurvey(null)` skips (disposition-only campaigns).
 */
export function useSurveys() {
  return useApi<SurveyListItem[]>("/engagement/surveys", () => listSurveys(), { ttlMs: 300_000 });
}

export function useSurvey(id: string | null) {
  return useApi<Survey>(
    id ? `/engagement/surveys/${encodeURIComponent(id)}` : null,
    () => getSurvey(id as string),
    { ttlMs: 300_000 },
  );
}

/** This resident's recent contact history for the informed knock — cached + durable so the
 *  prior-contact context survives going offline. */
export function useContactProfile(id: string | null) {
  return useApi<ContactProfile>(
    id ? `/contacts/${encodeURIComponent(id)}` : null,
    () => getContactProfile(id as string),
    { ttlMs: 60_000 },
  );
}
