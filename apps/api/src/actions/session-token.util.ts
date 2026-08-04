import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { resolveStreamTokenSecret } from "../auth/stream-token-secret";

/**
 * Anonymous-capability tokens for the public action surface, HMAC-signed like
 * the analytics stream token but scoped to ONE session or ONE page:
 *
 *   progress — authorises the SSE call-progress stream for a single call session
 *   preview  — lets the embed route render a single DRAFT page (admin preview)
 *
 * The purpose is bound into the signature, so a preview token can never open a
 * progress stream and vice versa. Payload format (base64url of):
 *   `${purpose}.${expiresAt}.${nonce}.${tenantId}.${subjectId}.${signature}`
 */
export type SessionTokenPurpose = "progress" | "preview";

export type SessionTokenVerification =
  | { ok: true; tenantId: string; subjectId: string }
  | {
      ok: false;
      reason: "missing_token" | "missing_secret" | "decode_failed" | "invalid_payload" | "expired" | "invalid_signature" | "wrong_purpose";
    };

function sign(secret: string, purpose: string, expiresAt: number, nonce: string, tenantId: string, subjectId: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}.${expiresAt}.${nonce}.${tenantId}.${subjectId}`)
    .digest("base64url");
}

/** ACTIONS_SESSION_TOKEN_SECRET wins; falls back to the stream-token secret chain. */
export function resolveActionsTokenSecret(config: ConfigService): string {
  const own = (config.get<string>("ACTIONS_SESSION_TOKEN_SECRET") || "").trim();
  if (own) return own;
  return resolveStreamTokenSecret(config).secret;
}

export function createSessionToken(
  secret: string,
  purpose: SessionTokenPurpose,
  ttlSeconds: number,
  tenantId: string,
  subjectId: string,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const nonce = randomBytes(12).toString("base64url");
  const signature = sign(secret, purpose, expiresAt, nonce, tenantId, subjectId);
  const payload = `${purpose}.${expiresAt}.${nonce}.${tenantId}.${subjectId}.${signature}`;
  return { token: Buffer.from(payload, "utf8").toString("base64url"), expiresAt };
}

export function verifySessionToken(
  token: string,
  secret: string,
  purpose: SessionTokenPurpose,
): SessionTokenVerification {
  if (!token) return { ok: false, reason: "missing_token" };
  if (!secret) return { ok: false, reason: "missing_secret" };
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "decode_failed" };
  }
  const parts = decoded.split(".");
  if (parts.length !== 6) return { ok: false, reason: "invalid_payload" };
  const [tokenPurpose, expiresRaw, nonce, tenantId, subjectId, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !nonce || !tenantId || !subjectId || !signature) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (tokenPurpose !== purpose) return { ok: false, reason: "wrong_purpose" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };
  const expected = sign(secret, tokenPurpose, expiresAt, nonce, tenantId, subjectId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid_signature" };
  return { ok: true, tenantId, subjectId };
}
