import { z } from "zod";

/**
 * Shared auth contracts (meld doc 14) — Zod schemas + inferred types for the IAM
 * flows, consumed by @uprise/api-client and the frontends (apps/auth, apps/admin).
 * The API keeps its own class-validator request DTOs; these are the wire types
 * the clients validate against.
 */

// ── Response envelope (mirrors the API's ApiResponseInterceptor) ──────
export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Principal + membership ────────────────────────────────────────────
export type AppRole = "OWNER" | "ORGANISER" | "VOLUNTEER";

export interface Membership {
  tenantId: string;
  tenantName: string;
  role: AppRole;
  /** Tenant URL slug (subdomain). Optional — older callers may omit. */
  tenantSlug?: string;
  /** The tenant's logo (landscape preferred, block fallback) for switcher/field brand marks. */
  logoUrl?: string | null;
  /** Plan key of the tenant's owning network ("grassroots"|"starter"|"growth"|"scale"), null when network-less. */
  planName?: string | null;
}

export interface AuthPrincipal {
  id: string;
  email: string | null;
  role: AppRole;
  tenantId: string | null;
  memberships: Membership[];
  /** Env break-glass super-admin (tenant-independent; not a role). Surfaced by GET /auth/check. */
  isSuperAdmin?: boolean;
  /**
   * The active tenant when it is NOT one of the user's memberships — i.e. a super-admin
   * "acting as" a tenant they don't belong to. Null for ordinary users (their active
   * tenant is in `memberships`). Lets the switcher/shell label the impersonated tenant.
   */
  activeTenant?: { id: string; name: string; slug: string } | null;
  // Account flags surfaced by GET /auth/check (optional — older callers may omit).
  emailVerified?: boolean;
  mobileVerified?: boolean;
  twofaEnabled?: boolean;
}

// ── Request schemas ───────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const emailSchema = z.object({ email: z.string().email() });
export type EmailRequest = z.infer<typeof emailSchema>;

export const tokenSchema = z.object({ token: z.string().min(1) });
export type TokenRequest = z.infer<typeof tokenSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

export const confirmEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
});
export type ConfirmEmailRequest = z.infer<typeof confirmEmailSchema>;

export const twofaSendSchema = z.object({ challengeId: z.string().min(1) });
export type TwofaSendRequest = z.infer<typeof twofaSendSchema>;

export const twofaVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(4).max(12),
});
export type TwofaVerifyRequest = z.infer<typeof twofaVerifySchema>;

/**
 * Canvasser roles offered at volunteer onboarding (advisory; organiser can change).
 * Doorknocker leads because it is the default the wizard preselects.
 *
 * Duplicated in `apps/api/src/auth/dto/auth-flows.dto.ts`, which backs the `@IsIn`
 * validator – the API deliberately does not depend on this package. Change both.
 */
export const VOLUNTEER_PREFERRED_ROLES = [
  "doorknocker",
  "hander-outer",
  "booth-captain",
  "p2p-texter",
] as const;
export type VolunteerPreferredRole = (typeof VOLUNTEER_PREFERRED_ROLES)[number];

/** Doorknocker onboarding: how much walking suits them + preferred session length
 *  (advisory; helps organisers match turf). Stored on TenantMember.canvassPrefs. */
export const WALKING_CAPABILITIES = ["short", "moderate", "long", "minimal"] as const;
export type WalkingCapability = (typeof WALKING_CAPABILITIES)[number];
export const SESSION_LENGTHS = ["short", "standard", "long", "flexible"] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

/** Signup attribution captured from the entry URL (utm/source/channel). All optional. */
export const signupAttributionSchema = z.object({
  signupSource: z.string().max(120).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  referrerChannel: z.string().max(120).optional(),
});
export type SignupAttribution = z.infer<typeof signupAttributionSchema>;

