import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { InsightsService } from "./insights.service";
import { ResolveThresholdDto } from "./dto/insights.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

/**
 * Insights / Polling read + targeting API. Every route is permission-gated
 * (insights.poll) and tenant-scoped; visibility (tenant-owned + shared) is
 * enforced in the service.
 */
const READ = { action: "read", resource: "insights.poll" } as const;

@Controller("insights")
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get("polls")
  @RequirePermission(READ)
  listPolls(@TenantId() tenantId: string) {
    return this.insights.listPolls(tenantId);
  }

  @Get("region")
  @RequirePermission(READ)
  region(@Query("geoKind") geoKind: string, @Query("geoCode") geoCode: string, @TenantId() tenantId: string) {
    return this.insights.getRegionPolling(tenantId, geoKind, geoCode);
  }

  @Get("polls/:id")
  @RequirePermission(READ)
  getPoll(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.insights.getPoll(tenantId, id);
  }

  @Get("polls/:id/questions/:code")
  @RequirePermission(READ)
  getQuestion(@Param("id") id: string, @Param("code") code: string, @TenantId() tenantId: string) {
    return this.insights.getPollQuestion(tenantId, id, code);
  }

  @Get("polls/:id/questions/:code/choropleth")
  @RequirePermission(READ)
  choropleth(
    @Param("id") id: string,
    @Param("code") code: string,
    @Query("response") response: string,
    @TenantId() tenantId: string,
  ) {
    return this.insights.getChoropleth(tenantId, id, code, response);
  }

  @Post("resolve-threshold")
  @RequirePermission(READ)
  resolveThreshold(@Body() dto: ResolveThresholdDto, @TenantId() tenantId: string) {
    return this.insights.resolvePollThresholdToGeoCodes(tenantId, dto);
  }
}
