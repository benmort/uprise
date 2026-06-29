import type {
  AcceptInviteRequest,
  ApproveJoinRequestRequest,
  AvailabilityResponse,
  ChangeEmailRequest,
  ChangePasswordRequest,
  CheckSessionResponse,
  ConfirmAccessByPhoneRequest,
  ConfirmAccessRequest,
  DeleteAccountRequest,
  InvitePreview,
  JoinRequest,
  LoginResponse,
  OkResponse,
  RegisterRequest,
  RejectJoinRequestRequest,
  RequestAccessByPhoneRequest,
  RequestAccessRequest,
  RequestAccessResponse,
  SessionGrantResponse,
  SessionSummaryResponse,
  UpdateProfileRequest,
  UserAvatarResponse,
  UserProfileResponse,
} from "@uprise/contracts";

export * from "@uprise/contracts";

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
  opts: { redirectOn401?: boolean; captchaToken?: string } = {},
): Promise<ApiResult<T>> {
  const { redirectOn401 = true, captchaToken } = opts;
  // FormData sets its own multipart Content-Type (with boundary) — don't override it.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(captchaToken ? { "cf-turnstile-response": captchaToken } : {}),
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

function post<T>(path: string, body: unknown, captchaToken?: string): Promise<ApiResult<T>> {
  // Auth flows surface their own errors (e.g. wrong password) — never auto-redirect.
  // captchaToken (when present) rides as the cf-turnstile-response header for the API guard.
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, { redirectOn401: false, captchaToken });
}

// ── Auth flows (meld doc 14) ─────────────────────────────────────────
export const auth = {
  login: (email: string, password: string, captchaToken?: string) =>
    post<LoginResponse>("/iam/sessions", { email, password }, captchaToken),
  register: (body: RegisterRequest, captchaToken?: string) =>
    post<SessionGrantResponse>("/auth/register", body, captchaToken),
  logout: () => request<OkResponse>("/iam/sessions", { method: "DELETE" }, { redirectOn401: false }),
  checkSession: () => request<CheckSessionResponse>("/auth/check", undefined, { redirectOn401: false }),

  requestMagicLink: (email: string, captchaToken?: string) =>
    post<OkResponse>("/iam/magic-link", { email }, captchaToken),
  consumeMagicLink: (token: string) => post<SessionGrantResponse>("/iam/magic-link/consume", { token }),

  forgotPassword: (email: string, captchaToken?: string) =>
    post<OkResponse>("/iam/forgot-password", { email }, captchaToken),
  resetPassword: (token: string, password: string, captchaToken?: string) =>
    post<OkResponse>("/iam/reset-password", { token, password }, captchaToken),

  sendEmailVerification: (email: string, captchaToken?: string) =>
    post<OkResponse>("/iam/verify-email/send", { email }, captchaToken),
  confirmEmailVerification: (email: string, code: string) =>
    post<OkResponse>("/iam/verify-email/confirm", { email, code }),

  send2fa: (challengeId: string, captchaToken?: string) =>
    post<OkResponse>("/iam/2fa/send", { challengeId }, captchaToken),
  verify2fa: (challengeId: string, code: string) =>
    post<SessionGrantResponse>("/iam/2fa/verify", { challengeId, code }),

  // Phone-first passwordless login (volunteers/canvassers): start sends an SMS code,
  // verify completes the session. Start/resend never reveal whether a number exists.
  phoneStart: (phone: string, captchaToken?: string) =>
    post<{ challengeId: string }>("/iam/phone/start", { phone }, captchaToken),
  phoneResend: (challengeId: string, captchaToken?: string) =>
    post<{ challengeId: string }>("/iam/phone/resend", { challengeId }, captchaToken),
  phoneVerify: (challengeId: string, code: string) =>
    post<SessionGrantResponse>("/iam/phone/verify", { challengeId, code }),

  previewInvite: (token: string) =>
    request<InvitePreview>(`/iam/invite/${encodeURIComponent(token)}`, undefined, { redirectOn401: false }),
  acceptInvite: (body: AcceptInviteRequest) => post<SessionGrantResponse>("/iam/invite/accept", body),

  selectTenant: (tenantId: string) => post<OkResponse>("/iam/select-tenant", { tenantId }),

  // Self-signup → admin approval (public; issue no session).
  requestAccess: (body: RequestAccessRequest, captchaToken?: string) =>
    post<RequestAccessResponse>("/auth/request-access", body, captchaToken),
  confirmAccess: (body: ConfirmAccessRequest) => post<OkResponse>("/auth/request-access/verify", body),

  // Phone-first self-signup → admin approval (volunteers).
  requestAccessByPhone: (body: RequestAccessByPhoneRequest, captchaToken?: string) =>
    post<RequestAccessResponse>("/auth/request-access/phone", body, captchaToken),
  confirmAccessByPhone: (body: ConfirmAccessByPhoneRequest) =>
    post<OkResponse>("/auth/request-access/phone/verify", body),
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
  sendMobileCode: (captchaToken?: string) =>
    request<{ challengeId: string }>("/iam/profile/mobile/send", { method: "POST" }, { captchaToken }),
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

// ── Tenant members + invitations (admin; manage tenant.member/.invitation) ──
/**
 * Membership/invitation role. Mirrors the @uprise/db `AppUserRole` enum as a string
 * union so the client bundle never pulls in the Prisma runtime. The API validates
 * against the real enum, so any drift here is caught server-side (400).
 */
export type AppUserRole = "OWNER" | "ORGANISER" | "VOLUNTEER";

/** A tenant's membership row (AppUserRole: OWNER | ORGANISER | VOLUNTEER). */
export interface TenantMemberSummary {
  id: string;
  tenantId: string;
  userId: string;
  role: AppUserRole;
  addedBy: string | null;
  createdAt: string;
  user: { email: string; displayName: string | null };
}

/** A pending/expired/revoked invitation row. */
export interface TenantInvitationSummary {
  id: string;
  tenantId: string;
  email: string;
  role: AppUserRole;
  status: string;
  token: string | null;
  expiresAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

// ── Tenants (sign-up subdomain check) ────────────────────────────────
/** Minimal tenant shape returned by create (enough to switch into it). */
export interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
}

/** A tenant row from the super-admin all-tenants search. */
export interface TenantSearchRow {
  id: string;
  slug: string;
  name: string;
  networkId: string | null;
}

/** Full tenant record returned by GET /tenants/:id. */
export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  networkId: string | null;
  createdAt: string;
}

