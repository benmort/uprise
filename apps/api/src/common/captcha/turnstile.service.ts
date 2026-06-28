import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** verify() outcome. Callers (the guard) decide fail-open vs fail-closed on "unavailable". */
export type VerifyOutcome = "pass" | "fail" | "unavailable";

/**
 * Cloudflare Turnstile token verification (server-side siteverify). Stateless wrapper around
 * the HTTP call with a bounded timeout. The secret never leaves the API.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * True when captcha should be enforced: a secret is configured AND we're in production.
   * Dev/preview/local are exempt (returns false → the guard no-ops) so their auth flows
   * aren't blocked by a token Cloudflare can't verify for those domains.
   */
  isConfigured(): boolean {
    if (!this.isProductionEnv()) return false;
    return Boolean(this.config.get<string>("TURNSTILE_SECRET_KEY")?.trim());
  }

  /** Production only — keyed off Vercel's VERCEL_ENV, falling back to NODE_ENV off-Vercel. */
  private isProductionEnv(): boolean {
    const vercelEnv = this.config.get<string>("VERCEL_ENV")?.trim().toLowerCase();
    if (vercelEnv) return vercelEnv === "production";
    return this.config.get<string>("NODE_ENV")?.trim().toLowerCase() === "production";
  }

  /**
   * Verify a token against Cloudflare. "fail" = explicit rejection (missing/bad/expired/replayed
   * token); "unavailable" = couldn't reach Cloudflare (network error/timeout/5xx).
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<VerifyOutcome> {
    const secret = this.config.get<string>("TURNSTILE_SECRET_KEY")?.trim();
    if (!secret) return "pass"; // not configured → no-op (guard also short-circuits via isConfigured)
    if (!token || !token.trim()) return "fail";

    const timeoutMs = Number(this.config.get<string>("TURNSTILE_TIMEOUT_MS", "5000")) || 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = new URLSearchParams();
      body.set("secret", secret);
      body.set("response", token.trim());
      if (remoteIp) body.set("remoteip", remoteIp);

      const res = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify returned HTTP ${res.status}`);
        return "unavailable";
      }
      const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
      if (data.success) return "pass";
      this.logger.warn(`Turnstile verification failed: ${(data["error-codes"] ?? []).join(",")}`);
      return "fail";
    } catch (err) {
      this.logger.warn(
        `Turnstile siteverify error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "unavailable";
    } finally {
      clearTimeout(timer);
    }
  }
}
