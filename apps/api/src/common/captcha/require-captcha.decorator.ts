import { SetMetadata } from "@nestjs/common";

export const REQUIRE_CAPTCHA_KEY = "require_captcha";

/**
 * Enforcement tier for a captcha-gated route:
 * - "strict": fail-closed — reject if the token is missing, invalid, OR the verifier is
 *   unreachable. Use on costly/abuse endpoints (SMS sends, self-signup).
 * - "soft": fail-open on verifier outage — reject only on an explicit verification failure;
 *   allow (and log) if Cloudflare is unreachable, so a vendor outage can't lock out real users.
 */
export type CaptchaTier = "strict" | "soft";

/**
 * Gate a route on a valid Cloudflare Turnstile token (see TurnstileGuard). Routes without
 * this decorator are not captcha-gated. The guard is a no-op when no TURNSTILE_SECRET_KEY is
 * configured (local dev / unconfigured envs).
 */
export const RequireCaptcha = (tier: CaptchaTier = "strict") =>
  SetMetadata(REQUIRE_CAPTCHA_KEY, tier);
