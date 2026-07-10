import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { InsightsService } from "./insights.service";
import { ResolveThresholdDto, SetPollPublicDto } from "./dto/insights.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";

/**
 * Insights / Polling read + targeting API. Every route is permission-gated
 * (insights.poll) and tenant-scoped; visibility (tenant-owned + shared) is
 * enforced in the service.
 */
const READ = { action: "read", resource: "insights.poll" } as const;
// Making a poll public is a `manage` action: owner + organiser hold `manage insights.all`,
// and super-admins bypass CASL. Members/volunteers (read only) are blocked at the guard.
const MANAGE = { action: "manage", resource: "insights.poll" } as const;

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

  /** Make a poll public (every tenant can read it) or private again. Owner/organiser of the
   *  poll's tenant, or a super-admin. @TenantId() also asserts an active tenant is selected. */
  @Patch("polls/:id/public")
  @RequirePermission(MANAGE)
  setPublic(
    @Param("id") id: string,
    @Body() dto: SetPollPublicDto,
    @TenantId() _tenantId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.insights.setPollPublic(req.user as AuthUser, id, dto.public);
  }
}