export const acceptInviteSchema = signupAttributionSchema.extend({
  token: z.string().min(1),
  displayName: z.string().max(200).optional(),
  password: z.string().min(8).max(200).optional(),
  // Onboarding wizard: a verified phone OTP to bind + the volunteer's prefs.
  challengeId: z.string().max(64).optional(),
  code: z.string().max(12).optional(),
  preferredRole: z.enum(VOLUNTEER_PREFERRED_ROLES).optional(),
  availabilityDays: z.array(z.string()).max(7).optional(),
  // Doorknocker-only prefs (advisory) — assembled server-side into canvassPrefs.
  walkingCapability: z.enum(WALKING_CAPABILITIES).optional(),
  sessionLength: z.enum(SESSION_LENGTHS).optional(),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;

export const inviteStartPhoneSchema = z.object({
  token: z.string().min(1),
  phone: z.string().min(5).max(20),
});
export type InviteStartPhoneRequest = z.infer<typeof inviteStartPhoneSchema>;

// Tokenless open-join (per-campaign): the same onboarding wizard with a campaignId
// in place of an invite token. Gated server-side by the campaign's openJoinEnabled flag.
export const openJoinStartPhoneSchema = z.object({
  campaignId: z.string().min(1).max(64),
  phone: z.string().min(5).max(20),
});
export type OpenJoinStartPhoneRequest = z.infer<typeof openJoinStartPhoneSchema>;

export const openJoinAcceptSchema = signupAttributionSchema.extend({
  campaignId: z.string().min(1).max(64),
  displayName: z.string().max(200).optional(),
  challengeId: z.string().max(64).optional(),
  code: z.string().max(12).optional(),
  preferredRole: z.enum(VOLUNTEER_PREFERRED_ROLES).optional(),
  availabilityDays: z.array(z.string()).max(7).optional(),
  // Doorknocker-only prefs (advisory) — assembled server-side into canvassPrefs.
  walkingCapability: z.enum(WALKING_CAPABILITIES).optional(),
  sessionLength: z.enum(SESSION_LENGTHS).optional(),
});
export type OpenJoinAcceptRequest = z.infer<typeof openJoinAcceptSchema>;

/** Tenant brand fields carried on a public join preview so the join hero can wear the org's
 *  brand (BrandStyle maps `primaryColour` → `--primary`). All null → the Uprise default brand. */
export interface JoinBrand {
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
}

export type OpenJoinPreview = JoinBrand & {
  /** The campaign's outreach medium — drives the wizard's door/texting branching. */
  channel?: "DOOR" | "SMS" | "BOTH";
  campaignId: string;
  /** Whether the campaign is actually taking sign-ups (openJoinEnabled + ACTIVE). False → the
   *  landing renders the branded "sign-ups closed" state instead of the wizard. Advisory only:
   *  the join endpoints re-check it, so a false here can never be talked past. Board items are
   *  always true (the board lists open campaigns by definition). */
  open: boolean;
  /** The campaign's tenant id — keys the deterministic fallback avatar gradient when
   *  the org has no logo (same as the tenant selector). */
  tenantId: string;
  /** The org's URL slug – lets a closed campaign's landing offer that org's OTHER open
   *  campaigns (`openJoinList(tenantSlug)`) rather than a dead end. Null if unslugged. */
  tenantSlug: string | null;
  campaignName: string;
  tenantName: string;
  /** The tenant's block/avatar logo (OrgProfile.logoBlockUrl) — the one the tenant
   *  selector shows. Null when the org hasn't set a logo. */
  logoUrl: string | null;
  /** Recruitment social-proof for the hero (real, best-effort; 0 when unavailable — the hero
   *  hides zero stats). */
  volunteerCount: number;
  doorsThisWeek: number;
};

export const selectTenantSchema = z.object({ tenantId: z.string().min(1) });
export type SelectTenantRequest = z.infer<typeof selectTenantSchema>;

// ── Self-signup → admin approval (the inverse of invite) ──────────────
export const requestAccessSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(200),
  requestedRole: z.enum(["staff", "volunteer"]),
  tenantSlug: z.string().min(1).max(64),
});
export type RequestAccessRequest = z.infer<typeof requestAccessSchema>;

export const confirmAccessSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
  tenantSlug: z.string().min(1).max(64),
});
export type ConfirmAccessRequest = z.infer<typeof confirmAccessSchema>;

// Phone-first self-signup → admin approval (volunteers).
export const requestAccessByPhoneSchema = signupAttributionSchema.extend({
  phone: z.string().min(5).max(20),
  displayName: z.string().min(1).max(200),
  requestedRole: z.enum(["staff", "volunteer"]),
  tenantSlug: z.string().min(1).max(64),
});
export type RequestAccessByPhoneRequest = z.infer<typeof requestAccessByPhoneSchema>;