export const tenants = {
  checkAvailability: (slug: string) =>
    request<AvailabilityResponse>(`/tenants/availability?slug=${encodeURIComponent(slug)}`, undefined, {
      redirectOn401: false,
    }),

  /** Self-serve create from the in-app switcher (owner-on-paid-plan or super-admin; API enforces). */
  createSelfServe: (body: { name: string; slug: string }) =>
    request<CreatedTenant>("/tenants/self-serve", { method: "POST", body: JSON.stringify(body) }),

  /** Super-admin search across ALL tenants (API enforces isSuperAdmin). */
  search: (q?: string) =>
    request<TenantSearchRow[]>(`/tenants/search${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  /** Load one tenant by id (read tenant.tenant). */
  get: (tenantId: string) => request<TenantRecord>(`/tenants/${encodeURIComponent(tenantId)}`),

  /** Rename / re-slug a tenant (manage tenant.tenant: owner or super-admin). */
  update: (tenantId: string, body: { name?: string; slug?: string }) =>
    request<TenantRecord>(`/tenants/${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  /** Soft-delete a tenant (manage tenant.tenant; UI restricts to super-admin). */
  remove: (tenantId: string) =>
    request<OkResponse>(`/tenants/${encodeURIComponent(tenantId)}`, { method: "DELETE" }),

  /** Add an existing user (by email) to a tenant (manage tenant.member). */
  addMember: (tenantId: string, body: { email: string; role: AppUserRole }) =>
    request<TenantMemberSummary>(`/tenants/${encodeURIComponent(tenantId)}/members`, {
      method: "POST",
      body: JSON.stringify(body),
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

  // Members — manage tenant.member.
  listMembers: (tenantId: string) =>
    request<TenantMemberSummary[]>(`/tenants/${encodeURIComponent(tenantId)}/members`),
  updateMemberRole: (tenantId: string, userId: string, role: AppUserRole) =>
    request<TenantMemberSummary>(
      `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),
  removeMember: (tenantId: string, userId: string) =>
    request<OkResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),

  // Invitations — manage tenant.invitation.
  listInvitations: (tenantId: string) =>
    request<TenantInvitationSummary[]>(`/tenants/${encodeURIComponent(tenantId)}/invitations`),
  createInvitation: (tenantId: string, body: { email: string; role: AppUserRole }) =>
    request<{ id: string; token: string }>(
      `/tenants/${encodeURIComponent(tenantId)}/invitations`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  revokeInvitation: (tenantId: string, invitationId: string) =>
    request<OkResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
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
  contact: (body: ContactFormInput, captchaToken?: string) =>
    post<OkResponse>("/marketing/contact", body, captchaToken),
  demoRequest: (body: DemoRequestInput, captchaToken?: string) =>
    post<OkResponse>("/marketing/demo-request", body, captchaToken),
  newsletter: (email: string, captchaToken?: string) =>
    post<OkResponse>("/marketing/newsletter", { email }, captchaToken),
};

// ── Public pricing (no auth) — the marketing pricing page ────────────
/** A row in a plan's public feature table: a tick (boolean) or a value (string). */
export interface PublicPlanFeature {
  label: string;
  value: boolean | string;
}
/** Per-plan usage limits; a null member means unlimited. */
export interface PublicPlanLimits {
  contacts: number | null;
  teamMembers: number | null;
  segments: number | null;
}
/** A publicly-visible subscription plan as rendered on the marketing pricing page. */
export interface PublicPlan {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  popular: boolean;
  order: number;
  priceMonthly: number | null;
  priceMonthlyOriginal: number | null;
  priceAnnually: number | null;
  priceAnnuallyOriginal: number | null;
  limits: PublicPlanLimits | null;
  features: PublicPlanFeature[] | null;
}

export const plans = {
  /** Publicly-visible, non-archived plans, ordered by tier (no auth). */
  listPublic: () => request<PublicPlan[]>("/plans/public", undefined, { redirectOn401: false }),
};
