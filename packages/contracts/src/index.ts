import { z } from "zod";

/**
 * Shared auth contracts (meld doc 14) — Zod schemas + inferred types for the IAM
 * flows, consumed by @yarns/api-client and the frontends (apps/auth, apps/web).
 * The API keeps its own class-validator request DTOs; these are the wire types
 * the clients validate against.
 */

// ── Response envelope (mirrors the API's ApiResponseInterceptor) ──────
export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Principal + membership ────────────────────────────────────────────
export type AppRole = "ORGANISER" | "CANVASSER";

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
