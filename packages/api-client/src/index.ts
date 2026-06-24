import type {
  AcceptInviteRequest,
  ApproveJoinRequestRequest,
  AvailabilityResponse,
  ChangeEmailRequest,
  ChangePasswordRequest,
  CheckSessionResponse,
  ConfirmAccessRequest,
  DeleteAccountRequest,
  InvitePreview,
  JoinRequest,
  LoginResponse,
  OkResponse,
  RegisterRequest,
  RejectJoinRequestRequest,
  RequestAccessRequest,
  RequestAccessResponse,
  SessionGrantResponse,
  SessionSummaryResponse,
  UpdateProfileRequest,
  UserAvatarResponse,
  UserProfileResponse,
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
  window.location.assign(`${getAuthAppUrl()}/sign-in?return_to=${returnTo}`);
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
  // FormData sets its own multipart Content-Type (with boundary) — don't override it.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

  // Self-signup → admin approval (public; issue no session).
  requestAccess: (body: RequestAccessRequest) => post<RequestAccessResponse>("/auth/request-access", body),
  confirmAccess: (body: ConfirmAccessRequest) => post<OkResponse>("/auth/request-access/verify", body),
};

// ── Self-service profile + account (prog parity) ─────────────────────
export const profile = {
  get: () => request<UserProfileResponse>("/iam/profile"),
  update: (body: UpdateProfileRequest) =>
    request<UserProfileResponse>("/iam/profile", { method: "PUT", body: JSON.stringify(body) }),

  listAvatars: () => request<UserAvatarResponse[]>("/iam/avatars"),
  addAvatar: (url: string) =>
    request<UserAvatarResponse>("/iam/avatars", { method: "POST", body: JSON.stringify({ url }) }),
  selectAvatar: (id: string) =>
    request<UserAvatarResponse>(`/iam/avatars/${encodeURIComponent(id)}/select`, { method: "POST" }),
  clearSelectedAvatar: () => request<OkResponse>("/iam/avatars/clear-selected", { method: "POST" }),
  deleteAvatar: (id: string) =>
    request<OkResponse>(`/iam/avatars/${encodeURIComponent(id)}`, { method: "DELETE" }),

  setMobile: (mobile: string) =>
    request<OkResponse>("/iam/profile/mobile", { method: "PUT", body: JSON.stringify({ mobile }) }),
  sendMobileCode: () => request<{ challengeId: string }>("/iam/profile/mobile/send", { method: "POST" }),
  verifyMobile: (code: string) =>
    request<OkResponse>("/iam/profile/mobile/verify", { method: "POST", body: JSON.stringify({ code }) }),
  enable2fa: () => request<OkResponse>("/iam/profile/2fa/enable", { method: "POST" }),
  disable2fa: () => request<OkResponse>("/iam/profile/2fa/disable", { method: "POST" }),

  changePassword: (body: ChangePasswordRequest) => post<OkResponse>("/iam/password/change", body),
  changeEmail: (body: ChangeEmailRequest) => post<OkResponse>("/iam/email/change", body),
  deleteAccount: (body: DeleteAccountRequest) => post<OkResponse>("/iam/account/delete", body),

  uploadAvatar: (file: Blob) => {
    const form = new FormData();
    form.append("file", file, "avatar.jpg");
    // No JSON Content-Type — let the browser set the multipart boundary.
    return request<UserAvatarResponse>("/iam/avatars/upload", { method: "POST", body: form });
  },
};

// ── Active-sessions management ───────────────────────────────────────
export const sessions = {
  list: () => request<SessionSummaryResponse[]>("/iam/my-sessions"),
  revoke: (id: string) =>
    request<OkResponse>(`/iam/my-sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  revokeOthers: () => post<OkResponse>("/iam/my-sessions/revoke-others", {}),
};

// ── Tenants (sign-up subdomain check) ────────────────────────────────
export const tenants = {
  checkAvailability: (slug: string) =>
    request<AvailabilityResponse>(`/tenants/availability?slug=${encodeURIComponent(slug)}`, undefined, {
      redirectOn401: false,
    }),

  // Join-request approval queue (admin; session + permission gated).
  listJoinRequests: (tenantId: string, status?: string) =>
    request<JoinRequest[]>(
      `/tenants/${encodeURIComponent(tenantId)}/join-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  approveJoinRequest: (tenantId: string, requestId: string, body: ApproveJoinRequestRequest) =>
    request<OkResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  rejectJoinRequest: (tenantId: string, requestId: string, body: RejectJoinRequestRequest) =>
    request<OkResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/join-requests/${encodeURIComponent(requestId)}/reject`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};

// ── Public marketing-site form intake (meld doc 12) ──────────────────
export interface ContactFormInput {
  name: string;
  email: string;
  company?: string;
  subject?: string;
  message: string;
}
export interface DemoRequestInput {
  name: string;
  email: string;
  company?: string;
  role?: string;
  useCase?: string;
  timeline?: string;
  additionalInfo?: string;
}

export const marketing = {
  contact: (body: ContactFormInput) => post<OkResponse>("/marketing/contact", body),
  demoRequest: (body: DemoRequestInput) => post<OkResponse>("/marketing/demo-request", body),
  newsletter: (email: string) => post<OkResponse>("/marketing/newsletter", { email }),
};
