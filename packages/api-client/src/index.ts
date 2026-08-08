import type {
  AcceptInviteRequest,
  ActionPageRecord,
  ActionPageResults,
  ActionPageStatusValue,
  CreateActionRsvpRequest,
  CreateActionRsvpResponse,
  CreateCallSessionRequest,
  CreateCallSessionResponse,
  ListActionPagesResponse,
  PublicActionPagePayload,
  PublicTargetIdentity,
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
  RegisterResponse,
  RejectJoinRequestRequest,
  RequestAccessByPhoneRequest,
  RequestAccessRequest,
  RequestAccessResponse,
  SessionGrantResponse,
  SessionSummaryResponse,
  TenantOnboarding,
  TenantOnboardingPatch,
  TenantSetupState,
  UpdateProfileRequest,
  UserAvatarResponse,
  UserProfileResponse,
} from "@uprise/contracts";

export * from "@uprise/contracts";

/** A failure carries exactly one discriminant, and they mean different things to a user:
 *
 *  - `status` – the API answered with an HTTP error (e.g. 403 → render a no-permission
 *    state instead of a generic error). The call definitely landed.
 *  - `networkError` – the request definitively never left the browser: offline, DNS/TLS,
 *    a CORS refusal, an extension or filter blocking it. Nothing reached the server, so
 *    it is safe to tell the user nothing changed and to retry. `error` then holds the
 *    browser's own string ("Failed to fetch", "Load failed"), which means nothing to a
 *    user – branch on the flag and write your own copy.
 *  - `timedOut` – we gave up waiting. Deliberately NOT `networkError`: the request may
 *    well have reached the API and committed (a slow invite accept still creates the user,
 *    the membership and the session). Never tell a timed-out user nothing has changed –
 *    point them at signing in as well as retrying.
 *  - `aborted` – the caller cancelled (unmount, latest-wins). Not a failure to report:
 *    the user navigated away.
 *
 *  A 2xx whose body will not parse is NOT a failure here: it resolves as
 *  `{ ok: true, data: null }`, because an empty body is the normal shape of a 204 and of
 *  every DELETE endpoint we have. Callers that require a body must check `data`. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      status?: number;
      networkError?: boolean;
      timedOut?: boolean;
      aborted?: boolean;
    };

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

/** Login path on the auth app. Defaults to the organiser `/sign-in`; an app can override it at
 *  runtime (`window.__LOGIN_PATH__`) — e.g. the field PWA points volunteers at the branded
 *  `/volunteer/sign-in`. */
function getLoginPath(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __LOGIN_PATH__?: string }).__LOGIN_PATH__;
    if (runtime) return runtime;
  }
  return "/sign-in";
}

/** Tenant slug to brand the login page, when the app knows which org the caller belongs to
 *  (`window.__LOGIN_ORG__`). The auth volunteer flow reads `?org=<slug>` to brand the sign-in. */
function getLoginOrg(): string | null {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __LOGIN_ORG__?: string }).__LOGIN_ORG__;
    if (runtime) return runtime;
  }
  return null;
}

/** Build the auth-app login URL: `<auth>/<path>?[org=<slug>&]return_to=<url>`. Shared by the
 *  401 auto-redirect here and the apps' own logout/session-expiry redirects. */
export function loginRedirectUrl(returnTo: string): string {
  const org = getLoginOrg();
  const params = new URLSearchParams();
  if (org) params.set("org", org);
  params.set("return_to", returnTo);
  return `${getAuthAppUrl()}${getLoginPath()}?${params.toString()}`;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  window.location.assign(loginRedirectUrl(window.location.href));
}

