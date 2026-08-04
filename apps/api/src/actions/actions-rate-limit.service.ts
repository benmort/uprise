import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiHttpException } from "../common/http/api-response";
import { AUTODIALER_FACADE, type AutodialerFacade } from "./autodialer.facade";

type CounterBucket = { windowStartMs: number; count: number };

/**
 * Two-layer limiter for the public call-session mint — the one endpoint that
 * spends tenant Twilio money on an anonymous request.
 *
 * Layer 1: in-memory fixed windows (per-IP and per-page), the
 * BasicRateLimitMiddleware bucket mechanics. Cheap, but per-instance on
 * serverless — honest first line only.
 *
 * Layer 2: durable caps counted in the database via the autodialer facade
 * (sessions today / concurrently active per page). These survive restarts and
 * horizontal scale, and are the caps that actually bound spend.
 *
 * All trips throw 429 RATE_LIMITED (no detail that helps an abuser tune).
 */
@Injectable()
export class ActionsRateLimitService {
  private readonly ipMinute = new Map<string, CounterBucket>();
  private readonly ipHour = new Map<string, CounterBucket>();
  private readonly pageMinute = new Map<string, CounterBucket>();

  constructor(
    private readonly config: ConfigService,
    @Inject(AUTODIALER_FACADE) private readonly autodialer: AutodialerFacade,
  ) {}

  private intEnv(key: string, fallback: number, min: number, max: number): number {
    const raw = Number(this.config.get<string>(key, String(fallback)));
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(Math.max(min, Math.trunc(raw)), max);
  }

  private bump(map: Map<string, CounterBucket>, key: string, windowMs: number, limit: number, now: number): boolean {
    const bucket = map.get(key);
    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      map.set(key, { windowStartMs: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    if (map.size > 10_000) {
      // Bound memory: drop expired buckets when the map grows unreasonably.
      for (const [k, b] of map) if (now - b.windowStartMs >= windowMs) map.delete(k);
    }
    return bucket.count <= limit;
  }

  /** Throws 429 when any window or durable cap is exceeded. Call BEFORE any spend. */
  async assertWithinLimits(pageId: string, clientIp: string | null, now = Date.now()): Promise<void> {
    const perIpMinute = this.intEnv("ACTIONS_RATE_IP_PER_MINUTE", 5, 1, 1000);
    const perIpHour = this.intEnv("ACTIONS_RATE_IP_PER_HOUR", 20, 1, 10_000);
    const perPageMinute = this.intEnv("ACTIONS_RATE_PAGE_PER_MINUTE", 30, 1, 10_000);

    const ip = clientIp || "unknown";
    const okIpMinute = this.bump(this.ipMinute, ip, 60_000, perIpMinute, now);
    const okIpHour = this.bump(this.ipHour, ip, 3_600_000, perIpHour, now);
    const okPageMinute = this.bump(this.pageMinute, pageId, 60_000, perPageMinute, now);
    if (!okIpMinute || !okIpHour || !okPageMinute) {
      throw new ApiHttpException("RATE_LIMITED", "Too many call requests — try again shortly.", 429);
    }

    const maxPerDay = this.intEnv("ACTIONS_MAX_SESSIONS_PER_DAY", 500, 1, 100_000);
    const maxConcurrent = this.intEnv("ACTIONS_MAX_CONCURRENT_SESSIONS", 25, 1, 1000);
    const dayStart = new Date(now - 24 * 3_600_000);
    const [today, active] = await Promise.all([
      this.autodialer.countSessions(pageId, { since: dayStart }),
      this.autodialer.countSessions(pageId, { activeOnly: true }),
    ]);
    if (today >= maxPerDay || active >= maxConcurrent) {
      throw new ApiHttpException("RATE_LIMITED", "This page has reached its calling capacity for now.", 429);
    }
  }
}