export const confirmAccessByPhoneSchema = z.object({
  phone: z.string().min(5).max(20),
  code: z.string().min(4).max(12),
  tenantSlug: z.string().min(1).max(64),
});
export type ConfirmAccessByPhoneRequest = z.infer<typeof confirmAccessByPhoneSchema>;

export const approveJoinRequestSchema = z.object({ role: z.enum(["ORGANISER", "VOLUNTEER"]) });
export type ApproveJoinRequestRequest = z.infer<typeof approveJoinRequestSchema>;

export const rejectJoinRequestSchema = z.object({ reason: z.string().max(500).optional() });
export type RejectJoinRequestRequest = z.infer<typeof rejectJoinRequestSchema>;

export type JoinRequestStatus = "unverified" | "pending" | "approved" | "rejected";
export interface JoinRequest {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  requestedRole: string;
  status: JoinRequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** POST /auth/request-access response — `alreadyMember` short-circuits the verify step. */
export interface RequestAccessResponse {
  ok: true;
  alreadyMember?: boolean;
}

/** A new-workspace signup awaiting super-admin approval (gated /auth/register). Rendered in the
 *  super-admin Signups queue; approving mints the OWNER membership, rejecting frees the slug. */
export interface PendingSignup {
  requestId: string;
  tenantId: string;
  orgName: string;
  slug: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().max(200).optional(),
  orgName: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
});
export type RegisterRequest = z.infer<typeof registerSchema>;

// ── Response types ────────────────────────────────────────────────────
export interface SessionGrantResponse {
  token: string;
  user: { id: string; memberships: Membership[] };
  memberships: Membership[];
}

/** POST /auth/register when signup approval is gated (SIGNUP_APPROVAL_REQUIRED): the account +
 *  workspace exist but no session is issued — the owner waits for super-admin approval. */
export interface RegisterPendingResponse {
  pending: true;
}

/** /auth/register returns a full session, or `{ pending: true }` when approval is gated. */
export type RegisterResponse = SessionGrantResponse | RegisterPendingResponse;

export function isRegisterPending(r: RegisterResponse): r is RegisterPendingResponse {
  return (r as RegisterPendingResponse).pending === true;
}

export interface TwofaChallengeResponse {
  twofaRequired: true;
  challengeId: string;
}

/** POST /iam/sessions returns either a full session or a 2FA challenge. */
export type LoginResponse =
  | (SessionGrantResponse & { user: { id: string; email: string; role: AppRole; tenantId: string | null } })
  | TwofaChallengeResponse;

export function isTwofaChallenge(r: LoginResponse): r is TwofaChallengeResponse {
  return (r as TwofaChallengeResponse).twofaRequired === true;
}

export interface InvitePreview {
  email: string;
  phone: string | null;
  tenantName: string;
  /** The tenant's logo (landscape preferred, block fallback); null when the org has none. */
  logoUrl: string | null;
  role: AppRole;
  /** What the volunteer was invited to do — "DOOR" | "SMS" | "BOTH"; null = legacy (BOTH). */
  invitedChannel?: string | null;
}

export interface OkResponse {
  ok: true;
}

export interface CheckSessionResponse {
  ok: true;
  user: AuthPrincipal | null;
}

// ── Self-service profile + account (prog parity) ──────────────────────
export interface UserProfileResponse {
  userId: string;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  /** Free text the user typed into their profile. NOT the verified 2FA number — see `mobile`. */
  phone: string | null;
  /**
   * The verified mobile from the identity row (2FA/OTP). Read-only here: it is changed through
   * `PUT /profile/mobile`, which re-verifies. Most users have this and no `phone`, so anything
   * wanting "the user's number" should prefer `phone` and fall back to this.
   */
  mobile: string | null;
  avatarUrl: string | null;
  bio: string | null;
  dateOfBirth: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export interface UserAvatarResponse {
  id: string;
  userId: string;
  url: string;
  isSelected: boolean;
}

export const updateProfileSchema = z.object({
  displayName: z.string().max(200).optional(),
  givenName: z.string().max(120).optional(),
  familyName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  avatarUrl: z.string().max(2048).optional(),
  bio: z.string().max(2000).optional(),
  dateOfBirth: z.string().max(40).optional(),
  facebookUrl: z.string().max(2048).optional(),
  twitterUrl: z.string().max(2048).optional(),
  linkedinUrl: z.string().max(2048).optional(),
  instagramUrl: z.string().max(2048).optional(),
  websiteUrl: z.string().max(2048).optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

export const setMobileSchema = z.object({ mobile: z.string().min(1).max(20) });
export type SetMobileRequest = z.infer<typeof setMobileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1),
});
export type ChangeEmailRequest = z.infer<typeof changeEmailSchema>;

