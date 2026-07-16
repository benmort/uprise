import { request as cookieRequest, getApiUrl, type ApiResult } from "@uprise/api-client";
// Field-facing canvass API now lives in @uprise/field (shared with apps/field, no
// duplication). Re-exported here so organiser pages keep importing from "@/lib/api".
import {
  getCanvassAssignments,
  submitDoorKnock,
  releaseTurf,
  createDoorContact,
  uploadDoorPhoto,
  listDispositions,
  getPushConfig,
  subscribePush,
} from "@uprise/field";
import type {
  DispositionDef,
  DoorKnockInput,
  DoorKnockSurveyAnswer,
  CanvassAssignment,
} from "@uprise/field";
import type { IntegrationSyncJob } from "./audience-sync";

export { getApiUrl };
export type { ApiResult };
export {
  getCanvassAssignments,
  submitDoorKnock,
  releaseTurf,
  createDoorContact,
  uploadDoorPhoto,
  listDispositions,
  getPushConfig,
  subscribePush,
};
export type { DispositionDef, DoorKnockInput, DoorKnockSurveyAnswer, CanvassAssignment };

export function getRuntimeConfigWarnings(): string[] {
  const warnings: string[] = [];
  const api = getApiUrl();
  if (!api) warnings.push("Missing NEXT_PUBLIC_API_URL");
  if (!process.env.NEXT_PUBLIC_ACTION_NETWORK_BASE_URL) {
    warnings.push("NEXT_PUBLIC_ACTION_NETWORK_BASE_URL is not set");
  }
  return warnings;
}

export type AudienceImportProgress = {
  importId: string;
  audienceId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  fileName: string;
  cursor: number;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errorSummary: string | null;
  remainingRows: number;
};

/**
 * Cookie-based request (meld doc 14). Delegates to @uprise/api-client, which sends
 * the httpOnly session cookie (credentials:include) and bounces to the auth app on
 * 401. The legacy third arg is accepted for call-site compatibility but ignored —
 * auth is the cookie, not a per-call header.
 */
export async function request<T>(
  path: string,
  init?: RequestInit,
  _withAuth = true,
): Promise<ApiResult<T>> {
  return cookieRequest<T>(path, init);
}

export type AuthPrincipal = {
  id: string;
  role: "OWNER" | "ORGANISER" | "VOLUNTEER";
  tenantId: string | null;
};

export async function getRealtimeStreamToken() {
  return request<{ token: string; expiresAt: string }>("/auth/stream-token");
}

export async function getDashboardPerformance() {
  return request<{
    totalSent: number;
    totalContacted?: number;
    totalResponded: number;
    responseRate: number;
    activeDrafts: number;
  }>("/analytics/dashboard/performance");
}

export async function getRecentBlasts() {
  return request<Array<Record<string, unknown>>>("/analytics/dashboard/recent-blasts");
}

export type QueueStatsResponse = {
  at: string;
  queuePrefix: string;
  queues: Array<{
    name: string;
    counts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    };
    error: string | null;
  }>;
  redis: {
    configured: boolean;
    connected: boolean;
    pingMs: number | null;
    version: string | null;
    connectedClients: number | null;
    usedMemoryBytes: number | null;
    usedMemoryHuman: string | null;
    error: string | null;
  };
};

export async function getQueueStats() {
  return request<QueueStatsResponse>("/system/queue-stats");
}

/** Per-tenant async-work health (domain-table aggregation) — the tenant-scoped
 *  counterpart to the global queue/Redis stats. Super-admin only. */
export type TenantActivityResponse = {
  at: string;
  tenantId: string;
  domains: Array<{
    key: string;
    label: string;
    total: number;
    byStatus: Record<string, number>;
  }>;
};

export async function getTenantActivity() {
  return request<TenantActivityResponse>("/system/tenant-activity");
}

export type FeatureFlagsResponse = {
  FEATURE_REALTIME_ENABLED: boolean;
  FEATURE_AI_ASSIST_ENABLED: boolean;
  FEATURE_BLAST_SCHEDULER_ENABLED: boolean;
  FEATURE_BULLMQ_UPLOAD_ENABLED: boolean;
  FEATURE_BULLMQ_BLAST_ENABLED: boolean;
  FEATURE_WHATSAPP_ENABLED: boolean;
  FEATURE_TENANT_TELEPHONY_ENABLED: boolean;
  FEATURE_TENANT_EMAIL_ENABLED: boolean;
  BLAST_DRY_RUN: boolean;
};

