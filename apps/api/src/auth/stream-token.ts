import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type StreamTokenFailureReason =
  | "missing_token"
  | "missing_secret"
  | "decode_failed"
  | "invalid_payload"
  | "expired"
  | "invalid_signature";

export type StreamTokenVerificationResult =
  | { ok: true }
  | { ok: false; reason: StreamTokenFailureReason };

function sign(secret: string, expiresAt: number, nonce: string): string {
  return createHmac("sha256", secret)
    .update(`${expiresAt}.${nonce}`)
    .digest("base64url");
}

export function createStreamToken(secret: string, ttlSeconds: number): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const nonce = randomBytes(12).toString("base64url");
  const signature = sign(secret, expiresAt, nonce);
  const payload = `${expiresAt}.${nonce}.${signature}`;
  return {
    token: Buffer.from(payload, "utf8").toString("base64url"),
    expiresAt,
  };
}

export function verifyStreamTokenDetailed(
  token: string,
  secret: string,
): StreamTokenVerificationResult {
  if (!token) return { ok: false, reason: "missing_token" };
  if (!secret) return { ok: false, reason: "missing_secret" };
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "decode_failed" };
  }
  const [expiresRaw, nonce, signature] = decoded.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !nonce || !signature) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };
  const expected = sign(secret, expiresAt, nonce);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "invalid_signature" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "invalid_signature" };
  return { ok: true };
}

export function verifyStreamToken(token: string, secret: string): boolean {
  return verifyStreamTokenDetailed(token, secret).ok;
}
