import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const DEFAULT_ENDPOINT = "https://query.wikidata.org/sparql";
const DEFAULT_USER_AGENT = "uprise-civic/1.0 (https://uprise.org.au; civic reference data)";

/** A non-retryable or retry-exhausted Wikidata request failure. */
export class WikidataError extends Error {}

/** A SPARQL result row, flattened from `{ var: { value } }` to `{ var: value }`. */
export type SparqlRow = Record<string, string>;

/**
 * Minimal SPARQL client for the Wikidata Query Service. No API key; a descriptive `User-Agent`
 * is required by Wikidata. The public endpoint rate-limits aggressively (429) and times out at
 * 60s, so this throttles + retries with exponential backoff (honouring `Retry-After`), and the
 * caller keeps queries lean (one chamber at a time). Resilience mirrors `theyvoteforyou.client.ts`.
 */
@Injectable()
export class WikidataClient {
  private readonly logger = new Logger(WikidataClient.name);
  private nextAllowedAtMs = 0;

  constructor(private readonly config: ConfigService) {}

  private num(name: string, fallback: number, min: number, max: number): number {
    const parsed = Number(this.config.get<string>(name) ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private get endpoint(): string {
    return this.config.get<string>("WIKIDATA_SPARQL_URL") || DEFAULT_ENDPOINT;
  }
  private get userAgent(): string {
    return this.config.get<string>("WIKIDATA_USER_AGENT") || DEFAULT_USER_AGENT;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async throttle(): Promise<void> {
    const ratePerSecond = this.num("WIKIDATA_REQUESTS_PER_SECOND", 2, 1, 10);
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

  /** Run a SELECT query, returning rows as flat `{ var: value }` maps. */
  async select(query: string): Promise<SparqlRow[]> {
    const url = `${this.endpoint}?query=${encodeURIComponent(query)}&format=json`;
    const maxRetries = this.num("WIKIDATA_MAX_RETRIES", 5, 0, 10);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await this.throttle();
        const res = await fetch(url, {
          headers: { "User-Agent": this.userAgent, Accept: "application/sparql-results+json" },
        });
        if (!res.ok) {
          if (attempt < maxRetries && (res.status === 429 || res.status >= 500)) {
            const backoffMs = this.parseRetryAfterMs(res.headers) ?? Math.min(30000, 1000 * 2 ** attempt);
            await this.sleep(backoffMs + Math.floor(Math.random() * 250));
            continue;
          }
          throw new WikidataError(`Wikidata SPARQL ${res.status}`);
        }
        const json = (await res.json()) as {
          results?: { bindings?: Array<Record<string, { value: string }>> };
        };
        return (json.results?.bindings ?? []).map((binding) => {
          const row: SparqlRow = {};
          for (const [key, cell] of Object.entries(binding)) row[key] = cell.value;
          return row;
        });
      } catch (error) {
        if (error instanceof WikidataError) throw error;
        if (attempt >= maxRetries) throw new WikidataError(`Wikidata request failed: ${String(error)}`);
        await this.sleep(Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250));
      }
    }
    throw new WikidataError("Wikidata request failed");
  }
}
