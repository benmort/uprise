import { Controller, Get, Param, Query, Sse } from "@nestjs/common";
import { map, Observable } from "rxjs";
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
  kpi(@Param("blastId") blastId: string) {
    return this.analytics.kpiSummary(blastId);
  }

  @Get("blasts/:blastId/trend")
  trend(@Param("blastId") blastId: string, @Query("minutes") minutes?: string) {
    const value = Number(minutes || "60");
    return this.analytics.engagementTrend(blastId, Number.isFinite(value) ? value : 60);
  }

  @Get("blasts/:blastId/activity")
  activity(
    @Param("blastId") blastId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const lim = Number(limit || "50");
    const off = Number(offset || "0");
    return this.analytics.recipientActivity(
      blastId,
      Number.isFinite(lim) ? lim : 50,
      Number.isFinite(off) ? off : 0,
    );
  }

  @Get("blasts/:blastId/status-distribution")
  statusDistribution(@Param("blastId") blastId: string) {
    return this.analytics.statusDistribution(blastId);
  }

  @Get("dashboard/performance")
  dashboardPerformance() {
    return this.analytics.dashboardPerformance();
  }

  @Get("dashboard/recent-blasts")
  recent(@Query("limit") limit?: string) {
    const lim = Number(limit || "20");
    return this.analytics.recentBlasts(Number.isFinite(lim) ? lim : 20);
  }

  @Sse("stream")
  stream(): Observable<MessageEvent> {
    if (!this.flags.isRealtimeEnabled()) {
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({ data: { type: "realtime.disabled" } } as MessageEvent);
      });
    }
    return this.realtime.stream.pipe(
      map(
        (event) =>
          ({
            data: event,
          }) as MessageEvent,
      ),
    );
  }
}
