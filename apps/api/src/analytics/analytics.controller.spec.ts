import { Observable } from "rxjs";
import { AnalyticsController } from "./analytics.controller";

describe("AnalyticsController", () => {
  const analytics = {
    kpiSummary: jest.fn().mockResolvedValue({}),
    engagementTrend: jest.fn().mockResolvedValue([]),
    recipientActivity: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    statusDistribution: jest.fn().mockResolvedValue([]),
    dashboardPerformance: jest.fn().mockResolvedValue({}),
    recentBlasts: jest.fn().mockResolvedValue([]),
  } as any;
  // realtime.stream is consumed as an rxjs Observable; a Subject that never emits is fine.
  const realtime = { stream: new Observable(() => {}) } as any;
  const flags = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
  const c = new AnalyticsController(analytics, realtime, flags);

  beforeEach(() => jest.clearAllMocks());

  it("kpi delegates with tenantId, blastId, channel", () => {
    c.kpi("t1", "b1", "sms");
    expect(analytics.kpiSummary).toHaveBeenCalledWith("t1", "b1", "sms");
  });

  it("trend passes null minutes when range=all", () => {
    c.trend("t1", "b1", "60", "all");
    expect(analytics.engagementTrend).toHaveBeenCalledWith("t1", "b1", null);
  });

  it("trend parses minutes and falls back to 60", () => {
    c.trend("t1", "b1", "30");
    expect(analytics.engagementTrend).toHaveBeenCalledWith("t1", "b1", 30);
    c.trend("t1", "b1", "not-a-number");
    expect(analytics.engagementTrend).toHaveBeenLastCalledWith("t1", "b1", 60);
  });

  it("activity parses limit/offset and delegates with tenantId", () => {
    c.activity("t1", "b1", "10", "5", "email");
    expect(analytics.recipientActivity).toHaveBeenCalledWith("t1", "b1", 10, 5, "email");
  });

  it("statusDistribution delegates with tenantId, blastId, channel", () => {
    c.statusDistribution("t1", "b1", "sms");
    expect(analytics.statusDistribution).toHaveBeenCalledWith("t1", "b1", "sms");
  });

  it("dashboardPerformance delegates with tenantId", () => {
    c.dashboardPerformance("t1", "sms");
    expect(analytics.dashboardPerformance).toHaveBeenCalledWith("t1", "sms");
  });

  it("recent parses limit and delegates with tenantId", () => {
    c.recent("t1", "5", "sms");
    expect(analytics.recentBlasts).toHaveBeenCalledWith("t1", 5, "sms");
  });

  it("stream returns an Observable bound to the request tenant", () => {
    const result = c.stream({ streamTenantId: "t1" } as any);
    expect(result).toBeInstanceOf(Observable);
    // Subscribing exercises the flag-gated switchMap without leaking a live subscription.
    result.subscribe().unsubscribe();
    expect(flags.isEnabled).toHaveBeenCalledWith("FEATURE_REALTIME_ENABLED", { tenantId: null });
  });
});
