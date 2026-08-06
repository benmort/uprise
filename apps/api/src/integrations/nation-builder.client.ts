import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationAuthError, IntegrationConnectionError } from "./integration.errors";

/**
 * The one HTTP client every NationBuilder call rides – read AND (later) write – so the
 * throttle below is the single budget for a nation's rate limit. Ported from the Action
 * Network connector's machinery (`action-network.connector.ts`), which the NationBuilder
 * connector previously lacked entirely: a long list pull would hammer the nation until
 * NationBuilder 429'd, and the 429 surfaced as a hard failure.
 *
 * NationBuilder's documented limit is 250 requests per 10 seconds, enforced as TWO
 * independent budgets: per API token AND per source IP (support article "API rate
 * limit policy"; raiseable only by asking NB support). The throttle here is keyed by
 * host, which equals per-token in practice (one token per nation connection). The
 * default 8 req/s (80/10s) sits well under the token budget; the per-IP budget is the
 * one to watch if MANY nations ever sync from one egress IP — 429s honour Retry-After,
 * so the retry loop absorbs occasional collisions either way.
 */
@Injectable()
export class NationBuilderClient {
  constructor(private readonly config: ConfigService) {}

  /** Next allowed send time per nation host – the token bucket's clock hand. */
  private readonly nextAllowedAtMsByHost = new Map<string, number>();

  private getNumber(key: string, fallback: number, min: number, max: number): number {
    const raw = Number(this.config.get<string>(key) ?? fallback);
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(raw)));
  }

  private getRequestRatePerSecond(): number {
    return this.getNumber("NATION_BUILDER_REQUEST_RATE_PER_SECOND", 8, 1, 50);
  }

  private getRetryCount(): number {
    return this.getNumber("NATION_BUILDER_REQUEST_RETRIES", 3, 0, 8);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private hostOf(requestUrl: string): string {
    try {
      return new URL(requestUrl).host;
    } catch {
      return requestUrl;
    }
  }

  private async throttleRequest(requestUrl: string): Promise<void> {
    const host = this.hostOf(requestUrl);
    const minIntervalMs = Math.max(1, Math.ceil(1000 / this.getRequestRatePerSecond()));
    const now = Date.now();
    const nextAllowedAtMs = this.nextAllowedAtMsByHost.get(host) ?? 0;
    const waitMs = Math.max(0, nextAllowedAtMs - now);
    this.nextAllowedAtMsByHost.set(host, Math.max(nextAllowedAtMs, now) + minIntervalMs);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  private parseRetryAfterMs(headers: Headers): number | null {
    const retryAfterRaw = headers.get("retry-after");
    if (!retryAfterRaw) return null;
    const retryAfterSeconds = Number(retryAfterRaw);
    if (Number.isFinite(retryAfterSeconds)) {
      return Math.max(0, Math.trunc(retryAfterSeconds * 1000));
    }
    const retryAt = Date.parse(retryAfterRaw);
    if (!Number.isFinite(retryAt)) return null;
    return Math.max(0, retryAt - Date.now());
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /**
   * One throttled, retried NationBuilder request. 401/403 throw `IntegrationAuthError`
   * immediately (a bad token never improves with retries); 429 and 5xx honour
   * `Retry-After` then fall back to capped exponential backoff with jitter; network
   * errors retry the same way. Anything still failing after the budget surfaces as
   * `IntegrationConnectionError` with the caller's message.
   */
  async requestJson<T>(
    requestUrl: string,
    apiKey: string,
    failure: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const maxRetries = this.getRetryCount();
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await this.throttleRequest(requestUrl);
        const res = await fetch(requestUrl, {
          method: init?.method ?? "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        });
        if (res.status === 401 || res.status === 403) {
          throw new IntegrationAuthError("NationBuilder token rejected");
        }
        if (!res.ok) {
          if (attempt < maxRetries && this.shouldRetryStatus(res.status)) {
            const retryAfterMs = this.parseRetryAfterMs(res.headers);
            const backoffMs = retryAfterMs ?? Math.min(10000, 500 * 2 ** attempt);
            const jitterMs = Math.floor(Math.random() * 150);
            await this.sleep(backoffMs + jitterMs);
            continue;
          }
          throw new IntegrationConnectionError(failure, { status: res.status });
        }
        return (await res.json()) as T;
      } catch (error) {
        if (error instanceof IntegrationAuthError || error instanceof IntegrationConnectionError) {
          throw error;
        }
        if (attempt >= maxRetries) {
          throw new IntegrationConnectionError(failure, { cause: String(error) });
        }
        const backoffMs = Math.min(10000, 500 * 2 ** attempt);
        const jitterMs = Math.floor(Math.random() * 150);
        await this.sleep(backoffMs + jitterMs);
      }
    }
    throw new IntegrationConnectionError(failure);
  }
}
