import { Controller, Get, Param, Query, Req, Sse } from "@nestjs/common";
import type { Request } from "express";
import { filter, from, map, Observable, switchMap, takeUntil, timer } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// Analytics is an organiser/owner surface (member: read). Every route reads analytics.all;
// blast-scoped reads additionally verify the blast belongs to the caller's tenant (service).
const READ = { action: "read", resource: "analytics.all" } as const;

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly realtime: RealtimeEventsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get("blasts/:blastId/kpi")
  @RequirePermission(READ)
  kpi(@TenantId() tenantId: string, @Param("blastId") blastId: string, @Query("channel") channel?: string) {
    return this.analytics.kpiSummary(tenantId, blastId, channel);
  }

  @Get("blasts/:blastId/trend")
  @RequirePermission(READ)
  trend(
    @TenantId() tenantId: string,
    @Param("blastId") blastId: string,
    @Query("minutes") minutes?: string,
    @Query("range") range?: string,
  ) {
    if (String(range || "").toLowerCase() === "all") {
      return this.analytics.engagementTrend(tenantId, blastId, null);
    }
    const value = Number(minutes || "60");
    return this.analytics.engagementTrend(tenantId, blastId, Number.isFinite(value) ? value : 60);
  }

  @Get("blasts/:blastId/activity")
  @RequirePermission(READ)
  activity(
    @TenantId() tenantId: string,
    @Param("blastId") blastId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("channel") channel?: string,
  ) {
    const lim = Number(limit || "50");
    const off = Number(offset || "0");
    return this.analytics.recipientActivity(
      tenantId,
      blastId,
      Number.isFinite(lim) ? lim : 50,
      Number.isFinite(off) ? off : 0,
      channel,
    );
  }

  @Get("blasts/:blastId/status-distribution")
  @RequirePermission(READ)
  statusDistribution(@TenantId() tenantId: string, @Param("blastId") blastId: string, @Query("channel") channel?: string) {
    return this.analytics.statusDistribution(tenantId, blastId, channel);
  }

  @Get("dashboard/performance")
  @RequirePermission(READ)
  dashboardPerformance(@TenantId() tenantId: string, @Query("channel") channel?: string) {
    return this.analytics.dashboardPerformance(tenantId, channel);
  }

  @Get("dashboard/recent-blasts")
  @RequirePermission(READ)
  recent(@TenantId() tenantId: string, @Query("limit") limit?: string, @Query("channel") channel?: string) {
    const lim = Number(limit || "20");
    return this.analytics.recentBlasts(tenantId, Number.isFinite(lim) ? lim : 20, channel);
  }

  @Sse("stream")
  stream(@Req() req: Request & { streamTenantId?: string }): Observable<MessageEvent> {
    const maxConnectionMs = 25_000;
    // The stream token (verified by BasicAuthGuard) binds the caller's tenant; deliver only
    // that tenant's events. No tenant on the request ⇒ no events (fail closed, never leak).
    const tenantId = req.streamTenantId ?? null;
    const disabled$ = new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: "realtime.disabled" } } as MessageEvent);
      subscriber.complete();
    });

    const events$ = this.realtime.stream.pipe(
      filter((event) => tenantId !== null && event.tenantId === tenantId),
      map((event) => ({ data: event }) as MessageEvent),
      // Close the SSE stream before Vercel's 30s function timeout.
      takeUntil(timer(maxConnectionMs)),
    );

    // FEATURE_REALTIME_ENABLED is a platform-wide toggle (resolved via the global layer).
    return from(this.flags.isEnabled("FEATURE_REALTIME_ENABLED", { tenantId: null })).pipe(
      switchMap((enabled) => (enabled ? events$ : disabled$)),
    );
  }
}
