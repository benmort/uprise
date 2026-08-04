import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import Twilio from "twilio";

/**
 * Validate X-Twilio-Signature with the token of the account that SENT the
 * webhook. Per-tenant subaccounts sign with their own tokens, so callers
 * resolve the token first (TelephonyWebhookAuthService — by To number,
 * AccountSid or BundleSid) and pass it in; the platform env token is only ever
 * a fallback the RESOLVER applies, never this util.
 *
 * Fails closed on every path: no token, no signature header, or a mismatch all
 * throw — an unverifiable webhook must never execute. Extracted from
 * WebhooksController so the autodialer's IVR surface validates identically.
 */
export function validateTwilioWebhookSignature(
  req: Request,
  body: Record<string, unknown>,
  token: string | undefined,
): void {
  if (!token) {
    throw new UnauthorizedException("Twilio auth token not configured");
  }
  const signature =
    (req.headers["x-twilio-signature"] as string) || (req.headers["X-Twilio-Signature"] as string);
  if (!signature) {
    throw new UnauthorizedException("Missing X-Twilio-Signature");
  }
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  const url = `${protocol}://${host}${req.originalUrl}`;
  const isValid = Twilio.validateRequest(token, signature, url, (body as Record<string, string>) || {});
  if (!isValid) {
    throw new UnauthorizedException("Invalid Twilio signature");
  }
}
