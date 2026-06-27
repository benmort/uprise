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
}

export interface AuthPrincipal {
  id: string;
  email: string | null;
  role: AppRole;
  tenantId: string | null;
  memberships: Membership[];
  /** Env break-glass super-admin (tenant-independent; not a role). Surfaced by GET /auth/check. */
  isSuperAdmin?: boolean;
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

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().max(200).optional(),
  password: z.string().min(8).max(200).optional(),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;

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
  tenantName: string;
  role: AppRole;
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
  phone: string | null;
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