export async function getFeatureFlags() {
  return request<FeatureFlagsResponse>("/system/feature-flags");
}

export type AudienceChannel = "SMS" | "WHATSAPP" | "ALL";

export async function listAudiences(params?: {
  status?: string;
  source?: string;
  channel?: AudienceChannel;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
  if (params?.channel) q.set("channel", params.channel);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  return request<{ rows: Array<Record<string, unknown>>; total: number }>(`/audiences?${q}`);
}

export async function getAudience(audienceId: string) {
  return request<Record<string, unknown>>(`/audiences/${encodeURIComponent(audienceId)}`);
}

export async function deleteAudience(audienceId: string) {
  return request<Record<string, unknown>>(`/audiences/${encodeURIComponent(audienceId)}`, {
    method: "DELETE",
  });
}

export async function getAudienceContacts(
  audienceId: string,
  params?: { query?: string; limit?: number; offset?: number },
) {
  const q = new URLSearchParams();
  if (params?.query) q.set("query", params.query);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const suffix = q.toString() ? `?${q}` : "";
  return request<{ rows: Array<Record<string, unknown>>; total: number }>(
    `/audiences/${encodeURIComponent(audienceId)}/contacts${suffix}`,
  );
}

export async function createAudience(body: {
  name: string;
  source?: string;
  channel?: AudienceChannel;
  kind?: "STATIC" | "WHATSAPP_OPTED_IN";
}) {
  return request<Record<string, unknown>>("/audiences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Create (or fetch) the dynamic "all WhatsApp opt-ins" smart audience. */
export async function createWhatsappOptInAudience() {
  return request<{ id: string; name: string }>("/audiences/whatsapp-opt-ins", { method: "POST" });
}

/** How many of an audience's members are WhatsApp-reachable (opted in). */
export async function getAudienceWhatsappReach(audienceId: string) {
  return request<{ total: number; reachable: number }>(
    `/audiences/${encodeURIComponent(audienceId)}/whatsapp-reach`,
  );
}

export async function importAudienceCsv(
  audienceId: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  const apiUrl = getApiUrl();
  const form = new FormData();
  form.append("file", file);
  const url = `${apiUrl}/audiences/${audienceId}/import-csv`;

  if (onProgress && typeof window !== "undefined" && typeof XMLHttpRequest !== "undefined") {
    return new Promise<
      | { ok: true; data: AudienceImportProgress }
      | { ok: false; error: string }
    >((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      // Cookie auth (meld doc 14): send the httpOnly session cookie with the upload.
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        onProgress(percent);
      };
      xhr.onerror = () => resolve({ ok: false, error: "Upload failed" });
      xhr.onload = () => {
        const raw = xhr.responseText || "";
        let json: any = null;
        if (raw) {
          try {
            json = JSON.parse(raw) as unknown;
          } catch {
            json = null;
          }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, data: (json?.data ?? json) as AudienceImportProgress });
          return;
        }
        resolve({
          ok: false,
          error: json?.error?.message || json?.message || `Upload failed (${xhr.status})`,
        });
      };
      xhr.send(form);
    });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) return { ok: false as const, error: json?.error?.message || json?.message || "Upload failed" };
    return { ok: true as const, data: (json?.data ?? json) as AudienceImportProgress };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getAudienceImportStatus(audienceId: string, importId: string) {
  return request<AudienceImportProgress>(
    `/audiences/${encodeURIComponent(audienceId)}/imports/${encodeURIComponent(importId)}`,
  );
}

export async function searchIntegrationLists(type: "ACTION_NETWORK" | "INTERNAL", query: string) {
  const q = new URLSearchParams({ type, query });
  return request<{ lists: Array<Record<string, unknown>> }>(`/integrations/lists/search?${q}`);
}

export type SyncIntegrationListResult = {
  syncJobId?: string;
  /** The audience the sync writes into — created up-front so the UI can show it immediately. */
  audienceId?: string;
  queued?: boolean;
  queueJobId?: string;
  status?: string;
  audienceName?: string;
  listId?: string;
  type?: string;
  syncedCount?: number;
  failedCount?: number;
  stats?: Record<string, unknown>;
};

export async function syncIntegrationList(input: {
  type: "ACTION_NETWORK" | "INTERNAL";
  listId: string;
  audienceName: string;
  listName?: string;
  query?: string;
}) {
  return request<SyncIntegrationListResult>("/integrations/lists/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Recent integration sync jobs (drives the live sync badge + poll on the audiences page). */
export async function getSyncJobs(limit = 50) {
  return request<IntegrationSyncJob[]>(
    `/integrations/sync-jobs?limit=${encodeURIComponent(String(limit))}`,
  );
}

export type AudienceSegmentRow = {
  id: string;
  name: string;
  type: string;
  audienceId: string;
  audienceName: string | null;
  source: string | null;
  syncedAt: string | null;
  memberCount: number;
  updatedAt: string;
};

/** Dynamic/static segments for the tenant (the "Dynamic Segments" card). */
export async function getAudienceSegments() {
  return request<AudienceSegmentRow[]>("/audiences/segments");
}

export async function upsertIntegrationConnection(input: {
  type: "ACTION_NETWORK" | "INTERNAL";
  name: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  return request<Record<string, unknown>>("/integrations/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function testIntegrationConnection(input: {
  type: "ACTION_NETWORK" | "INTERNAL";
  apiKey?: string;
  baseUrl?: string;
}) {
  return request<{ ok: boolean; detail?: string }>("/integrations/connections/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Disconnect (INACTIVE) or reconnect (ACTIVE) a connection. */
export async function setIntegrationConnectionStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  return request<{ id: string; status: string }>(`/integrations/connections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function deleteIntegrationConnection(id: string) {
  return request<{ deleted: true }>(`/integrations/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type MessageChannel = "SMS" | "WHATSAPP";

export async function createBlast(input: {
  title: string;
  audienceId?: string;
  bodyTemplate: string;
  channel?: MessageChannel;
  contentSid?: string;
  contentVariableMap?: Record<string, string>;
  fromNumberId?: string;
}) {
  return request<Record<string, unknown>>("/blasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateBlast(
  blastId: string,
  input: {
    title?: string;
    audienceId?: string;
    bodyTemplate?: string;
    channel?: MessageChannel;
    contentSid?: string;
    contentVariableMap?: Record<string, string>;
    fromNumberId?: string;
  },
) {
  return request<Record<string, unknown>>(`/blasts/${blastId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteBlast(blastId: string) {
  return request<Record<string, unknown>>(`/blasts/${blastId}`, {
    method: "DELETE",
  });
}

export async function proofBlast(
  blastId: string,
  sampleRecipients?: Array<Record<string, unknown>>,
  proofNumber?: string,
) {
  return request<{
    previews: Array<{ recipient: Record<string, unknown>; rendered: string }>;
    proofDispatch?: { to: string; sid: string } | null;
  }>(
    `/blasts/${blastId}/proof-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleRecipients, proofNumber }),
    },
  );
}

export async function markBlastProofed(blastId: string) {
  return request<Record<string, unknown>>(`/blasts/${blastId}/proofed`, { method: "POST" });
}

export async function scheduleBlast(blastId: string, scheduledFor: string) {
  return request<Record<string, unknown>>(`/blasts/${blastId}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledFor }),
  });
}

export async function sendBlast(blastId: string) {
  return request<Record<string, unknown>>(`/blasts/${blastId}/send`, { method: "POST" });
}

export async function retryBlast(blastId: string) {
  return request<Record<string, unknown>>(`/blasts/${blastId}/retry-failed`, { method: "POST" });
}

export async function listBlasts() {
  return request<Array<Record<string, unknown>>>("/blasts");
}

export type WhatsappTemplate = {
  id: string;
  contentSid: string;
  friendlyName: string;
  category: string;
  language: string;
  status: string;
  variables?: string[] | null;
  bodyPreview?: string | null;
};

export async function listWhatsappTemplates(status = "approved") {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  return request<WhatsappTemplate[]>(`/whatsapp/templates?${q}`);
}

export async function syncWhatsappTemplates() {
  return request<{ synced: number; templates: WhatsappTemplate[] }>("/whatsapp/templates/sync", {
    method: "POST",
  });
}

export async function getBlastKpis(blastId: string, channel?: string) {
  const q = channel ? `?channel=${encodeURIComponent(channel)}` : "";
  return request<Record<string, unknown>>(`/analytics/blasts/${blastId}/kpi${q}`);
}

export async function getBlastTrend(blastId: string, minutes: number | "all" = 60) {
  const q = new URLSearchParams();
  if (minutes === "all") {
    q.set("range", "all");
  } else {
    q.set("minutes", String(minutes));
  }
  return request<Array<Record<string, unknown>>>(`/analytics/blasts/${blastId}/trend?${q}`);
}

export async function getBlastActivity(blastId: string, limit = 25, offset = 0, channel?: string) {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (channel) q.set("channel", channel);
  return request<{ rows: Array<Record<string, unknown>>; total: number }>(
    `/analytics/blasts/${blastId}/activity?${q}`,
  );
}

export async function getBlastStatusDistribution(blastId: string, channel?: string) {
  const q = channel ? `?channel=${encodeURIComponent(channel)}` : "";
  return request<Array<Record<string, unknown>>>(
    `/analytics/blasts/${blastId}/status-distribution${q}`,
  );
}

export async function listConversations(params?: {
  query?: string;
  blastId?: string;
  audienceId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.query) q.set("query", params.query);
  if (params?.blastId) q.set("blastId", params.blastId);
  if (params?.audienceId) q.set("audienceId", params.audienceId);
  return request<Array<Record<string, unknown>>>(`/inbox/conversations?${q}`);
}

export async function getConversation(contactPhone: string, channel?: MessageChannel) {
  const q = new URLSearchParams();
  if (channel) q.set("channel", channel);
  const suffix = q.toString() ? `?${q}` : "";
  return request<Record<string, unknown>>(
    `/inbox/conversations/${encodeURIComponent(contactPhone)}${suffix}`,
  );
}

export type ConversationOwner = { id: string; name: string } | null;

export async function claimConversation(contactPhone: string, channel?: MessageChannel) {
  return request<{ contactPhone: string; channel: MessageChannel; owner: ConversationOwner }>(
    `/inbox/conversations/${encodeURIComponent(contactPhone)}/claim`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    },
  );
}

export async function releaseConversation(contactPhone: string, channel?: MessageChannel) {
  return request<{ contactPhone: string; channel: MessageChannel; owner: ConversationOwner }>(
    `/inbox/conversations/${encodeURIComponent(contactPhone)}/release`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    },
  );
}

export async function sendInboxReply(
  contactPhone: string,
  body: string,
  channel?: MessageChannel,
) {
  return request<Record<string, unknown>>("/inbox/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactPhone, body, channel }),
  });
}

export async function markConversation(
  contactPhone: string,
  resolved: boolean,
  channel?: MessageChannel,
) {
  return request<Record<string, unknown>>(`/inbox/conversations/${encodeURIComponent(contactPhone)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolved, channel }),
  });
}

export async function getAiSuggestions(message: string) {
  const q = new URLSearchParams({ message });
  return request<{ suggestions: CannedSuggestion[] }>(`/inbox/ai-suggestions?${q}`);
}

// ── Shared engagement ────────────────────────────────────────────────────

export type CannedSuggestion = {
  id: string;
  title: string;
  body: string;
  dispositionCode: string | null;
  autoSend: boolean;
};

export async function listCannedResponses(channel?: "DOOR" | "SMS", ownerId?: string) {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  if (ownerId) params.set("ownerId", ownerId);
  const q = params.toString();
  return request<Array<Record<string, unknown>>>(`/engagement/canned-responses${q ? `?${q}` : ""}`);
}

// ── Engagement authoring (organiser) ───────────────────────────────────────

export async function createDispositionDef(input: {
  code: string;
  label: string;
  channel?: "DOOR" | "SMS" | "BOTH";
}) {
  return request<DispositionDef>("/engagement/disposition-defs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateDispositionDef(
  id: string,
  input: { label?: string; channel?: "DOOR" | "SMS" | "BOTH"; orderIndex?: number },
) {
  return request<DispositionDef>(`/engagement/disposition-defs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteDispositionDef(id: string) {
  return request<{ deleted: boolean }>(`/engagement/disposition-defs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type CannedVisibility = "ORG" | "PERSONAL" | "AUTO_SEND";

export type CannedResponseItem = {
  id: string;
  title: string;
  body: string;
  channel: "SMS" | "DOOR" | "BOTH";
  visibility: CannedVisibility;
  dispositionCode: string | null;
  ownerId: string | null;
};

export async function createCannedResponse(input: {
  title: string;
  body: string;
  channel?: "SMS" | "DOOR" | "BOTH";
  visibility?: CannedVisibility;
  dispositionCode?: string;
}) {
  return request<CannedResponseItem>("/engagement/canned-responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateCannedResponse(
  id: string,
  input: {
    title?: string;
    body?: string;
    channel?: "SMS" | "DOOR" | "BOTH";
    visibility?: CannedVisibility;
    dispositionCode?: string;
  },
) {
  return request<CannedResponseItem>(`/engagement/canned-responses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteCannedResponse(id: string) {
  return request<{ archived: boolean }>(`/engagement/canned-responses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Canvassing ───────────────────────────────────────────────────────────

/**
 * How long a turf takes to knock. `source` says how the walk between buildings was priced:
 * "directions" means Mapbox walked the real footpaths; "crowflies" means straight lines,
 * which always flatter a turf. Every time-at-the-door constant behind this is a literature
 * prior until real door-knock timings exist.
 */
export type TurfEstimate = {
  doors: number;
  buildings: number;
  doorsPerBuilding: number;
  doorsPerHour: number;
  doorsPerShift: number;
  shifts: number;
  source: "directions" | "crowflies" | string;
  computedAt: string;
};

export type TurfSummary = {
  id: string;
  name: string;
  campaignId: string | null;
  geometry: unknown;
  contactCount: number;
  walkListCount: number;
  totalStops: number;
  visitedStops: number;
  assignedTo: { volunteerId: string; name: string } | null;
  /** Null until the turf has been priced. */
  estimate: TurfEstimate | null;
};

export async function listTurfs(campaignId?: string) {
  const q = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
  return request<TurfSummary[]>(`/canvass/turfs${q}`);
}


export async function assignTurf(turfId: string, volunteerId: string, lockedUntil?: string) {
  return request<Record<string, unknown>>("/canvass/turfs/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turfId, volunteerId, lockedUntil }),
  });
}

export async function createTurf(name: string, geometry: unknown, campaignId?: string) {
  return request<Record<string, unknown>>("/canvass/turfs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, geometry, campaignId }),
  });
}

export async function createWalkList(
  name: string,
  contactIds: string[],
  turfId?: string,
  campaignId?: string,
  listType?: "STATIC" | "DYNAMIC",
) {
  return request<Record<string, unknown>>("/canvass/walk-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, contactIds, turfId, campaignId, listType }),
  });
}

export async function updateWalkList(
  id: string,
  input: { name?: string; listType?: "STATIC" | "DYNAMIC" },
) {
  return request<Record<string, unknown>>(`/canvass/walk-lists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateTurf(
  turfId: string,
  input: { name?: string; geometry?: unknown },
) {
  return request<Record<string, unknown>>(`/canvass/turfs/${encodeURIComponent(turfId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteTurf(turfId: string) {
  return request<{ deleted: true }>(`/canvass/turfs/${encodeURIComponent(turfId)}`, {
    method: "DELETE",
  });
}

/** Organiser-side release of a turf's active assignment (no volunteerId needed). */
export async function unassignTurf(turfId: string) {
  return request<{ released: number }>(`/canvass/turfs/${encodeURIComponent(turfId)}/unassign`, {
    method: "POST",
  });
}

/** Move a turf's assignment to another volunteer (release current + assign new). */
export async function reassignTurf(turfId: string, volunteerId: string) {
  return request<Record<string, unknown>>(`/canvass/turfs/${encodeURIComponent(turfId)}/reassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volunteerId }),
  });
}

export async function rebucketTurf(turfId: string) {
  return request<{ added: number; removed: number; total: number }>(
    `/canvass/turfs/${encodeURIComponent(turfId)}/rebucket`,
    { method: "POST" },
  );
}

export type RebuildWalkListResult = {
  turfId: string;
  walkListId?: string | null;
  items?: number;
  added?: number;
  removed?: number;
  error?: string;
};

/** (Re)build a turf's default walk list as the optimised route over its current addresses. */
export async function rebuildTurfWalkList(turfId: string) {
  return request<RebuildWalkListResult>(
    `/canvass/turfs/${encodeURIComponent(turfId)}/rebuild-walk-list`,
    { method: "POST" },
  );
}

/** Batch-rebuild many turfs' walk lists. The caller chunks a large selection for progress feedback. */
export async function rebuildWalkLists(turfIds: string[]) {
  return request<{ results: RebuildWalkListResult[] }>(`/canvass/walk-lists/rebuild`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turfIds }),
  });
}

/**
 * Materialise the "addresses without contacts" universe into a turf: creates
 * cold-door contacts inside the boundary so they become walk-list stops.
 * "existing" is a no-op. Returns how many were created + the new turf total.
 */
export async function loadTurfUniverse(
  turfId: string,
  universe: "existing" | "none" | "hybrid",
  limit?: number,
) {
  return request<{ materialised: number; total: number }>(
    `/canvass/turfs/${encodeURIComponent(turfId)}/load-universe`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ universe, limit }),
    },
  );
}

export type TurfContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** The contact's G-NAF address id (null when it has no gnafPid) — lets the canvasser
   *  preview's door popover fetch the address detail (regions, nearest polling). */
  gnafPid: string | null;
  address: string | null;
  /** G-NAF street/suburb/postcode (null when the contact has no gnafPid) — drive street grouping. */
  street: string | null;
  locality: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
};

export async function listTurfContacts(turfId: string) {
  return request<TurfContact[]>(`/canvass/turfs/${encodeURIComponent(turfId)}/contacts`);
}

/** A walking leg between two consecutive stops on the optimised route. */
export type RouteLeg = { fromId: string; toId: string; distanceM: number; durationS: number };
export type TurfRoute = {
  /** Contact ids in shortest-walking order (unlocated contacts sort to the end). */
  ordered: string[];
  legs: RouteLeg[];
  totalM: number;
  totalS: number;
  /** "directions" = real Mapbox walking; "crowflies" = straight-line fallback (no token). */
  source: "directions" | "crowflies";
  /** The street-following walk line through the located stops (Mapbox walking geometry).
   *  Null when Mapbox is unconfigured/failed — draw a straight beeline instead. */
  geometry?: GeoJSON.LineString | null;
};

export async function getTurfRoute(turfId: string) {
  return request<TurfRoute>(`/canvass/turfs/${encodeURIComponent(turfId)}/route`);
}

export async function listVolunteers() {
  return request<
    Array<{ id: string; displayName: string; email: string | null; role: string; mobile: string | null }>
  >("/canvass/volunteers");
}

export async function createVolunteer(input: {
  displayName: string;
  email: string;
  password: string;
  role?: "ORGANISER" | "VOLUNTEER";
}) {
  return request<{ id: string; displayName: string; email: string | null; role: string }>(
    "/canvass/volunteers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function updateVolunteer(
  id: string,
  input: { displayName?: string; role?: "ORGANISER" | "VOLUNTEER"; password?: string },
) {
  return request<{ id: string; displayName: string; email: string | null; role: string }>(
    `/canvass/volunteers/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export type WalkListSummary = {
  id: string;
  name: string;
  turfId: string | null;
  campaignId: string | null;
  listType: "STATIC" | "DYNAMIC";
  stopCount: number;
  visitedCount: number;
  assignedTo: {
    volunteerId: string;
    name: string;
    lockedSince: string;
    lockedUntil: string | null;
  } | null;
  createdAt: string;
};

export async function listWalkLists(turfId?: string) {
  const q = turfId ? `?turfId=${encodeURIComponent(turfId)}` : "";
  return request<WalkListSummary[]>(`/canvass/walk-lists${q}`);
}

// ── Settings: integrations & compliance (G13/G12) ──────────────────────────

export type IntegrationConnectionRow = {
  id: string;
  type: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export async function listIntegrationConnections() {
  return request<IntegrationConnectionRow[]>("/integrations/connections");
}

export type OptOutLedger = {
  total: number;
  byChannel: Array<{ channel: string; count: number }>;
  entries: Array<{ id: string; phoneE164: string; channel: string; source: string | null; updatedAt: string }>;
};

export async function getOptOuts(opts: { take?: number; skip?: number } = {}) {
  const q = new URLSearchParams();
  if (opts.take !== undefined) q.set("take", String(opts.take));
  if (opts.skip !== undefined) q.set("skip", String(opts.skip));
  const qs = q.toString();
  return request<OptOutLedger>(`/compliance/opt-outs${qs ? `?${qs}` : ""}`);
}

// ── Field extras + ops gaps (G2/G8/G10) ────────────────────────────────────

// ── Push to field (G14) ─────────────────────────────────────────────────────

export async function broadcastPush(input: { title: string; body: string; url?: string }) {
  return request<{ sent: number; pruned: number; enabled: boolean }>("/push/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type Shift = {
  id: string;
  campaignId: string | null;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
};

export async function listShifts(campaignId?: string) {
  const q = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
  return request<Shift[]>(`/canvass/shifts${q}`);
}

export async function createShift(input: {
  campaignId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}) {
  return request<Shift>("/canvass/shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateShift(
  id: string,
  input: { name?: string; location?: string; startsAt?: string; endsAt?: string },
) {
  return request<Shift>(`/canvass/shifts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteShift(id: string) {
  return request<{ deleted: boolean }>(`/canvass/shifts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type QaFlagKind = "NO_GPS" | "FAST_CADENCE";
export type QaFlag = {
  id: string;
  doorKnockId: string;
  kind: QaFlagKind;
  volunteer: string | null;
  reason: string;
  at: string;
  resolved: boolean;
  state: string | null;
};

export async function getQaReview(campaignId: string) {
  return request<{ flags: QaFlag[] }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/qa`,
  );
}

/** Record or clear an organiser's action on a computed QA flag. */
export async function resolveQaFlag(
  campaignId: string,
  input: { doorKnockId: string; kind: QaFlagKind; resolved?: boolean; state?: "RESOLVED" | "DISMISSED"; note?: string },
) {
  return request<{ resolved: boolean; state?: string }>(
    `/canvass/campaigns/${encodeURIComponent(campaignId)}/qa/resolve`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
}

// ── Journeys ───────────────────────────────────────────────────────────────

export type JourneyStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type JourneyTriggerType =
  | "disposition_set"
  | "message_received"
  | "tag_added"
  | "survey_answer"
  | "no_answer_after";
export type JourneyRungType = "wait" | "condition" | "action";

export type JourneyRung = {
  id?: string;
  rungIndex: number;
  type: JourneyRungType;
  config: Record<string, unknown>;
};

export type Journey = {
  id: string;
  name: string;
  status: JourneyStatus;
  triggerType: JourneyTriggerType;
  triggerConfig: Record<string, unknown>;
  rungs: JourneyRung[];
};

export type JourneyStats = {
  enrolled: number;
  active: number;
  waiting: number;
  completed: number;
  exited: number;
  failed: number;
  conversionPct: number;
};

export async function listJourneys() {
  return request<Journey[]>("/journeys");
}

export async function createJourney(input: {
  name: string;
  triggerType: JourneyTriggerType;
  triggerConfig?: Record<string, unknown>;
  rungs?: Array<{ rungIndex?: number; type: JourneyRungType; config?: Record<string, unknown> }>;
}) {
  return request<Journey>("/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateJourney(
  id: string,
  input: {
    name?: string;
    triggerType?: JourneyTriggerType;
    triggerConfig?: Record<string, unknown>;
    rungs?: Array<{ rungIndex?: number; type: JourneyRungType; config?: Record<string, unknown> }>;
  },
) {
  return request<Journey>(`/journeys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function setJourneyStatus(id: string, status: JourneyStatus) {
  return request<{ count: number }>(`/journeys/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function deleteJourney(id: string) {
  return request<{ deleted: boolean }>(`/journeys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getJourneyStats(id: string) {
  return request<JourneyStats>(`/journeys/${encodeURIComponent(id)}/stats`);
}

export async function dryRunJourney(id: string) {
  return request<{
    trigger: { type: string; config: Record<string, unknown> };
    steps: Array<{ rungIndex: number; type: string; label: string; config: Record<string, unknown> }>;
  }>(`/journeys/${encodeURIComponent(id)}/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}
