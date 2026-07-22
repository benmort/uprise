// Field-facing canvassing API calls (door knocks, assignments, dispositions, push).
// Thin wrappers over the shared cookie-auth `request` from @uprise/api-client — the
// single home for these so apps/field and apps/admin share one copy (no replication).
// Organiser-only canvass calls (turfs, walk-lists, campaign summaries) stay in
// apps/admin/src/lib/api.ts; only what the field surfaces use lives here.
import { request, getApiUrl } from "@uprise/api-client";

export type DispositionDef = {
  id: string;
  tenantId: string | null;
  code: string;
  label: string;
  layer: "CONTACT_RESULT" | "TERMINAL" | "DATA_QUALITY";
  channel: "DOOR" | "SMS" | "BOTH";
  isTerminal: boolean;
  isLocked: boolean;
  orderIndex: number;
};

/** [west, south, east, north] — the slim bounds list endpoints ship instead of boundary GeoJSON. */
export type TurfBBox = [number, number, number, number];

/** Per-list door tallies on the assignments LIST — the items themselves ride on the
 *  single-turf payload (getCanvassAssignment) only. */
export type WalkListCounts = { id: string; name: string; total: number; pending: number; visited: number };

/** One row of GET /canvass/assignments — the field BOOT payload. Slim on walk lists
 *  (counts, not items), but carries the turf's boundary `geometry` so the homepage card
 *  can draw the real turf outline, plus `canSelfClaim` (the campaign's self-serve flag) so
 *  the "Get more turf" link is hidden when self-claim is off. */
export type CanvassAssignmentSummary = {
  turfId: string;
  lockedUntil: string | null;
  turf: {
    id: string;
    name: string;
    bbox: TurfBBox | null;
    geometry?: unknown;
    campaignId: string | null;
    canSelfClaim?: boolean;
    /** Whether this turf's campaign has any shifts — gates the homepage "Pick a shift" link. */
    hasShifts?: boolean;
    /** Reachable doors/hour from the turf's density estimate — the card turns this + the
     *  pending door count into a "time left" estimate. Null until the turf has been priced. */
    doorsPerHour?: number | null;
  };
  walkLists: WalkListCounts[];
};

/** The FULL single-turf payload (GET /canvass/assignments/:turfId) — boundary geometry +
 *  every walk-list item — fetched only for the turf being walked, and cached per-turf URL
 *  so the walk view still renders offline. Also the shape the admin organiser preview
 *  synthesises for the embedded WalkView. */
export type CanvassAssignment = {
  turfId: string;
  lockedUntil: string | null;
  turf: { id: string; name: string; geometry: unknown; campaignId: string | null };
  walkLists: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      orderIndex: number;
      status: "PENDING" | "VISITED" | "SKIPPED";
      contact: Record<string, unknown>;
    }>;
  }>;
};

/** The turf's walk route, ordered by the server with real Mapbox walking distances/geometry.
 *  `ordered` is CONTACT ids; `source` says whether Mapbox walked it or it fell back to straight lines. */
export type WalkRoute = {
  ordered: string[];
  legs: Array<{ fromId: string; toId: string; distanceM: number; durationS: number }>;
  totalM: number;
  totalS: number;
  source: "directions" | "crowflies";
  geometry: GeoJSON.LineString | null;
};

/** The volunteer's own walk route for a turf, optionally ordered from their GPS `origin`.
 *  Always `pending=1`: the field route threads the un-knocked doors only, so a mid-walk
 *  re-optimise never routes back through doors already done. */
export async function getWalkRoute(
  turfId: string,
  volunteerId: string,
  origin?: { lat: number; lng: number },
  signal?: AbortSignal,
) {
  const q = new URLSearchParams({ volunteerId, pending: "1" });
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    q.set("lat", String(origin.lat));
    q.set("lng", String(origin.lng));
  }
  return request<WalkRoute>(
    `/canvass/turfs/${encodeURIComponent(turfId)}/walk-route?${q}`,
    signal ? { signal } : undefined,
  );
}

/** One historical door-knock on a turf — GPS + when it happened. Feeds the shift replay. */
export type TurfKnock = {
  walkListItemId: string | null;
  contactId: string;
  lat: number | null;
  lng: number | null;
  dispositionCode: string | null;
  /** ISO time the door was actually knocked (client capture beats server receipt). */
  at: string;
};

/** The volunteer's own knock history on a turf, oldest first (shift replay's past half). */
export async function getTurfKnocks(turfId: string, volunteerId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ volunteerId });
  return request<TurfKnock[]>(
    `/canvass/turfs/${encodeURIComponent(turfId)}/knocks?${q}`,
    signal ? { signal } : undefined,
  );
}

export type DoorKnockSurveyAnswer = { questionId: string; optionId?: string; valueText?: string };

export type DoorKnockInput = {
  contactId: string;
  volunteerId: string;
  localId: string;
  dispositionCode?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  clientCapturedAt?: string;
  walkListItemId?: string;
  photoUrl?: string;
  /** Offline outbox reference to a queued DOOR_PHOTO record (its localId); the dispatcher
   *  resolves it to `photoUrl` once the photo uploads. Stripped before the knock is POSTed. */
  photoRef?: string;
  /** Offline outbox reference to a queued ADD_CONTACT record, resolved to `contactId` on sync. */
  contactRef?: string;
  safetyFlag?: boolean;
  /** APP 5 door consent — true only when the resident affirmatively agreed. */
  consent?: boolean;
  surveyAnswers?: DoorKnockSurveyAnswer[];
};

