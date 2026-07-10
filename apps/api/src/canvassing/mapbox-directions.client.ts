import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { directionsWindows } from "./turf-estimate.model";

/**
 * Walking durations along an ordered route, from the Mapbox Directions API.
 *
 * **Directions, not Matrix.** Matrix bills per origin–destination *element*: a 25×25 window
 * is 625 elements, so pricing a 28,580-building turf exactly would be 744,375 elements —
 * roughly $1,191 against a 100,000-element free tier. The same route on Directions is 1,191
 * *requests*, inside the free tier. Matrix is the right tool for re-ordering a route with
 * real distances; it is the wrong tool for timing one.
 *
 * Requires a **server-side** `MAPBOX_TOKEN`. The browser's `NEXT_PUBLIC_MAPBOX_TOKEN` must
 * never be used here — it is public, and it would spend the map's quota on a background job.
 * With no token the client reports itself disabled and the caller falls back to straight
 * lines, labelling the estimate accordingly. It must never silently pretend.
 */

export type LngLat = { lat: number; lng: number };

/** The API's hard limit: 25 coordinates per request (verified against the docs). */
export const MAX_WAYPOINTS = 25;

const ENDPOINT = "https://api.mapbox.com/directions/v5/mapbox/walking";

type DirectionsResponse = {
  code?: string;
  message?: string;
  routes?: Array<{ legs?: Array<{ duration?: number; distance?: number }> }>;
};

export type RoutePricing = { seconds: number; metres: number; requests: number };

@Injectable()
export class MapboxDirectionsClient {
  private readonly logger = new Logger(MapboxDirectionsClient.name);
  private nextAllowedAtMs = 0;

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>("MAPBOX_TOKEN", "");
  }

  /** False when no server token is configured — the caller must degrade, not guess. */
  get enabled(): boolean {
    return this.token.length > 0;
  }

  /**
   * Requests per minute we allow ourselves.
   *
   * Mapbox does not publish a per-minute figure for Directions on the endpoint's own docs
   * page, so this is a self-imposed ceiling rather than a transcription. `Retry-After` and
   * 429 are honoured regardless — those are the authority, not this number.
   */
  private get ratePerMinute(): number {
    const raw = Number(this.config.get<string>("MAPBOX_DIRECTIONS_RPM", "240"));
    return Number.isFinite(raw) && raw > 0 ? raw : 240;
  }

  /**
   * Walking seconds and metres along an ordered route.
   *
   * Split into windows of 25 waypoints overlapping by one, so every consecutive leg falls
   * inside exactly one request and none is stitched together with a straight line. Returns
   * null if any window fails — a partial route would silently under-count the walk, which is
   * worse than admitting we do not know.
   */
  async priceRoute(ordered: LngLat[]): Promise<RoutePricing | null> {
    if (!this.enabled || ordered.length < 2) return null;

    const windows = directionsWindows(ordered, MAX_WAYPOINTS);
    let seconds = 0;
    let metres = 0;

    for (const window of windows) {
      const legs = await this.legs(window);
      if (!legs) {
        this.logger.warn(`Directions failed for a window of ${window.length}; abandoning the route`);
        return null;
      }
      for (const leg of legs) {
        seconds += leg.duration;
        metres += leg.distance;
      }
    }
    return { seconds, metres, requests: windows.length };
  }

  /** One request: the legs between consecutive waypoints. Null on any failure. */
  async legs(waypoints: LngLat[]): Promise<Array<{ duration: number; distance: number }> | null> {
    if (!this.enabled || waypoints.length < 2 || waypoints.length > MAX_WAYPOINTS) return null;

    const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${ENDPOINT}/${coords}?overview=false&access_token=${encodeURIComponent(this.token)}`;

    const json = await this.request(url);
    if (!json?.routes?.[0]?.legs) return null;

    return json.routes[0].legs.map((leg) => ({
      duration: Number(leg.duration ?? 0),
      distance: Number(leg.distance ?? 0),
    }));
  }

  /** Self-throttled, retried on 429/5xx, honouring `Retry-After`. */
  private async request(url: string, attempt = 0): Promise<DirectionsResponse | null> {
    await this.throttle();

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      if (attempt < 3) return this.request(url, attempt + 1);
      this.logger.warn(`Directions request failed: ${String(err)}`);
      return null;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) return null;
      const retryAfter = this.retryAfterMs(res.headers);
      await sleep(retryAfter ?? Math.min(4_000, 250 * 2 ** attempt));
      return this.request(url, attempt + 1);
    }
    if (!res.ok) {
      this.logger.warn(`Directions returned ${res.status}`);
      return null;
    }
    return (await res.json()) as DirectionsResponse;
  }

  /** A simple token bucket — one request per `60_000 / ratePerMinute` milliseconds. */
  private async throttle(): Promise<void> {
    const minIntervalMs = Math.max(1, Math.ceil(60_000 / this.ratePerMinute));
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAtMs - now);
    this.nextAllowedAtMs = Math.max(this.nextAllowedAtMs, now) + minIntervalMs;
    await sleep(waitMs);
  }

  private retryAfterMs(headers: Headers): number | null {
    const raw = headers.get("retry-after");
    if (!raw) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}
