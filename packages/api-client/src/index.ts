import type {
  AcceptInviteRequest,
  InviteStartPhoneRequest,
  OpenJoinAcceptRequest,
  OpenJoinStartPhoneRequest,
  OpenJoinPreview,
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
  TenantOnboarding,
  TenantOnboardingPatch,
  UpdateProfileRequest,
  UserAvatarResponse,
  UserProfileResponse,
} from "@uprise/contracts";

export * from "@uprise/contracts";

/** `status` is set for HTTP-level failures (e.g. 403 → render a no-permission
 *  state instead of a generic error); absent on network/parse failures. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

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

/** Action app origin — where a freshly-joined volunteer lands after onboarding. */
export function getActionAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __ACTION_APP_URL__?: string }).__ACTION_APP_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_ACTION_APP_URL || "http://localhost:3004";
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
      return { ok: false, error: String(message), status: res.status };
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
  /** Mid-flow OTP check for the onboarding wizard — validates the code without a session. */
  phoneCheck: (challengeId: string, code: string) =>
    post<{ ok: true }>("/iam/phone/check", { challengeId, code }),

  // DEV-ONLY: read back the plaintext OTP for a challenge so the SMS-code screens
  // can show it on-screen in local development (the API returns null in production).
  devPeekOtp: (challengeId: string) =>
    request<{ code: string | null; smsSent: boolean }>(
      `/iam/dev/otp?challengeId=${encodeURIComponent(challengeId)}`,
      undefined,
      { redirectOn401: false },
    ),

  previewInvite: (token: string) =>
    request<InvitePreview>(`/iam/invite/${encodeURIComponent(token)}`, undefined, { redirectOn401: false }),
  // Onboarding wizard: send an OTP to an invited number (token-gated).
  inviteStartPhone: (body: InviteStartPhoneRequest, captchaToken?: string) =>
    post<{ challengeId: string }>("/iam/invite/phone/start", body, captchaToken),
  acceptInvite: (body: AcceptInviteRequest) => post<SessionGrantResponse>("/iam/invite/accept", body),

  // Tokenless open-join (per-campaign): same wizard, no token – gated by the campaign flag.
  openJoinPreview: (campaignId: string) =>
    request<OpenJoinPreview>(`/iam/open-join/${encodeURIComponent(campaignId)}`, undefined, { redirectOn401: false }),
  // The generic /volunteer board – every open-join opportunity (same item shape).
  openJoinList: () =>
    request<OpenJoinPreview[]>("/iam/open-join/opportunities", undefined, { redirectOn401: false }),
  openJoinStartPhone: (body: OpenJoinStartPhoneRequest, captchaToken?: string) =>
    post<{ challengeId: string }>("/iam/open-join/phone/start", body, captchaToken),
  openJoinAccept: (body: OpenJoinAcceptRequest) => post<SessionGrantResponse>("/iam/open-join/accept", body),

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
// ── Org profile + branding (tenant.OrgProfile) ──────────────────────────────
export interface OrgContactRecord {
  id: string;
  orgProfileId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  title: string | null;
  role: string | null;
  contactType: string | null;
  isPrimaryContact: boolean;
  isAuthorisedSignatory: boolean;
}
export interface OrgAddressRecord {
  id: string;
  orgProfileId: string;
  addressType: string | null;
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
}
export interface OrgCredentialRecord {
  legalTradingName: string | null;
  australianBusinessNumber: string | null;
  australianCompanyNumber: string | null;
  industry: string | null;
  entityType: string | null;
  registrationNumber: string | null;
  isRegisteredEntity: boolean;
  acncRegistrationNumber: string | null;
  acncStatus: string | null;
  charitySubtype: string | null;
  deductibleGiftRecipient: boolean;
  dgrStatus: string | null;
  financialYearEnd: string | null;
  /** TFN is never returned; only whether one is stored. */
  hasTaxFileNumber: boolean;
}
export interface OrgProfileRecord {
  id: string;
  tenantId: string;
  name: string;
  bio: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  logoBlockUrl: string | null;
  logoLandscapeUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
  contacts: OrgContactRecord[];
  addresses: OrgAddressRecord[];
  credential: OrgCredentialRecord | null;
}
/** Name + brand fields; a `null` clears a field, omission leaves it. */
export type OrgProfileUpdate = Partial<{
  name: string;
  bio: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  logoBlockUrl: string | null;
  logoLandscapeUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
}>;
export type OrgContactInput = Partial<Omit<OrgContactRecord, "id" | "orgProfileId">>;
export type OrgAddressInput = Partial<Omit<OrgAddressRecord, "id" | "orgProfileId">>;
/** Credential edit; `taxFileNumber` "" clears, undefined leaves, value encrypts server-side. */
export type OrgCredentialInput = Partial<Omit<OrgCredentialRecord, "hasTaxFileNumber">> & {
  taxFileNumber?: string | null;
};

