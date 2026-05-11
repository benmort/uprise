import { getBasicAuthHeader, getCredentials, type Credentials } from "./auth";

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __API_URL__?: string }).__API_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
}

export function getRuntimeConfigWarnings(): string[] {
  const warnings: string[] = [];
  const api = getApiUrl();
  if (!api) warnings.push("Missing NEXT_PUBLIC_API_URL");
  if (!process.env.NEXT_PUBLIC_ACTION_NETWORK_BASE_URL) {
    warnings.push("NEXT_PUBLIC_ACTION_NETWORK_BASE_URL is not set");
  }
  return warnings;
}

function getAuthHeaders(credentials: Credentials): HeadersInit {
  return {
    Authorization: getBasicAuthHeader(credentials),
  };
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(
  path: string,
  init?: RequestInit,
  withAuth = true,
): Promise<ApiResult<T>> {
  const credentials = withAuth ? getCredentials() : null;
  if (withAuth && !credentials) return { ok: false, error: "Not authenticated" };

  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: {
        ...(withAuth ? getAuthHeaders(credentials as Credentials) : {}),
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: T; error?: { message?: string }; message?: string }
      | null;
    if (!res.ok) {
      const message =
        json?.error?.message || json?.message || `Request failed (${res.status})`;
      return { ok: false, error: message };
    }
    const data = (json && "data" in json ? json.data : json) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function login(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = getAuthHeaders({ username, password });
    const res = await fetch(`${getApiUrl()}/auth/check`, { headers });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 401 ? "Invalid username or password." : `Request failed (${res.status})`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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

export async function listAudiences(params?: { status?: string; source?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
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

export async function createAudience(body: { name: string; source?: string }) {
  return request<Record<string, unknown>>("/audiences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function importAudienceCsv(
  audienceId: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  const credentials = getCredentials();
  if (!credentials) return { ok: false as const, error: "Not authenticated" };
  const form = new FormData();
  form.append("file", file);
  const url = `${getApiUrl()}/audiences/${audienceId}/import-csv`;

  if (onProgress && typeof window !== "undefined" && typeof XMLHttpRequest !== "undefined") {
    return new Promise<
      | { ok: true; data: Record<string, unknown> }
      | { ok: false; error: string }
    >((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", getBasicAuthHeader(credentials));
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
          resolve({ ok: true, data: (json?.data ?? json) as Record<string, unknown> });
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
      headers: {
        Authorization: getBasicAuthHeader(credentials),
      },
      body: form,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) return { ok: false as const, error: json?.error?.message || json?.message || "Upload failed" };
    return { ok: true as const, data: json?.data ?? json };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function searchIntegrationLists(type: "ACTION_NETWORK" | "INTERNAL", query: string) {
  const q = new URLSearchParams({ type, query });
  return request<{ lists: Array<Record<string, unknown>> }>(`/integrations/lists/search?${q}`);
}

export async function syncIntegrationList(input: {
  type: "ACTION_NETWORK" | "INTERNAL";
  listId: string;
  audienceName: string;
  listName?: string;
  query?: string;
}) {
  return request<Record<string, unknown>>("/integrations/lists/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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

export async function createBlast(input: { title: string; audienceId?: string; bodyTemplate: string }) {
  return request<Record<string, unknown>>("/blasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateBlast(
  blastId: string,
  input: { title?: string; audienceId?: string; bodyTemplate?: string },
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

export async function getBlastKpis(blastId: string) {
  return request<Record<string, unknown>>(`/analytics/blasts/${blastId}/kpi`);
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

export async function getBlastActivity(blastId: string, limit = 25, offset = 0) {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<{ rows: Array<Record<string, unknown>>; total: number }>(
    `/analytics/blasts/${blastId}/activity?${q}`,
  );
}

export async function getBlastStatusDistribution(blastId: string) {
  return request<Array<Record<string, unknown>>>(`/analytics/blasts/${blastId}/status-distribution`);
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

export async function getConversation(contactPhone: string) {
  return request<Record<string, unknown>>(`/inbox/conversations/${encodeURIComponent(contactPhone)}`);
}

export async function sendInboxReply(contactPhone: string, body: string) {
  return request<Record<string, unknown>>("/inbox/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactPhone, body }),
  });
}

export async function markConversation(contactPhone: string, resolved: boolean) {
  return request<Record<string, unknown>>(`/inbox/conversations/${encodeURIComponent(contactPhone)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolved }),
  });
}

export async function getAiSuggestions(message: string) {
  const q = new URLSearchParams({ message });
  return request<{ suggestions: string[] }>(`/inbox/ai-suggestions?${q}`);
}

export async function registerPushToken(token: string) {
  return request<Record<string, unknown>>("/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