export async function listDispositions(channel?: "DOOR" | "SMS", signal?: AbortSignal) {
  const q = channel ? `?channel=${channel}` : "";
  return request<DispositionDef[]>(`/engagement/dispositions${q}`, signal ? { signal } : undefined);
}

export async function getCanvassAssignments(volunteerId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ volunteerId });
  return request<CanvassAssignmentSummary[]>(`/canvass/assignments?${q}`, signal ? { signal } : undefined);
}

/** The ONE turf being walked, in full (geometry + walk-list items). */
export async function getCanvassAssignment(turfId: string, volunteerId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ volunteerId });
  return request<CanvassAssignment>(
    `/canvass/assignments/${encodeURIComponent(turfId)}?${q}`,
    signal ? { signal } : undefined,
  );
}

export type VolunteerMetrics = {
  doorsToday: number;
  doorsTotal: number;
  conversationsToday: number;
  conversationsTotal: number;
  surveysToday: number;
  surveysTotal: number;
  // Persuasion = distinct residents given a support level at the door (voter IDs).
  persuasionToday: number;
  persuasionTotal: number;
};

/** Day + all-time tallies for the "My turf" header tiles. */
export async function getVolunteerMetrics(volunteerId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ volunteerId });
  return request<VolunteerMetrics>(`/canvass/volunteer-metrics?${q}`, signal ? { signal } : undefined);
}

export async function submitDoorKnock(input: DoorKnockInput) {
  return request<Record<string, unknown>>("/canvass/door-knocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function releaseTurf(turfId: string, volunteerId: string) {
  return request<{ count: number }>(`/canvass/turfs/${encodeURIComponent(turfId)}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volunteerId }),
  });
}

export async function createDoorContact(input: {
  volunteerId: string;
  turfId: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  phoneE164?: string;
  lat?: number;
  lng?: number;
  /** Client id for server-side idempotency on retry (mirrors door-knocks). */
  localId?: string;
}) {
  return request<{ id: string; firstName: string | null; lastName: string | null; address: string | null }>(
    "/canvass/door-contacts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

// ── Volunteer self-serve turf (gated per-campaign) ───────────────────
export type SelfServeAvailable = {
  boundary: unknown | null;
  modes: string[];
  readyTurfs: Array<{ id: string; name: string; bbox: TurfBBox | null; contactCount: number }>;
};

export async function getSelfServeAvailable(campaignId: string) {
  return request<SelfServeAvailable>(`/canvass/campaigns/${encodeURIComponent(campaignId)}/self-serve/available`);
}

/** Ready-made unassigned turf recommended for this volunteer across their tenant's self-serve
 *  campaigns — powers the "Recommended turf" section on an empty My turf. Each carries its own
 *  campaignId so claiming still routes per-campaign. */
export type RecommendedTurf = {
  id: string;
  name: string;
  bbox: TurfBBox | null;
  // The turf's boundary GeoJSON, so the card draws the real turf shape (not just its bbox).
  geometry?: unknown;
  contactCount: number;
  campaignId: string;
  campaignName: string;
};

export async function getRecommendedTurf(volunteerId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ volunteerId });
  return request<RecommendedTurf[]>(`/canvass/recommended-turf?${q}`, signal ? { signal } : undefined);
}

export async function claimArea(campaignId: string, areas: Array<{ layer: string; code: string }>) {
  return request<{ id: string; name: string }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/self-serve/claim-area`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areas }) },
  );
}

export async function claimDraw(campaignId: string, polygon: unknown) {
  return request<{ id: string; name: string }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/self-serve/claim-draw`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ polygon }) },
  );
}

export async function claimExistingTurf(campaignId: string, turfId: string) {
  return request<{ id: string }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/self-serve/claim-turf`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turfId }) },
  );
}

export async function getPushConfig() {
  return request<{ enabled: boolean; publicKey: string | null }>("/push/config");
}

export async function subscribePush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}) {
  return request<{ ok: boolean }>("/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
}

export type PhotoUploadResult = { ok: true; data: { url: string } } | { ok: false; error: string };

/** Core multipart upload — accepts a Blob (+ filename) so it works for both a live `File` at
 *  the door AND a Blob replayed from the offline outbox (the Blob carries its own MIME type). */
export async function uploadDoorPhotoBlob(blob: Blob, filename: string): Promise<PhotoUploadResult> {
  const apiUrl = getApiUrl();
  const form = new FormData();
  form.append("file", blob, filename);
  try {
    const res = await fetch(`${apiUrl}/canvass/door-photos`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false as const, error: json?.error?.message || json?.message || `Upload failed (${res.status})` };
    }
    return { ok: true as const, data: (json?.data ?? json) as { url: string } };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function uploadDoorPhoto(file: File): Promise<PhotoUploadResult> {
  return uploadDoorPhotoBlob(file, file.name);
}
