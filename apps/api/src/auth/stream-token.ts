import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

export function verifyStreamToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const [expiresRaw, nonce, signature] = decoded.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !nonce || !signature) return false;
  if (Date.now() > expiresAt) return false;
  const expected = sign(secret, expiresAt, nonce);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
