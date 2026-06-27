import { Controller, Get, Param, Query, Sse } from "@nestjs/common";
import { from, map, Observable, switchMap, takeUntil, timer } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly realtime: RealtimeEventsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get("blasts/:blastId/kpi")
  kpi(@Param("blastId") blastId: string, @Query("channel") channel?: string) {
    return this.analytics.kpiSummary(blastId, channel);
  }

  @Get("blasts/:blastId/trend")
  trend(
    @Param("blastId") blastId: string,
    @Query("minutes") minutes?: string,
    @Query("range") range?: string,
  ) {
    if (String(range || "").toLowerCase() === "all") {
      return this.analytics.engagementTrend(blastId, null);
    }
    const value = Number(minutes || "60");
    return this.analytics.engagementTrend(blastId, Number.isFinite(value) ? value : 60);
  }

  @Get("blasts/:blastId/activity")
  activity(
    @Param("blastId") blastId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("channel") channel?: string,
  ) {
    const lim = Number(limit || "50");
    const off = Number(offset || "0");
    return this.analytics.recipientActivity(
      blastId,
      Number.isFinite(lim) ? lim : 50,
      Number.isFinite(off) ? off : 0,
      channel,
    );
  }

  @Get("blasts/:blastId/status-distribution")
  statusDistribution(@Param("blastId") blastId: string, @Query("channel") channel?: string) {
    return this.analytics.statusDistribution(blastId, channel);
  }

  @Get("dashboard/performance")
  dashboardPerformance(@Query("channel") channel?: string) {
    return this.analytics.dashboardPerformance(channel);
  }

  @Get("dashboard/recent-blasts")
  recent(@Query("limit") limit?: string, @Query("channel") channel?: string) {
    const lim = Number(limit || "20");
    return this.analytics.recentBlasts(Number.isFinite(lim) ? lim : 20, channel);
  }

  @Sse("stream")
  stream(): Observable<MessageEvent> {
    const maxConnectionMs = 25_000;
    const disabled$ = new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: "realtime.disabled" } } as MessageEvent);
      subscriber.complete();
    });

    const events$ = this.realtime.stream.pipe(
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
