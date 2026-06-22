import type {
  AcceptInviteRequest,
  CheckSessionResponse,
  InvitePreview,
  LoginResponse,
  OkResponse,
  RegisterRequest,
  SessionGrantResponse,
} from "@yarns/contracts";

export * from "@yarns/contracts";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** API base URL — runtime window override wins, else NEXT_PUBLIC_API_URL. */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __API_URL__?: string }).__API_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
}

/** Standalone auth app origin — where unauthenticated callers are sent to log in. */
export function getAuthAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __AUTH_APP_URL__?: string }).__AUTH_APP_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.href);
  window.location.assign(`${getAuthAppUrl()}/login?return_to=${returnTo}`);
}

/**
 * Cookie-based request wrapper (meld doc 14). Sends the httpOnly session cookie
 * via `credentials: "include"` — no Authorization header. A 401 means the session
 * is gone: bounce to the auth app (unless the caller opts out, e.g. auth flows
 * that surface the error inline).
 */
export async function request<T>(
  path: string,
  init?: RequestInit,
  opts: { redirectOn401?: boolean } = {},
): Promise<ApiResult<T>> {
  const { redirectOn401 = true } = opts;
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: T; error?: { message?: string } | string; message?: string }
      | null;
    if (!res.ok) {
      if (res.status === 401 && redirectOn401) redirectToLogin();
      const err = json?.error;
      const message =
        (typeof err === "object" ? err?.message : err) || json?.message || `Request failed (${res.status})`;
      return { ok: false, error: String(message) };
    }
    const data = (json && typeof json === "object" && "data" in json ? json.data : json) as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  // Auth flows surface their own errors (e.g. wrong password) — never auto-redirect.
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, { redirectOn401: false });
}

// ── Auth flows (meld doc 14) ─────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    post<LoginResponse>("/iam/sessions", { email, password }),
  register: (body: RegisterRequest) => post<SessionGrantResponse>("/auth/register", body),
  logout: () => request<OkResponse>("/iam/sessions", { method: "DELETE" }, { redirectOn401: false }),
  checkSession: () => request<CheckSessionResponse>("/auth/check", undefined, { redirectOn401: false }),

  requestMagicLink: (email: string) => post<OkResponse>("/iam/magic-link", { email }),
  consumeMagicLink: (token: string) => post<SessionGrantResponse>("/iam/magic-link/consume", { token }),

  forgotPassword: (email: string) => post<OkResponse>("/iam/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    post<OkResponse>("/iam/reset-password", { token, password }),

  sendEmailVerification: (email: string) => post<OkResponse>("/iam/verify-email/send", { email }),
  confirmEmailVerification: (email: string, code: string) =>
    post<OkResponse>("/iam/verify-email/confirm", { email, code }),

  send2fa: (challengeId: string) => post<OkResponse>("/iam/2fa/send", { challengeId }),
  verify2fa: (challengeId: string, code: string) =>
    post<SessionGrantResponse>("/iam/2fa/verify", { challengeId, code }),

  previewInvite: (token: string) =>
    request<InvitePreview>(`/iam/invite/${encodeURIComponent(token)}`, undefined, { redirectOn401: false }),
  acceptInvite: (body: AcceptInviteRequest) => post<SessionGrantResponse>("/iam/invite/accept", body),

  selectTenant: (tenantId: string) => post<OkResponse>("/iam/select-tenant", { tenantId }),
};