/** Default ceiling on a single call. Without one, a request that opens a socket and
 *  never answers leaves the UI spinning forever – the invite "Joining…" button had no
 *  path back. Multipart gets a longer leash because an upload legitimately streams
 *  for a while on a weak connection. Endpoints that do real synchronous work (walk-list
 *  rebuilds, universe loads, segment generation/compilation) must raise their own via
 *  `opts.timeoutMs` – 30s is a UI-responsiveness default, not a claim about the server. */
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** The abort reason as a readable string, for a caller that cancelled before we dispatched. */
function abortReason(signal: AbortSignal): string {
  const reason = (signal as { reason?: unknown }).reason;
  return reason instanceof Error && reason.message ? reason.message : "The request was cancelled.";
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
  opts: { redirectOn401?: boolean; captchaToken?: string; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { redirectOn401 = true, captchaToken } = opts;
  // FormData sets its own multipart Content-Type (with boundary) — don't override it.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const callerSignal = init?.signal;
  // Already cancelled: dispatching would burn a request nobody is waiting for, and the
  // result would be reported as a transport failure the user never caused.
  if (callerSignal?.aborted) {
    return { ok: false, error: abortReason(callerSignal), aborted: true };
  }
  // Our timeout has to compose with the caller's signal (unmount / latest-wins
  // cancellation), not replace it: whichever aborts first wins.
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  callerSignal?.addEventListener("abort", abort);
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
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
    // A 2xx carrying an ERROR envelope is still a failure. The API expresses "accepted, still
    // computing" by throwing ApiHttpException(…, 202) — a success status with an `{error:{…}}`
    // body — and the bare-payload fallback below then handed that envelope back AS the payload.
    // Callers reading a field off it got `undefined.<field>` and took the page down with them
    // (the targeting map's HEAT_QUEUED did exactly this). Arrays are excluded: a bare array
    // response is a legitimate payload, not an envelope.
    if (
      json &&
      typeof json === "object" &&
      !Array.isArray(json) &&
      "error" in json &&
      !("data" in json)
    ) {
      const err = json.error;
      const message =
        (typeof err === "object" ? err?.message : err) || json.message || `Request failed (${res.status})`;
      return { ok: false, error: String(message), status: res.status };
    }
    // No `data` key ⇒ the body IS the payload (endpoints that answer bare, e.g. arrays).
    const data = (json && typeof json === "object" && "data" in json ? json.data : json) as T;
    return { ok: true, data };
  } catch (error) {
    // fetch only rejects when no response arrived, but the three ways that happens need
    // different copy, so they get different flags rather than one `networkError`.
    // Timeout first: our own abort fires the same AbortError the caller's would.
    if (timedOut) {
      return {
        ok: false,
        error: `The request timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
        timedOut: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    // The caller cancelled mid-flight – their intent, not a broken connection.
    if (callerSignal?.aborted) return { ok: false, error: message, aborted: true };
    return { ok: false, error: message, networkError: true };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
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
    post<RegisterResponse>("/auth/register", body, captchaToken),
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
  /** Mid-flow OTP check for the onboarding wizard — validates the code without a session.
   *  `existingUser` (revealed only post-verify) lets the wizard log a returning volunteer
   *  straight in instead of re-running signup. */
  phoneCheck: (challengeId: string, code: string) =>
    post<{ ok: true; existingUser: boolean }>("/iam/phone/check", { challengeId, code }),

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
  openJoinList: (tenantSlug?: string) =>
    request<OpenJoinPreview[]>(
      `/iam/open-join/opportunities${tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ""}`,
      undefined,
      { redirectOn401: false },
    ),
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

/**
 * A pending/expired/revoked invitation row.
 *
 * No `token`: it is a bearer credential granting membership at the invited role, so the list
 * endpoint deliberately withholds it. `createInvitation` returns it once, to the issuer.
 */
export interface TenantInvitationSummary {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  role: AppUserRole;
  status: string;
  expiresAt: string | null;
  invitedBy: string | null;
  invitedChannel: string | null;
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

/** Super-admin-set tenant lifecycle (see the API's TenantStatus enum). */
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface TenantSearchRow {
  id: string;
  slug: string;
  name: string;
  networkId: string | null;
  /** Lifecycle status + the network's plan — the status pill in the super-admin listing. */
  status: TenantStatus;
  planName: string | null;
  logoLandscapeUrl: string | null;
  logoBlockUrl: string | null;
}

/** Full tenant record returned by GET /tenants/:id. */
export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
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
  update: (
    tenantId: string,
    body: { name?: string; slug?: string; status?: TenantStatus; settings?: Record<string, unknown> },
  ) =>
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
  // Exactly one of email / phone. Phone invites are delivered by SMS and accepted
  // via the volunteer phone-first flow (the invite link runs the phone signup).
  createInvitation: (
    tenantId: string,
    body: {
      email?: string;
      phone?: string;
      role: AppUserRole;
      message?: string;
      subject?: string;
      firstName?: string;
      /** What the volunteer is invited to do — branches the onboarding wizard. */
      invitedChannel?: "DOOR" | "SMS" | "BOTH";
    },
  ) =>
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

  /** Role-layered setup state (the getting-started successor) — flows, chips and gates. */
  getSetup: (tenantId: string) =>
    request<TenantSetupState>(`/tenants/${encodeURIComponent(tenantId)}/setup`),
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

// ── Platform status (public status page) ─────────────────────────────
/** `Unknown` means the check could not be made — not that the service is fine. */
export type PublicServiceStatus = "Operational" | "Degraded" | "Outage" | "Unknown";

/** One day of the 90-day bar; `none` is a day with no recorded checks. */
export type PublicDay = { date: string; state: "up" | "partial" | "down" | "none" };

export type PublicIncident = {
  id: string;
  serviceName: string;
  status: string;
  startedAt: string;
  /** Null while the incident is still open. */
  resolvedAt: string | null;
  minutes: number;
};

export type PublicStatus = {
  ok: boolean;
  summary: string;
  services: Array<{
    key: string;
    name: string;
    status: PublicServiceStatus;
    /** Operational share of the last 90 days' checks; null when nothing was recorded. */
    uptime90d: number | null;
  }>;
  days: PublicDay[];
  incidents: PublicIncident[];
  at: string;
};

export const platformStatus = {
  /**
   * Public platform status (no auth). Rolled up server-side to named services and a word each —
   * the internal view, with deploy shas and project names, is a separate super-admin endpoint.
   */
  publicStatus: () =>
    request<PublicStatus>("/platform-status/public", undefined, { redirectOn401: false }),
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
  /** Legal structure, mapped to the Twilio bundle's business type where one applies. */
  entityType?: string;
  address: { street: string; city: string; region: string; postalCode: string };
}

/** Org KYC → the email sender-identity form; the twin of TelephonyComplianceInput. */
export interface EmailSenderPrefill {
  fromName: string;
  replyToEmail: string;
  /** SendGrid requires a physical mailing address on a sender identity. */
  physicalAddress: {
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
}

export interface TelephonyProvisioningRun {
  id: string;
  tenantId: string;
  campaignId: string | null;
  accountId: string | null;
  /** Regulation class: "local" numbers do voice, "mobile" numbers are SMS-only. */
  numberType?: "mobile" | "local" | string;
  /** False on a run that deliberately asked for one class only, and on every chained run. */
  chainComplementary?: boolean;
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
  nickname: string | null;
  purpose: string;
  /**
   * Regulation class the number was bought under – "mobile" (SMS-capable) or
   * "local" (voice caller-id, cannot send SMS). `listNumbers` returns whole rows,
   * so the API already ships this; declaring it lets a UI label the two numbers
   * apart instead of guessing from the +614 prefix.
   */
  numberType?: "mobile" | "local" | string;
  status: "PENDING" | "ACTIVE" | "RELEASED";
  createdAt: string;
}

/**
 * How an adopted number is classed. The AU numbering plan (the E.164 prefix) is the only
 * thing that sets it – the whole platform decides what a number may do from its prefix, so a
 * class that disagreed with it would be unusable. Twilio's capabilities are reported for
 * transparency; they can only ever VETO an adoption, never re-class the number.
 */
export interface TelephonyNumberClassification {
  numberType: "mobile" | "local";
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

/** Everything on one inbound hook that Twilio routes on. `trunkSid` is voice-only. */
export interface TelephonyHookConfiguration {
  url: string | null;
  applicationSid: string | null;
  fallbackUrl: string | null;
  trunkSid: string | null;
}

/**
 * What adoption did – or deliberately did NOT do – to the number's inbound hook.
 * "left-in-place" means something the organisation depends on is already there and adoption
 * refused to overwrite it; re-send with the matching claim flag to take it over.
 *
 * On a MOBILE that is not merely informational: adoption is refused outright
 * (`SMS_HOOK_OCCUPIED`) unless `claimSmsHook` is set, because uprise would otherwise send
 * marketing from a number whose STOP replies it can never see.
 */
export interface TelephonyAdoptionHook {
  hook: "sms" | "voice";
  action: "claimed" | "taken-over" | "left-in-place";
  existing: TelephonyHookConfiguration;
}

/**
 * A tenant's own Twilio account, after it has been connected. The auth token is never
 * returned – it is encrypted at rest and only ever travels inbound.
 */
export interface ConnectedTelephonyAccount {
  accountId: string;
  accountSid: string;
  tenantId: string;
  status: string;
  region: string | null;
  edge: string | null;
}

/** One number the BYO account already owns, as a candidate for adoption. */
export interface AdoptableNumber {
  phoneNumberE164: string;
  phoneNumberSid: string;
  friendlyName: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  voiceUrl: string | null;
  voiceApplicationSid: string | null;
  voiceFallbackUrl: string | null;
  trunkSid: string | null;
  smsUrl: string | null;
  smsApplicationSid: string | null;
  smsFallbackUrl: string | null;
  classification: TelephonyNumberClassification | null;
  /** Null when adoptable. Never names the other organisation. */
  blockedReason:
    | "ALREADY_ADOPTED"
    | "ADOPTED_BY_ANOTHER_TENANT"
    | "NUMBER_NOT_USABLE"
    | "NUMBER_NOT_AUSTRALIAN"
    | null;
  hook: TelephonyAdoptionHook;
}

export interface AdoptedNumberResult {
  number: TelephonyPhoneNumber;
  classification: TelephonyNumberClassification;
  hook: TelephonyAdoptionHook;
}

// Transactional message templates (meld doc 09/12) — the pickable copy for the invite
// compose view and other 1:1 sends. SMS + WhatsApp channels; `kind` splits transactional
// from marketing.
export interface MessageTemplate {
  id: string;
  tenantId: string;
  key: string;
  channel: "SMS" | "WHATSAPP";
  kind: string;
  category: string | null;
  body: string;
  isActive: boolean;
}

export const messageTemplates = {
  /** All of the tenant's transactional/marketing templates (organiser/owner). */
  list: () => request<MessageTemplate[]>("/message-templates"),
};

export const telephony = {
  /** Super-admin: start an automated provisioning run for a tenant (or campaign). */
  startRun: (body: {
    tenantId?: string;
    campaignId?: string;
    mode: "SUBACCOUNT" | "BYO";
    byoAccountSid?: string;
    byoAuthToken?: string;
    /**
     * BYO only: an ALREADY-APPROVED Twilio regulatory bundle (`BU…`) and the registered
     * address it was approved against (`AD…`). A tenant bringing an established Twilio
     * account has been through the AU regulatory journey once already; supplying the pair
     * skips it – no bundle drafted, no documents uploaded, no days waiting on a human
     * reviewer. Both or neither, and only for the regulation class the bundle was approved
     * for (the complementary run still drafts its own).
     */
    byoBundleSid?: string;
    byoAddressSid?: string;
    /** BYO only: the account's Twilio home region / edge, e.g. "au1" / "sydney". */
    byoRegion?: string;
    byoEdge?: string;
    friendlyName?: string;
    /** Regulation class to provision first: "mobile" (SMS, the default) or "local" (voice caller-id). */
    numberType?: "mobile" | "local";
    /**
     * Whether completing this run should chain a run for the complementary class.
     * Omitting it means TRUE – the tenant ends up with both numbers (a mobile to
     * text from and a local to call from), which is two number purchases and two
     * human-reviewed Twilio regulatory bundles. Pass false for a deliberate
     * single-class request, e.g. a tenant that only ever wants SMS, or to keep the
     * Twilio spend and the compliance review to one number.
     */
    chainComplementary?: boolean;
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

  /** Rename a provisioned number (owner-reachable). Empty string clears the nickname. */
  setNickname: (numberId: string, nickname: string) =>
    request<TelephonyPhoneNumber>(`/telephony/numbers/${encodeURIComponent(numberId)}`, {
      method: "PATCH",
      body: JSON.stringify({ nickname }),
      headers: { "Content-Type": "application/json" },
    }),

  /**
   * Repurpose a number. `"voice"` is the calls number — the value provisioning stamps and the
   * sender resolver matches; `"transactional"` is the legacy alias the API still folds into it.
   * A +614 mobile is refused server-side.
   */
  setPurpose: (numberId: string, purpose: "voice" | "transactional" | "marketing" | "whatsapp") =>
    request<TelephonyPhoneNumber>(`/telephony/numbers/${encodeURIComponent(numberId)}`, {
      method: "PATCH",
      body: JSON.stringify({ purpose }),
      headers: { "Content-Type": "application/json" },
    }),

  /**
   * Connect a tenant's own Twilio account – no purchase, no regulatory bundle, no provisioning
   * run. The credentials are proved against Twilio before anything is stored, and the token is
   * encrypted at rest. Idempotent on the account SID: re-connecting rotates the stored token
   * rather than failing, so this is also how an operator updates a rotated one.
   *
   * This is the step that makes `listAdoptableNumbers`/`adoptNumber` reachable – both need an
   * `accountId`, and before this existed the only thing that minted one was a run that bought
   * a number the organisation did not need.
   */
  connectByoAccount: (body: {
    accountSid: string;
    authToken: string;
    region?: string;
    edge?: string;
    friendlyName?: string;
  }) =>
    request<ConnectedTelephonyAccount>("/telephony/accounts/connect", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),

  /**
   * Numbers the tenant's own (BYO) Twilio account ALREADY owns, each annotated with how
   * uprise would class it, whether it can be adopted, and what is already configured on the
   * hook adoption would write. Read-only – nothing at Twilio changes.
   */
  listAdoptableNumbers: (accountId: string) =>
    request<AdoptableNumber[]>(`/telephony/accounts/${encodeURIComponent(accountId)}/adoptable-numbers`),

  /**
   * Adopt one of those numbers – register it against the tenant with no purchase, no
   * regulatory bundle and no provisioning run. `claimSmsHook`/`claimVoiceHook` are the
   * explicit opt-in to TAKE OVER a hook that is already configured; omit them and an existing
   * VOICE configuration is left exactly as it is and reported back in `hook`, while an
   * occupied MESSAGING hook fails the call with `SMS_HOOK_OCCUPIED` rather than landing a
   * sender whose STOP replies would go to somebody else.
   */
  adoptNumber: (
    accountId: string,
    body: { phoneNumberSid: string; nickname?: string; claimSmsHook?: boolean; claimVoiceHook?: boolean },
  ) =>
    request<AdoptedNumberResult>(`/telephony/accounts/${encodeURIComponent(accountId)}/adopt-number`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),

  /** Org-KYC prefill for the tenant compliance form. */
  compliancePrefill: () => request<TelephonyComplianceInput>("/telephony/compliance-prefill"),
};

// ── Transactional calls (one-to-one, event-driven outbound voice; meld doc 09) ──
// Distinct from a future predictive-dialling domain (bulk phone-banking).
export type TransactionalCallStatus =
  | "INITIATED"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BUSY"
  | "NO_ANSWER"
  | "FAILED";

export interface TransactionalCall {
  id: string;
  tenantId: string;
  contactId: string | null;
  toNumber: string;
  fromNumber: string;
  status: TransactionalCallStatus;
  providerCallId: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Provider failure detail on a BUSY/NO_ANSWER/FAILED call — the reason it never connected. */
  errorCode: string | null;
  errorMessage: string | null;
  sipCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTransactionalCallsParams {
  status?: TransactionalCallStatus[];
  contactId?: string;
  search?: string;
  /** ISO-8601 bounds on createdAt. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ListTransactionalCallsResponse {
  items: TransactionalCall[];
  total: number;
}

export interface TransactionalCallStats {
  total: number;
  byStatus: Record<string, number>;
  totalDurationSeconds: number;
}

function transactionalCallsQuery(params: ListTransactionalCallsParams): string {
  const qs = new URLSearchParams();
  if (params.status?.length) qs.set("status", params.status.join(","));
  if (params.contactId) qs.set("contactId", params.contactId);
  if (params.search) qs.set("search", params.search);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

export const transactionalCalls = {
  list: (params: ListTransactionalCallsParams = {}) =>
    request<ListTransactionalCallsResponse>(`/calls${transactionalCallsQuery(params)}`),
  /** KPI aggregates over the same filter (pagination params are ignored server-side). */
  stats: (params: ListTransactionalCallsParams = {}) =>
    request<TransactionalCallStats>(`/calls/stats${transactionalCallsQuery(params)}`),
  get: (id: string) => request<TransactionalCall>(`/calls/${encodeURIComponent(id)}`),
  /** Absolute URL for an <audio> element — the recording proxy loads with the SSO cookie. */
  recordingUrl: (id: string) => `${getApiUrl()}/calls/${encodeURIComponent(id)}/recording`,
  /** Browser (WebRTC) voice access token for the softphone; `fromNumber` is the caller ID. */
  voiceToken: () =>
    request<{ token: string; identity: string; fromNumber: string; expiresAt: string }>("/calls/voice-token"),
  initiate: (body: { toNumber: string; fromNumber?: string; contactId?: string; url?: string; twiml?: string }) =>
    request<TransactionalCall>("/calls", { method: "POST", body: JSON.stringify(body) }),
};

// ── Autodialer (voice broadcast / robo-poll / transfer campaigns) ────────────

import type {
  DialerAuthoringQuestion,
  DialerBehaviourFilter,
  DialerCampaignRecord,
  DialerCampaignStats,
  DialerCampaignStatusValue,
  DialerCampaignWithGraph,
  DialerGraphIssue,
  DialerPreflightResult,
  DialerResultsResponse,
  DialerTenantStats,
  ListDialerAttemptsResponse,
  ListDialerCampaignsResponse,
} from "@uprise/contracts";

export type ListDialerCampaignsParams = {
  status?: DialerCampaignStatusValue;
  behaviour?: DialerBehaviourFilter;
  search?: string;
  limit?: number;
  offset?: number;
};

function dialerQuery(params: ListDialerCampaignsParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.behaviour) qs.set("behaviour", params.behaviour);
  if (params.search) qs.set("search", params.search);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export const autodialer = {
  list: (params: ListDialerCampaignsParams = {}) =>
    request<ListDialerCampaignsResponse>(`/autodialer/campaigns${dialerQuery(params)}`),
  get: (id: string) => request<DialerCampaignWithGraph>(`/autodialer/campaigns/${encodeURIComponent(id)}`),
  create: (body: {
    name: string;
    outboundOnly?: boolean;
    survey?: boolean;
    electoralTarget?: boolean;
    transparentTargetTransfer?: boolean;
  }) => request<DialerCampaignRecord>("/autodialer/campaigns", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<DialerCampaignRecord>) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  /** Archive – attempts and results are kept for reporting. */
  archive: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" }),
  activate: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}/activate`, { method: "POST" }),
  pause: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  resume: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  complete: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}/complete`, { method: "POST" }),
  clone: (id: string) =>
    request<DialerCampaignRecord>(`/autodialer/campaigns/${encodeURIComponent(id)}/clone`, { method: "POST" }),
  /** The activation gate as a readable checklist. */
  preflight: (id: string) =>
    request<DialerPreflightResult>(`/autodialer/campaigns/${encodeURIComponent(id)}/preflight`),
  /** Tenant-wide KPIs for the campaign list header. */
  tenantStats: () => request<DialerTenantStats>("/autodialer/stats"),
  /** Monitor tab aggregates for one campaign. */
  stats: (id: string) =>
    request<DialerCampaignStats>(`/autodialer/campaigns/${encodeURIComponent(id)}/stats`),
  /** Monitor tab recent dials (paged, newest first). */
  attempts: (id: string, params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const str = qs.toString();
    return request<ListDialerAttemptsResponse>(
      `/autodialer/campaigns/${encodeURIComponent(id)}/attempts${str ? `?${str}` : ""}`,
    );
  },
  /** Results tab: survey distributions + the transfer ledger. */
  results: (id: string) =>
    request<DialerResultsResponse>(`/autodialer/campaigns/${encodeURIComponent(id)}/results`),
  /** Full-graph put. Send either `questions` (the full graph) or `authoring`
   *  (the simplified linear format, expanded server-side). */
  upsertQuestions: (
    id: string,
    body: { questions?: unknown[]; authoring?: DialerAuthoringQuestion[] },
  ) =>
    request<{ campaign: DialerCampaignWithGraph; issues: DialerGraphIssue[] }>(
      `/autodialer/campaigns/${encodeURIComponent(id)}/questions`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
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

/** A tenant-owner ask for email setup (provisioning stays super-admin-executed). */
export interface EmailProvisioningRequest {
  id: string;
  tenantId: string;
  status: "OPEN" | "FULFILLED" | "DECLINED" | "WITHDRAWN";
  kind: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS" | null;
  domain: string | null;
  notes: string | null;
  requestedById: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  runId: string | null;
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
    tenantId?: string;
    campaignId?: string;
    mode: "SUBUSER" | "BYO";
    kind: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";
    slug?: string;
    domain?: string;
    fromLocalPart: string;
    fromName: string;
    purpose?: string;
    byoApiKey?: string;
    /** An OPEN setup request this run fulfils. */
    requestId?: string;
  }) => request<EmailProvisioningRun>("/email-provisioning/runs", { method: "POST", body: JSON.stringify(body) }),

  /** Org KYC → the sender-identity form, so the setup steps aren't retyped. */
  senderPrefill: () => request<EmailSenderPrefill>("/email-provisioning/prefill"),

  /** Owner: ask the platform team to set up the org's email identity. */
  requestSetup: (body: { kind?: string; domain?: string; notes?: string } = {}) =>
    request<EmailProvisioningRequest>("/email-provisioning/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Operator queue (all tenants) / a tenant's own requests. */
  listRequests: (opts: { status?: string; tenantId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.tenantId) q.set("tenantId", opts.tenantId);
    const qs = q.toString();
    return request<EmailProvisioningRequest[]>(`/email-provisioning/requests${qs ? `?${qs}` : ""}`);
  },

  /** Owner: withdraw their own OPEN request. */
  withdrawRequest: (id: string) =>
    request<EmailProvisioningRequest>(`/email-provisioning/requests/${encodeURIComponent(id)}/withdraw`, {
      method: "POST",
    }),

  /** Operator: decline an OPEN request (reason shown to the owner). */
  declineRequest: (id: string, reason?: string) =>
    request<EmailProvisioningRequest>(`/email-provisioning/requests/${encodeURIComponent(id)}/decline`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

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

// ── Actions (admin action pages) ─────────────────────────────────────────────

export interface ListActionPagesParams {
  status?: ActionPageStatusValue;
  search?: string;
  limit?: number;
  offset?: number;
}

function actionPagesQuery(params: ListActionPagesParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export const actionPages = {
  list: (params: ListActionPagesParams = {}) =>
    request<ListActionPagesResponse>(`/actions/pages${actionPagesQuery(params)}`),
  get: (id: string) => request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}`),
  create: (body: { title: string }) =>
    request<ActionPageRecord>("/actions/pages", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ActionPageRecord>) =>
    request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  publish: (id: string) =>
    request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  unpublish: (id: string) =>
    request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}/unpublish`, { method: "POST" }),
  archive: (id: string) =>
    request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}/archive`, { method: "POST" }),
  restore: (id: string) =>
    request<ActionPageRecord>(`/actions/pages/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  /** Short-lived page-scoped token so admins can view a DRAFT on the public surface. */
  previewToken: (id: string) =>
    request<{ token: string; expiresAt: string }>(`/actions/pages/${encodeURIComponent(id)}/preview-token`, {
      method: "POST",
    }),
  results: (id: string, params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const str = qs.toString();
    return request<ActionPageResults>(`/actions/pages/${encodeURIComponent(id)}/results${str ? `?${str}` : ""}`);
  },
};

// ── Actions (anonymous public widget surface — no session, never redirect) ───

export const publicActions = {
  getPage: (slug: string, previewToken?: string) =>
    request<PublicActionPagePayload>(
      `/actions/public/pages/${encodeURIComponent(slug)}${previewToken ? `?previewToken=${encodeURIComponent(previewToken)}` : ""}`,
      undefined,
      { redirectOn401: false },
    ),
  /** Rate-limited + optionally captcha-gated; the Turnstile token rides the header. */
  createCallSession: (slug: string, body: CreateCallSessionRequest, captchaToken?: string) =>
    request<CreateCallSessionResponse>(
      `/actions/public/pages/${encodeURIComponent(slug)}/call-sessions`,
      { method: "POST", body: JSON.stringify(body) },
      { redirectOn401: false, captchaToken },
    ),
  /** Take an RSVP from an EVENT_RSVP page. Rate-limited + Turnstile-gated like a call session:
   *  the capacity it consumes is real, and an embedded form is as scriptable as a call button. */
  createRsvp: (slug: string, body: CreateActionRsvpRequest, captchaToken?: string) =>
    request<CreateActionRsvpResponse>(
      `/actions/public/pages/${encodeURIComponent(slug)}/rsvp`,
      { method: "POST", body: JSON.stringify(body) },
      { redirectOn401: false, captchaToken },
    ),
  /** Chooser search — leak-safe member identities for the widget's finder.
   *  Turnstile-gated like the auth flows: the token rides the same header. */
  searchTargets: (slug: string, q: string, captchaToken?: string) =>
    request<{ targets: PublicTargetIdentity[] }>(
      `/actions/public/pages/${encodeURIComponent(slug)}/targets${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      undefined,
      { redirectOn401: false, captchaToken },
    ),
  /** Absolute SSE URL for the widget's EventSource (fetch wrappers don't apply). */
  sessionEventsUrl: (sessionId: string, token: string) =>
    `${getApiUrl()}/actions/public/call-sessions/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(token)}`,
};

