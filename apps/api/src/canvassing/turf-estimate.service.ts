import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { MapboxDirectionsClient } from "./mapbox-directions.client";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { QUEUE_JOB_TYPES, QUEUE_NAMES, getTurfEstimateJobId } from "../common/queue/queue.constants";
import {
  crowFliesWalkSeconds,
  directionsWindows,
  estimateTurf,
  groupBuildings,
  orderBuildings,
  PRIOR_ALLOWANCE,
  type Door,
} from "./turf-estimate.model";

/**
 * How long a turf takes to knock, computed and cached.
 *
 * Two costs, both real. The walk between buildings comes from Mapbox where a server token
 * exists (real footpaths, real crossings) and from straight lines otherwise — and the row
 * records which, because a straight line always flatters a turf and must never be presented
 * as a measurement. The time at the door comes from {@link PRIOR_ALLOWANCE}, which is
 * literature, not evidence, until `canvass.DoorKnock` has rows.
 */

/**
 * Above this many buildings the estimate is not computed inside a request.
 *
 * Nearest-neighbour ordering is O(n²); Kew's 28,580 buildings would block the event loop
 * for seconds, and pricing them exactly is 1,191 Directions requests. Such a turf is
 * twenty-seven shifts of work and should have been split — saying so is the estimator's
 * job, not something to spend five minutes of API quota discovering.
 */
export const INLINE_BUILDING_CAP = 2_000;

@Injectable()
export class TurfEstimateService {
  private readonly logger = new Logger(TurfEstimateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directions: MapboxDirectionsClient,
    @Inject(DISPATCH_QUEUE_TOKEN) private readonly queue: DispatchQueue,
  ) {}

  /**
   * Price a turf on demand: inline if it is small enough, on the worker if it is not.
   *
   * The size cap is not a refusal. Ordering 28,580 buildings takes seconds of CPU and
   * pricing them exactly costs 1,191 rate-limited Directions requests — neither belongs in
   * a request handler, and both are fine in a job. The caller is told which happened.
   */
  async requestRefresh(tenantId: string, turfId: string): Promise<{ queued: boolean; estimate: unknown }> {
    try {
      return { queued: false, estimate: await this.refresh(tenantId, turfId) };
    } catch (err) {
      if (errorCode(err) !== "TURF_TOO_LARGE_TO_ESTIMATE") throw err;
      await this.queue.enqueue({
        id: getTurfEstimateJobId(turfId),
        queue: QUEUE_NAMES.TURF_ESTIMATE,
        type: QUEUE_JOB_TYPES.TURF_ESTIMATE_RUN,
        payload: { tenantId, turfId },
        removeOnComplete: true,
      });
      return { queued: true, estimate: null };
    }
  }

  /** The cached estimate, or null when the turf has never been priced. */
  async get(tenantId: string, turfId: string) {
    return this.prisma.turfEstimate.findFirst({ where: { turfId, tenantId } });
  }

  /**
   * The `turf-estimate` worker's entry point.
   *
   * `force` is what a job is for: ordering 28,580 buildings takes seconds of CPU and pricing
   * them exactly costs 1,191 rate-limited Directions requests. Neither belongs in a request
   * handler, and both are fine here. A turf the organiser deletes mid-run simply vanishes —
   * the job swallows that rather than retrying against a row that no longer exists.
   */
  async processEstimateJob(payload: { tenantId: string; turfId: string }) {
    try {
      return await this.refresh(payload.tenantId, payload.turfId, { force: true });
    } catch (err) {
      if (errorCode(err) === "TURF_NOT_FOUND") {
        this.logger.log(`Turf ${payload.turfId} disappeared before it could be priced`);
        return null;
      }
      throw err;
    }
  }

  /**
   * Price a turf and cache the result.
   *
   * `force` prices the walk with Mapbox even past the inline cap — for a queued job, where
   * spending several minutes of rate-limited requests is the point. A request handler must
   * never pass it.
   */
  async refresh(tenantId: string, turfId: string, opts: { force?: boolean } = {}) {
    const turf = await this.prisma.turf.findFirst({
      where: { id: turfId, tenantId },
      select: { id: true, geometry: true },
    });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");

    const doors = (await this.prisma.contact.findMany({
      where: { tenantId, turfId, lat: { not: null }, lng: { not: null } },
      select: { id: true, lat: true, lng: true },
    })) as Array<{ id: string; lat: number; lng: number }>;

    const buildings = groupBuildings(doors as Door[]);
    const geometryHash = hashGeometry(turf.geometry);

    // Nothing to walk. Store the zeroes rather than nothing, so the UI can say "no doors"
    // instead of "not estimated yet".
    if (buildings.length === 0) {
      return this.upsert(tenantId, turfId, geometryHash, estimateTurf([], 0), "crowflies", 0);
    }

    // Too big to order inside a request. Refuse rather than block, unless a job forced it.
    if (buildings.length > INLINE_BUILDING_CAP && !opts.force) {
      throw new ApiHttpException(
        "TURF_TOO_LARGE_TO_ESTIMATE",
        `This turf holds ${buildings.length.toLocaleString()} buildings. Split it — a shift is about 100 doors.`,
      );
    }

    const ordered = orderBuildings(buildings);

    // Mapbox walks the footpaths; straight lines are the fallback, never a silent one.
    let walkSeconds = crowFliesWalkSeconds(ordered, PRIOR_ALLOWANCE.walkSpeedMps);
    let source: "directions" | "crowflies" = "crowflies";
    let requests = 0;

    if (this.directions.enabled) {
      const priced = await this.directions.priceRoute(ordered.map((b) => ({ lat: b.lat, lng: b.lng })));
      if (priced) {
        walkSeconds = priced.seconds;
        source = "directions";
        requests = priced.requests;
      } else {
        this.logger.warn(`Directions could not price turf ${turfId}; falling back to straight lines`);
      }
    }

    const estimate = estimateTurf(ordered, walkSeconds);
    return this.upsert(tenantId, turfId, geometryHash, estimate, source, requests);
  }

  /** How many Directions requests pricing this turf would cost, before spending any. */
  requestCost(buildingCount: number): number {
    return directionsWindows(Array.from({ length: buildingCount }), 25).length;
  }

  private upsert(
    tenantId: string,
    turfId: string,
    geometryHash: string,
    e: ReturnType<typeof estimateTurf>,
    source: string,
    requests: number,
  ) {
    const data = { ...e, tenantId, geometryHash, source, requests, computedAt: new Date() };
    return this.prisma.turfEstimate.upsert({
      where: { turfId },
      create: { turfId, ...data },
      update: data,
    });
  }
}

/**
 * A stable fingerprint of the turf's shape.
 *
 * A re-cut changes which doors are inside, so it must invalidate the estimate. Hashing the
 * geometry rather than trusting `updatedAt` means renaming a turf does not throw away a
 * price that cost 1,191 API requests to compute.
 */
export function hashGeometry(geometry: unknown): string {
  return createHash("sha1").update(JSON.stringify(geometry ?? null)).digest("hex");
}

/** `ApiHttpException` keeps its code in the response body, not on `.message`. */
function errorCode(err: unknown): string | null {
  const body = (err as { getResponse?: () => unknown })?.getResponse?.() as
    | { error?: { code?: string } }
    | undefined;
  return body?.error?.code ?? null;
}