export const orgProfile = {
  get: () => request<OrgProfileRecord>("/org-profile"),
  update: (body: OrgProfileUpdate) =>
    request<OrgProfileRecord>("/org-profile", { method: "PATCH", body: JSON.stringify(body) }),
  setCredential: (body: OrgCredentialInput) =>
    request<OrgCredentialRecord>("/org-profile/credential", { method: "PUT", body: JSON.stringify(body) }),
  addContact: (body: OrgContactInput) =>
    request<OrgContactRecord>("/org-profile/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, body: OrgContactInput) =>
    request<OrgContactRecord>(`/org-profile/contacts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteContact: (id: string) =>
    request<OkResponse>(`/org-profile/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addAddress: (body: OrgAddressInput) =>
    request<OrgAddressRecord>("/org-profile/addresses", { method: "POST", body: JSON.stringify(body) }),
  updateAddress: (id: string, body: OrgAddressInput) =>
    request<OrgAddressRecord>(`/org-profile/addresses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAddress: (id: string) =>
    request<OkResponse>(`/org-profile/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

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
/** A tenant's public brand — logo (landscape preferred, block fallback), colours, custom CSS. */
export interface TenantBrandFields {
  logoLandscapeUrl: string | null;
  logoBlockUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
}
export type TenantBrand = { id: string; name: string } & TenantBrandFields;

/** The logo to render for a tenant: landscape preferred, block as fallback, null if neither. */
export function tenantLogoUrl(
  b: { logoLandscapeUrl?: string | null; logoBlockUrl?: string | null } | null | undefined,
): string | null {
  return b?.logoLandscapeUrl ?? b?.logoBlockUrl ?? null;
}

export interface TenantSearchRow {
  id: string;
  slug: string;
  name: string;
  networkId: string | null;
  logoLandscapeUrl: string | null;
  logoBlockUrl: string | null;
}

/** Full tenant record returned by GET /tenants/:id. */
export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  networkId: string | null;
  createdAt: string;
  /** Free-form settings blob (e.g. access-control policy under `accessControl`). */
  settings: Record<string, unknown> | null;
  /** Parent network + its plan (read-only), when the tenant belongs to one. */
  network: { id: string; name: string; planName: string | null } | null;
}

export const tenants = {
  checkAvailability: (slug: string) =>
    request<AvailabilityResponse>(`/tenants/availability?slug=${encodeURIComponent(slug)}`, undefined, {
      redirectOn401: false,
    }),

  /** Public tenant brand (id, name, logo, colours, custom CSS) by slug for the volunteer auth panel. */
  brandBySlug: (slug: string) =>
    request<TenantBrand | null>(
      `/tenants/brand?slug=${encodeURIComponent(slug)}`,
      undefined,
      { redirectOn401: false },
    ),

  /** Self-serve create from the in-app switcher (owner-on-paid-plan or super-admin; API enforces). */
  createSelfServe: (body: { name: string; slug: string }) =>
    request<CreatedTenant>("/tenants/self-serve", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Self-serve SOFT-delete of the caller's active workspace (owner-gated, password re-auth; API
   * enforces). `nextTenantId` is another live workspace the owner administers, so the UI can switch
   * them there instead of signing out; null when they administer nowhere else.
   */
  deleteSelf: (body: { password: string }) =>
    request<{ ok: true; nextTenantId: string | null }>("/tenants/self-serve/delete", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Super-admin search across ALL tenants (API enforces isSuperAdmin). */
  search: (q?: string) =>
    request<TenantSearchRow[]>(`/tenants/search${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  /** Load one tenant by id (read tenant.tenant). */
  get: (tenantId: string) => request<TenantRecord>(`/tenants/${encodeURIComponent(tenantId)}`),

  /** Rename / re-slug / re-configure a tenant (manage tenant.tenant: owner or super-admin). */
  update: (tenantId: string, body: { name?: string; slug?: string; settings?: Record<string, unknown> }) =>
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

  // Organiser getting-started progress — read tenant.org-profile / manage to patch.
  getOnboarding: (tenantId: string) =>
    request<TenantOnboarding>(`/tenants/${encodeURIComponent(tenantId)}/onboarding`),
  updateOnboarding: (tenantId: string, body: TenantOnboardingPatch) =>
    request<TenantOnboarding>(`/tenants/${encodeURIComponent(tenantId)}/onboarding`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
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

// ── Telephony (per-tenant Twilio numbers + provisioning) ─────────────
export type TelephonyProvisioningStatus =
  | "REQUESTED"
  | "SUBACCOUNT_CREATED"
  | "COMPLIANCE_DRAFT"
  | "COMPLIANCE_SUBMITTED"
  | "COMPLIANCE_APPROVED"
  | "COMPLIANCE_REJECTED"
  | "NUMBER_PURCHASED"
  | "WEBHOOKS_CONFIGURED"
  | "ACTIVE"
  | "FAILED";

export interface TelephonyComplianceInput {
  legalName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  businessNumber?: string;
  address: { street: string; city: string; region: string; postalCode: string };
}

export interface TelephonyProvisioningRun {
  id: string;
  tenantId: string;
  campaignId: string | null;
  accountId: string | null;
  status: TelephonyProvisioningStatus;
  resumeStatus: TelephonyProvisioningStatus | null;
  bundleSid: string | null;
  phoneNumberId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelephonyProvisioningStep {
  id: string;
  runId: string;
  step: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  detail: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export interface TelephonyPhoneNumber {
  id: string;
  tenantId: string;
  campaignId: string | null;
  phoneNumberE164: string;
  purpose: string;
  status: "PENDING" | "ACTIVE" | "RELEASED";
  createdAt: string;
}

export const telephony = {
  /** Super-admin: start an automated provisioning run for a tenant (or campaign). */
  startRun: (body: {
    tenantId: string;
    campaignId?: string;
    mode: "SUBACCOUNT" | "BYO";
    byoAccountSid?: string;
    byoAuthToken?: string;
    friendlyName?: string;
    complianceInput: TelephonyComplianceInput;
  }) => request<TelephonyProvisioningRun>("/telephony/provisioning-runs", { method: "POST", body: JSON.stringify(body) }),

  /** Super-admin: attach a compliance document (multipart). */
  uploadDocument: (runId: string, file: File, type: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    return request<TelephonyProvisioningRun>(`/telephony/provisioning-runs/${encodeURIComponent(runId)}/documents`, {
      method: "POST",
      body: form,
    });
  },

  retryRun: (runId: string) =>
    request<TelephonyProvisioningRun>(`/telephony/provisioning-runs/${encodeURIComponent(runId)}/retry`, { method: "POST" }),

  resubmitRun: (runId: string, complianceInput?: TelephonyComplianceInput) =>
    request<TelephonyProvisioningRun>(`/telephony/provisioning-runs/${encodeURIComponent(runId)}/resubmit`, {
      method: "POST",
      body: JSON.stringify({ complianceInput }),
    }),

  /** Runs for a tenant (owner sees own tenant; super-admin any). */
  listRuns: (tenantId?: string) =>
    request<TelephonyProvisioningRun[]>(`/telephony/provisioning-runs${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),

  /** One run + its full step timeline. */
  getRun: (runId: string) =>
    request<TelephonyProvisioningRun & { steps: TelephonyProvisioningStep[] }>(
      `/telephony/provisioning-runs/${encodeURIComponent(runId)}`,
    ),

  listNumbers: (tenantId?: string) =>
    request<TelephonyPhoneNumber[]>(`/telephony/numbers${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),

  releaseNumber: (numberId: string) =>
    request<TelephonyPhoneNumber>(`/telephony/numbers/${encodeURIComponent(numberId)}/release`, { method: "POST" }),
};

// ── Email identities (per-tenant SendGrid subusers + domain auth) ────
export type EmailProvisioningStatus =
  | "REQUESTED"
  | "SUBUSER_CREATED"
  | "DOMAIN_AUTH_CREATED"
  | "DNS_CONFIGURED"
  | "VALIDATION_FAILED"
  | "DOMAIN_VERIFIED"
  | "WEBHOOKS_CONFIGURED"
  | "ACTIVE"
  | "FAILED";

export interface EmailDnsRecord {
  record: string;
  host: string;
  type: string;
  data: string;
  valid: boolean;
}

export interface EmailSenderIdentity {
  id: string;
  tenantId: string;
  campaignId: string | null;
  kind: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";
  domain: string;
  fromEmail: string;
  fromName: string;
  dnsRecords: EmailDnsRecord[] | null;
  purpose: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  createdAt: string;
}

export interface EmailProvisioningRun {
  id: string;
  tenantId: string;
  campaignId: string | null;
  identityId: string | null;
  status: EmailProvisioningStatus;
  resumeStatus: EmailProvisioningStatus | null;
  input: { kind?: string; mode?: string; slug?: string; domain?: string } & Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailProvisioningStep {
  id: string;
  runId: string;
  step: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  detail: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export const emailProvisioning = {
  /** Super-admin: start an automated identity-provisioning run for a tenant (or campaign). */
  startRun: (body: {
    tenantId: string;
    campaignId?: string;
    mode: "SUBUSER" | "BYO";
    kind: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";
    slug?: string;
    domain?: string;
    fromLocalPart: string;
    fromName: string;
    purpose?: string;
    byoApiKey?: string;
  }) => request<EmailProvisioningRun>("/email-provisioning/runs", { method: "POST", body: JSON.stringify(body) }),

  retryRun: (runId: string) =>
    request<EmailProvisioningRun>(`/email-provisioning/runs/${encodeURIComponent(runId)}/retry`, { method: "POST" }),

  /** Re-check DNS validation now (custom domains after the tenant adds records). */
  validateRun: (runId: string) =>
    request<EmailProvisioningRun>(`/email-provisioning/runs/${encodeURIComponent(runId)}/validate`, { method: "POST" }),

  listRuns: (tenantId?: string) =>
    request<EmailProvisioningRun[]>(`/email-provisioning/runs${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),

  getRun: (runId: string) =>
    request<EmailProvisioningRun & { steps: EmailProvisioningStep[] }>(
      `/email-provisioning/runs/${encodeURIComponent(runId)}`,
    ),

  listIdentities: (tenantId?: string) =>
    request<EmailSenderIdentity[]>(`/email-provisioning/identities${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),

  revokeIdentity: (identityId: string) =>
    request<EmailSenderIdentity>(`/email-provisioning/identities/${encodeURIComponent(identityId)}/revoke`, { method: "POST" }),
};