// ── Integrations: CRM data sync (push transparency + settings) ────────────────
// Only the write-back-era endpoints live here; the legacy pull functions remain in
// apps/admin/src/lib/api.ts until their mechanical migration. Types mirror the api's
// IntegrationPushDelivery ledger + parseDataSyncSettings shape.

export type SyncStreamKey = "dispositions" | "surveyAnswers" | "tags" | "textReplies" | "rsvps";

export type IntegrationDataSyncSettings = {
  pull: { importTags: boolean; autoRefresh: { enabled: boolean; intervalHours: number } };
  push: {
    enabled: boolean;
    streams: Record<SyncStreamKey, boolean>;
    supportLevelsEnabled: boolean;
    supportLevelRequiresConsent: true;
    createMissingPeople: boolean;
    tagPrefix: string;
    nbSenderId: number | null;
  };
};

export type IntegrationDataSyncSettingsPatch = {
  pull?: { importTags?: boolean; autoRefreshEnabled?: boolean; autoRefreshIntervalHours?: number };
  push?: {
    enabled?: boolean;
    streams?: Partial<Record<SyncStreamKey, boolean>>;
    supportLevelsEnabled?: boolean;
    createMissingPeople?: boolean;
    tagPrefix?: string;
    nbSenderId?: number | null;
  };
};

