import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const DEFAULT_BASE_URL = "https://theyvoteforyou.org.au/api/v1";

/** The TVFY API key was rejected (401/403) — no point retrying. */
export class TheyVoteForYouAuthError extends Error {}
/** A non-retryable or retry-exhausted TVFY request failure. */
export class TheyVoteForYouError extends Error {}

// ── Response shapes (partial — only the fields the sync consumes) ───────────────
export interface TvfyMember {
  /** The nested member id (distinct from the person id) — unused by the sync. */
  id?: number;
  name?: { first?: string | null; last?: string | null } | null;
  electorate?: string | null;
  /** "representatives" | "senate". */
  house?: string | null;
  party?: string | null;
}
export interface TvfyPerson {
  /** The person id — our natural key (distinct from the nested member id). */
  id: number;
  latest_member?: TvfyMember | null;
}
export interface TvfyPolicyRef {
  id: number;
  name?: string | null;
  description?: string | null;
  provisional?: boolean | null;
  last_edited_at?: string | null;
}
export interface TvfyPolicyComparison {
  policy: TvfyPolicyRef;
  /** Agreement score 0–100, returned as a string. */
  agreement: string | number;
  voted: boolean;
}
export interface TvfyPersonDetail extends TvfyPerson {
  rebellions?: number | null;
  votes_attended?: number | null;
  votes_possible?: number | null;
  offices?: unknown[] | null;
  policy_comparisons?: TvfyPolicyComparison[] | null;
}
export interface TvfyPolicy {
  id: number;
  name: string;
  description?: string | null;
  provisional?: boolean | null;
  last_edited_at?: string | null;
}

/**
 * Read client for the They Vote For You REST API (OpenAustralia Foundation). The API key is a
 * platform-wide query-param credential read from `THEYVOTEFORYOU_API_KEY` (never client-exposed);
 * error/log strings use a key-free URL. Resilience — token-bucket rate limit + retry on 429/5xx
 * honouring `Retry-After` with exponential backoff — mirrors {@link ActionNetworkConnector}.
 */
@Injectable()
export class TheyVoteForYouClient {
  private readonly logger = new Logger(TheyVoteForYouClient.name);
  private nextAllowedAtMs = 0;

  constructor(private readonly config: ConfigService) {}

  private num(name: string, fallback: number, min: number, max: number): number {
    const parsed = Number(this.config.get<string>(name) ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private get baseUrl(): string {
    return this.config.get<string>("THEYVOTEFORYOU_API_BASE_URL") || DEFAULT_BASE_URL;
  }

  private get apiKey(): string {
    const key = this.config.get<string>("THEYVOTEFORYOU_API_KEY");
    if (!key) throw new TheyVoteForYouError("THEYVOTEFORYOU_API_KEY is not configured");
    return key;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async throttle(): Promise<void> {
    const ratePerSecond = this.num("THEYVOTEFORYOU_SYNC_REQUESTS_PER_SECOND", 3, 1, 20);
    const minIntervalMs = Math.max(1, Math.ceil(1000 / ratePerSecond));
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAtMs - now);
    this.nextAllowedAtMs = Math.max(this.nextAllowedAtMs, now) + minIntervalMs;
    if (waitMs > 0) await this.sleep(waitMs);
  }

  private parseRetryAfterMs(headers: Headers): number | null {
    const raw = headers.get("retry-after");
    if (!raw) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, Math.trunc(seconds * 1000));
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /** GET `<base>/<path>?key=…` with resilience. Returns parsed JSON, or null on 404. */
  private async requestJson<T>(path: string): Promise<T | null> {
    const safeUrl = `${this.baseUrl}/${path}`; // key-free — safe to log / put in errors
    const url = `${safeUrl}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(this.apiKey)}`;
    const maxRetries = this.num("THEYVOTEFORYOU_SYNC_MAX_RETRIES", 5, 0, 10);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await this.throttle();
        const res = await fetch(url);
        if (res.status === 401 || res.status === 403) {
          throw new TheyVoteForYouAuthError(`They Vote For You API key rejected for ${safeUrl}`);
        }
        if (res.status === 404) return null;
        if (!res.ok) {
          if (attempt < maxRetries && this.shouldRetry(res.status)) {
            const backoffMs = this.parseRetryAfterMs(res.headers) ?? Math.min(10000, 500 * 2 ** attempt);
            await this.sleep(backoffMs + Math.floor(Math.random() * 150));
            continue;
          }
          throw new TheyVoteForYouError(`They Vote For You ${res.status} for ${safeUrl}`);
        }
        return (await res.json()) as T;
      } catch (error) {
        if (error instanceof TheyVoteForYouAuthError || error instanceof TheyVoteForYouError) throw error;
        if (attempt >= maxRetries) {
          throw new TheyVoteForYouError(`They Vote For You request failed for ${safeUrl}: ${String(error)}`);
        }
        await this.sleep(Math.min(10000, 500 * 2 ** attempt) + Math.floor(Math.random() * 150));
      }
    }
    throw new TheyVoteForYouError(`They Vote For You request failed for ${safeUrl}`);
  }

  /** All current members of parliament (basic info: id + latest_member). */
  async listPeople(): Promise<TvfyPerson[]> {
    return (await this.requestJson<TvfyPerson[]>("people.json")) ?? [];
  }

  /** A person's detail: stats, offices and per-policy agreement (policy_comparisons). */
  async getPerson(id: number): Promise<TvfyPersonDetail | null> {
    return this.requestJson<TvfyPersonDetail>(`people/${id}.json`);
  }

  /** All policies (basic info). */
  async listPolicies(): Promise<TvfyPolicy[]> {
    return (await this.requestJson<TvfyPolicy[]>("policies.json")) ?? [];
  }

  /** A policy's detail (unused by v1 sync; reserved for people_comparisons `category`). */
  async getPolicy(id: number): Promise<TvfyPolicy | null> {
    return this.requestJson<TvfyPolicy>(`policies/${id}.json`);
  }
}
