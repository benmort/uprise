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
  safetyFlag?: boolean;
  surveyAnswers?: DoorKnockSurveyAnswer[];
};

export async function listDispositions(channel?: "DOOR" | "SMS") {
  const q = channel ? `?channel=${channel}` : "";
  return request<DispositionDef[]>(`/engagement/dispositions${q}`);
}

export async function getCanvassAssignments(volunteerId: string) {
  const q = new URLSearchParams({ volunteerId });
  return request<CanvassAssignment[]>(`/canvass/assignments?${q}`);
}

export type VolunteerMetrics = {
  doorsToday: number;
  doorsTotal: number;
  conversationsToday: number;
  conversationsTotal: number;
  surveysToday: number;
  surveysTotal: number;
};

/** Day + all-time tallies for the "My turf" header tiles. */
export async function getVolunteerMetrics(volunteerId: string) {
  const q = new URLSearchParams({ volunteerId });
  return request<VolunteerMetrics>(`/canvass/volunteer-metrics?${q}`);
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

export async function uploadDoorPhoto(file: File): Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }> {
  const apiUrl = getApiUrl();
  const form = new FormData();
  form.append("file", file);
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