export type PushDeliveryStatus = "PENDING" | "SENDING" | "SUCCEEDED" | "SKIPPED" | "FAILED" | "HELD";

/** One row of the push-delivery ledger — what uprise sent (or couldn't) to the CRM. */
export type PushDeliveryRecord = {
  id: string;
  tenantId: string;
  connectionId: string;
  eventId: string;
  eventType: string;
  stream: string;
  contactId: string | null;
  externalPersonId: string | null;
  status: PushDeliveryStatus;
  attempts: number;
  requestSummary: Record<string, unknown> | null;
  responseSummary: Record<string, unknown> | null;
  skipReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type PushDeliverySummary = {
  since: string;
  byConnection: Record<string, Partial<Record<PushDeliveryStatus, number>>>;
};

const pushDeliveriesQuery = (params: {
  connectionId?: string;
  stream?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) => {
  const q = new URLSearchParams();
  if (params.connectionId) q.set("connectionId", params.connectionId);
  if (params.stream) q.set("stream", params.stream);
  if (params.status) q.set("status", params.status);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const integrations = {
  updateDataSyncSettings: (connectionId: string, patch: IntegrationDataSyncSettingsPatch) =>
    request<IntegrationDataSyncSettings>(
      `/integrations/connections/${encodeURIComponent(connectionId)}/settings`,
      { method: "PATCH", body: JSON.stringify(patch) },
    ),
  listPushDeliveries: (
    params: { connectionId?: string; stream?: string; status?: string; limit?: number; offset?: number } = {},
  ) =>
    request<{ rows: PushDeliveryRecord[]; total: number }>(
      `/integrations/push-deliveries${pushDeliveriesQuery(params)}`,
    ),
  pushDeliverySummary: (sinceHours = 24) =>
    request<PushDeliverySummary>(`/integrations/push-deliveries/summary?sinceHours=${sinceHours}`),
  retryPushDelivery: (deliveryId: string) =>
    request<{ queued: boolean }>(`/integrations/push-deliveries/${encodeURIComponent(deliveryId)}/retry`, {
      method: "POST",
    }),
};