export const deleteAccountSchema = z.object({ password: z.string().min(1) });
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;

// ── Active-sessions management ────────────────────────────────────────
export interface SessionSummaryResponse {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// ── Subdomain availability (sign-up) ──────────────────────────────────
export interface AvailabilityResponse {
  slug: string;
  available: boolean;
}

// ── Organiser onboarding (getting-started) ────────────────────────────
/** Getting-started steps a new OWNER/ORGANISER completes. Order = display order. */
export const ONBOARDING_STEP_KEYS = [
  "verifyEmail",
  "orgProfile",
  "inviteTeammate",
  "connectAudience",
  "firstCampaign",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEP_KEYS)[number];

/** Per-tenant onboarding progress stored on Tenant.onboarding (advisory). Steps are
 *  monotonic — once true they stay true even if the underlying data is later removed. */
export interface TenantOnboarding {
  version: number;
  dismissed: boolean;
  steps: Record<OnboardingStep, boolean>;
  updatedAt: string | null;
}

/** Patch body for PATCH /tenants/:id/onboarding. Steps merge (OR); dismissed replaces. */
export interface TenantOnboardingPatch {
  dismissed?: boolean;
  steps?: Partial<Record<OnboardingStep, boolean>>;
}

// ── Tenant setup (role-layered getting-started; GET /tenants/:id/setup) ───────
// The successor to the flat onboarding checklist: server-computed, role-aware flows.
// The legacy TenantOnboarding endpoints stay untouched; this is pure derivation.

/** Non-channel step statuses. `recommended` counts toward polish, never blocks. */
export type SetupStepStatus = "done" | "todo" | "recommended";

/** Channel provisioning progress, derived from runs/numbers/identities/requests. */
export type ChannelSetupState =
  | "none"
  | "requested"
  | "in_progress"
  | "action_required"
  | "failed"
  | "active";

/** Identity-setup step keys (every admin role) — both REQUIRED: who you sign in as. */
export const IDENTITY_SETUP_KEYS = ["verifyEmail", "confirmMobile"] as const;
/** Account-setup step keys – recommended polish, never blocking. brandAssets + branding are owner-only. */
export const ACCOUNT_SETUP_KEYS = ["enableTwofa", "completeProfile", "brandAssets", "branding"] as const;
/** Organisation step keys (owner) — all required. */
export const ORG_SETUP_KEYS = ["orgIdentity", "businessLegal", "contacts", "address"] as const;
/** Channel step keys (owner). */
export const CHANNEL_SETUP_KEYS = ["phoneNumber", "emailIdentity"] as const;
export type SetupStepKey =
  | (typeof IDENTITY_SETUP_KEYS)[number]
  | (typeof ACCOUNT_SETUP_KEYS)[number]
  | (typeof ORG_SETUP_KEYS)[number]
  | (typeof CHANNEL_SETUP_KEYS)[number];

export interface SetupStep {
  key: SetupStepKey;
  status: SetupStepStatus;
}

export interface ChannelSetupStep extends SetupStep {
  state: ChannelSetupState;
  /** The tenant's plan doesn't include this channel — render locked w/ upgrade affordance. */
  planLocked: boolean;
  /** Human sentence behind action_required (e.g. why compliance was rejected). */
  reason?: string | null;
}

/** A field the caller must complete before a gate opens, keyed for UI deep-linking. */
export interface SetupMissing {
  step: SetupStepKey;
  field: string;
}

export interface SetupGate {
  allowed: boolean;
  reason?: "PLAN_UPGRADE_REQUIRED" | "SETUP_INCOMPLETE" | "OPEN_REQUEST";
  missing?: SetupMissing[];
}

export interface TenantSetupState {
  flows: {
    /** Required for everyone: verified email + mobile. */
    identity: { steps: SetupStep[]; complete: boolean };
    /** Recommended account polish (2FA, profile) — never blocks completion. */
    account: { steps: SetupStep[]; complete: boolean };
    organisation: { applicable: boolean; steps: SetupStep[]; complete: boolean };
    channels: { applicable: boolean; steps: ChannelSetupStep[]; complete: boolean };
  };
  gates: {
    canProvisionTelephony: SetupGate;
    canRequestEmail: SetupGate;
  };
  dismissed: boolean;
  updatedAt: string | null;
}

// ── Org-identification completeness (single source of truth) ─────────────────
// Shared by the tenants setup endpoint, the telephony provisioning gate, and the
// admin UI. Pure — callers load the snapshot themselves and pass plain data.

export interface OrgSetupSnapshot {
  profile: {
    name: string | null;
    bio: string | null;
    logoBlockUrl: string | null;
    logoLandscapeUrl: string | null;
    primaryColour: string | null;
    secondaryColour: string | null;
    heroImageUrl: string | null;
  } | null;
  credential: {
    legalTradingName: string | null;
    australianBusinessNumber: string | null;
    australianCompanyNumber: string | null;
    entityType: string | null;
  } | null;
  contacts: Array<{
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    isPrimaryContact: boolean;
    isAuthorisedSignatory: boolean;
  }>;
  addresses: Array<{
    line1: string | null;
    suburb: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
  }>;
}

export interface OrgSetupResult {
  steps: {
    orgIdentity: boolean;
    businessLegal: boolean;
    contacts: boolean;
    address: boolean;
    brandAssets: boolean;
    branding: boolean;
  };
  /** True when the AU regulatory bundle can be filled: businessLegal + contacts + address.
   *  orgIdentity/brandAssets/branding are brand polish, not identification. */
  provisionReady: boolean;
  missing: SetupMissing[];
}

const filled = (v: string | null | undefined): boolean => Boolean(v && v.trim());

/**
 * Evaluate org-identification completeness from a plain snapshot. Rules mirror what the
 * Twilio AU regulatory bundle (and its compliance prefill) actually consume:
 * - orgIdentity: name + bio – the two fields the /settings/organisation tab actually holds
 * - businessLegal: legal trading name + (ABN or ACN) + entity type
 * - contacts: a primary contact with first + last + email
 * - address: line1 + (suburb or city) + state + postcode
 *
 * The two brand steps are recommended-only and never block. They split along the Branding
 * tab's cards so each card can carry its own status chip:
 * - brandAssets: a logo (block or landscape) + hero image → the "Logos & images" card
 * - branding: primary + secondary colour → the "Brand colours" card
 */
export function evaluateOrgSetup(snapshot: OrgSetupSnapshot): OrgSetupResult {
  const missing: SetupMissing[] = [];
  const p = snapshot.profile;
  const c = snapshot.credential;

  const orgIdentity = Boolean(p && filled(p.name) && filled(p.bio));

  const businessLegal = Boolean(
    c &&
      filled(c.legalTradingName) &&
      (filled(c.australianBusinessNumber) || filled(c.australianCompanyNumber)) &&
      filled(c.entityType),
  );
  if (!c || !filled(c.legalTradingName)) missing.push({ step: "businessLegal", field: "legalTradingName" });
  if (!c || (!filled(c.australianBusinessNumber) && !filled(c.australianCompanyNumber)))
    missing.push({ step: "businessLegal", field: "australianBusinessNumber" });
  if (!c || !filled(c.entityType)) missing.push({ step: "businessLegal", field: "entityType" });

  const primary = snapshot.contacts.find(
    (x) => x.isPrimaryContact && filled(x.firstName) && filled(x.lastName) && filled(x.email),
  );
  const contacts = Boolean(primary);
  if (!primary) missing.push({ step: "contacts", field: "primaryContact" });

  const address = snapshot.addresses.some(
    (a) => filled(a.line1) && (filled(a.suburb) || filled(a.city)) && filled(a.state) && filled(a.postcode),
  );
  if (!address) missing.push({ step: "address", field: "address" });

  const brandAssets = Boolean(
    p && (filled(p.logoBlockUrl) || filled(p.logoLandscapeUrl)) && filled(p.heroImageUrl),
  );
  const branding = Boolean(p && filled(p.primaryColour) && filled(p.secondaryColour));

  return {
    steps: { orgIdentity, businessLegal, contacts, address, brandAssets, branding },
    provisionReady: businessLegal && contacts && address,
    missing,
  };
}

// ── Autodialer (voice broadcast / robo-poll / transfer campaigns) ────────────

export const DIALER_CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export type DialerCampaignStatusValue = (typeof DIALER_CAMPAIGN_STATUSES)[number];

export const DIALER_BEHAVIOUR_FILTERS = ["broadcast", "survey", "transfer", "electoral"] as const;
export type DialerBehaviourFilter = (typeof DIALER_BEHAVIOUR_FILTERS)[number];

export const DIALER_JURISDICTION_VALUES = [
  "FEDERAL",
  "VIC",
  "NSW",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "ACT",
  "NT",
] as const;
export type DialerJurisdictionValue = (typeof DIALER_JURISDICTION_VALUES)[number];

/** Prompt shape: <Say> text plus optional per-language audio file ids. */
export type DialerPromptContent = {
  name?: string;
  audio?: string | Record<string, string>;
};

export type DialerAnswerRecord = {
  id: string;
  digit: string;
  value: string;
  /** Another question key | "outro" | null (hang up). */
  nextKey: string | null;
  type: "SMS" | "SET_LANGUAGE" | "REDIRECT" | "SWITCHBOARD" | null;
  content: string | null;
  transfer: boolean;
  dispositionCode: string | null;
  supportLevel: string | null;
};

export type DialerQuestionRecord = {
  id: string;
  key: string;
  name: string;
  type: "STANDARD" | "SWITCHBOARD";
  audioPrompt: unknown;
  orderIndex: number;
  answers: DialerAnswerRecord[];
};

export type DialerCampaignRecord = {
  id: string;
  tenantId: string;
  name: string;
  status: DialerCampaignStatusValue;
  outboundOnly: boolean;
  publicVisible: boolean;
  survey: boolean;
  electoralTarget: boolean;
  transparentTargetTransfer: boolean;
  audienceId: string | null;
  dailyStart: string;
  dailyFinish: string;
  dialerPeriodMinutes: number;
  noCallWindowHours: number;
  maxCallAttempts: number;
  batchSize: number;
  fromNumberId: string | null;
  intro: DialerPromptContent | null;
  outro: DialerPromptContent | null;
  optOut: DialerPromptContent | null;
  targetNumbers: string[] | null;
  /** Admin-pinned member snapshots (id-only civic refs + display identity). */
  targetPoliticians: Array<{ id: string; name: string; party?: string | null; electorate?: string | null }> | null;
  /** Widget (VOIP) callers may browse + choose their member. */
  callerChoosesTarget: boolean;
  partyTargets: string[] | null;
  jurisdiction: DialerJurisdictionValue | null;
  officeTarget: "electorate" | "upper" | null;
  amdEnabled: boolean;
  recordingEnabled: boolean;
  defaultLanguage: string;
  lastDialedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DialerCampaignWithGraph = DialerCampaignRecord & { questions: DialerQuestionRecord[] };

/** The simplified linear authoring shape, expanded server-side. */
export type DialerAuthoringQuestion = {
  key?: string;
  question: string;
  options: string[];
  audioPrompt?: unknown;
};

export type DialerGraphIssue = {
  severity: "error" | "warning";
  code: string;
  questionKey?: string;
  detail: string;
};

export type DialerPreflightResult = {
  ok: boolean;
  checks: Array<{ key: string; ok: boolean; detail: string }>;
};

export type ListDialerCampaignsResponse = {
  campaigns: DialerCampaignRecord[];
  total: number;
};

// Read-side reporting (admin list KPIs, monitor + results tabs).

export type DialerTenantStats = {
  active: number;
  callsToday: number;
  connectRate: number | null;
  transfers: number;
};

export type DialerCampaignStats = {
  attempts: { total: number; pending: number; byOutcome: Record<string, number> };
  callsToday: number;
  connectRate: number | null;
  transfers: number;
  surveyAnswers: number;
  sessions: { started: number; bridged: number };
  lastDialedAt: string | null;
};

export type DialerAttemptRow = {
  id: string;
  phoneE164: string;
  attemptNo: number;
  kind: string;
  outcome: string;
  language: string;
  callId: string | null;
  createdAt: string;
};

export type ListDialerAttemptsResponse = { total: number; attempts: DialerAttemptRow[] };

export type DialerResultsResponse = {
  questions: Array<{
    key: string;
    name: string;
    total: number;
    answers: Array<{
      digit: string;
      value: string;
      count: number;
      dispositionCode: string | null;
      supportLevel: string | null;
    }>;
  }>;
  transferCount: number;
  transfers: Array<{
    id: string;
    targetNumber: string;
    targetName: string | null;
    targetParty: string | null;
    electorate: string | null;
    phoneNumber: string | null;
    createdAt: string;
  }>;
};

// ── Actions (public action pages + click-to-call) ────────────────────────────

export const ACTION_PAGE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ActionPageStatusValue = (typeof ACTION_PAGE_STATUSES)[number];

export const ACTION_PAGE_TYPES = ["CLICK_TO_CALL"] as const;
export type ActionPageTypeValue = (typeof ACTION_PAGE_TYPES)[number];

/**
 * Embed-domain grammar shared by the API write-path validator and the admin
 * form: a bare lowercase hostname (`example.org`, `localhost`) or a single
 * leading wildcard (`*.example.org`). No scheme, port, path or unicode — the
 * value is injected into a frame-ancestors CSP header, so the grammar is the
 * security boundary.
 */
export const EMBED_DOMAIN_PATTERN =
  "^(\\*\\.)?(localhost|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$";
export const EMBED_DOMAIN_RE = new RegExp(EMBED_DOMAIN_PATTERN);

/** Admin-surface row (dates serialised). */
export type ActionPageRecord = {
  id: string;
  type: ActionPageTypeValue;
  status: ActionPageStatusValue;
  title: string;
  publicSlug: string;
  headline: string | null;
  body: string | null;
  ctaLabel: string | null;
  successMessage: string | null;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowPrefill: boolean;
  /**
   * Advisory page-level signal (show the challenge up-front). The public call
   * + member-search routes are ALWAYS Turnstile-gated in production
   * (strict/soft, like login) regardless of this flag — the server decides.
   */
  requireCaptcha: boolean;
  embedDomains: string[];
  campaignId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListActionPagesResponse = {
  pages: ActionPageRecord[];
  total: number;
};

/** What the anonymous widget sees — copy + field config + brand + campaign kind ONLY. */
export type PublicActionPagePayload = {
  page: {
    publicSlug: string;
    type: ActionPageTypeValue;
    preview: boolean;
    headline: string | null;
    body: string | null;
    ctaLabel: string | null;
    successMessage: string | null;
    collectName: boolean;
    collectEmail: boolean;
    collectPhone: boolean;
    allowPrefill: boolean;
    /** Advisory only — the widget always executes Turnstile; the server enforces. */
    requireCaptcha: boolean;
    callsEnabled: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoLandscapeUrl: string | null;
    logoBlockUrl: string | null;
    primaryColour: string | null;
    secondaryColour: string | null;
    customCss: string | null;
  } | null;
  campaign: {
    kind: "TRANSFER" | "ELECTORAL";
    targetLabel: string | null;
    /** Pinned member identities — photo included, never a number. */
    targets: PublicTargetIdentity[];
    /** The widget may browse + choose a member (narrowed by the campaign's filters). */
    chooser: boolean;
  } | null;
};

/** A member as the public widget may see them — identity only, never a number. */
export type PublicTargetIdentity = {
  id: string;
  name: string;
  party: string | null;
  electorate: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
};

export type CreateCallSessionRequest = {
  supporter?: { name?: string; email?: string; phone?: string };
  /** Caller-selected member (pinned set or chooser) — validated server-side. */
  targetPoliticianId?: string;
  /** The embedding page's hostname, for the server-side allowlist re-check. */
  embedAncestor?: string;
};

export type CreateCallSessionResponse = {
  sessionId: string;
  voice: { token: string; expiresAt: string };
  progress: { url: string; token: string; expiresAt: string };
  /** The resolved target's identity (chosen or single-pinned), for display. */
  target: PublicTargetIdentity | null;
};

export type ActionPageSessionRow = {
  id: string;
  status: string;
  supporterName: string | null;
  supporterEmail: string | null;
  embedAncestor: string | null;
  targetName: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type ActionPageResults = {
  stats: {
    started: number;
    connected: number;
    bridged: number;
    averageDurationSeconds: number | null;
  };
  sessions: ActionPageSessionRow[];
};
