import { Body, Controller, Delete, ForbiddenException, Get, Optional, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { Request } from "express";
import { AutodialerService } from "./autodialer.service";
import { DialerDispatchService } from "./dialer-dispatch.service";
import { DialerReportingService } from "./dialer-reporting.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";
import {
  CreateDialerCampaignDto,
  ListDialerAttemptsQueryDto,
  ListDialerCampaignsQueryDto,
  UpdateDialerCampaignDto,
  UpsertQuestionGraphDto,
} from "./dto/autodialer.dto";

// The autodialer is an organiser/owner domain: `manage autodialer.all`
// (organiser/owner) and `read autodialer.all` (member) cover these. The IVR
// webhook surface and the public widget session API are SEPARATE controllers
// with their own (allowlisted) auth posture — nothing here is public.
const READ = { action: "read", resource: "autodialer.campaign" } as const;
const CREATE = { action: "create", resource: "autodialer.campaign" } as const;
const UPDATE = { action: "update", resource: "autodialer.campaign" } as const;
const REMOVE = { action: "delete", resource: "autodialer.campaign" } as const;

/**
 * Routes that live at /autodialer/* – OUTSIDE the campaigns prefix. Express
 * keeps a "../" in a route path literal (it never normalises it), so these
 * cannot be declared on the campaigns controller: they'd register unmatchable
 * paths and 404 – which is exactly what the production cron hit.
 */
@Controller("autodialer")
export class AutodialerOpsController {
  constructor(
    private readonly reporting: DialerReportingService,
    @Optional() private readonly dispatch?: DialerDispatchService,
  ) {}

  /**
   * Platform cron: enqueue a dial tick per due ACTIVE campaign. No decorator –
   * the path is CRON_SECRET-allowlisted in BasicAuthGuard (no `request.user`),
   * and any USER session reaching it must be a super-admin (the
   * CallsController#reconcile pattern). Listed in the guardrail's OPEN_ROUTES.
   */
  @Get("dispatch-due")
  @Post("dispatch-due")
  dispatchDue(@Req() req: Request & { user?: AuthUser }) {
    if (req.user && !req.user.isSuperAdmin) {
      throw new ForbiddenException("Dialler dispatch is operator-only");
    }
    if (!this.dispatch) throw new ForbiddenException("Dial engine not available");
    return this.dispatch.dispatchDue();
  }

  /** Tenant-wide KPIs for the campaign list header. */
  @Get("stats")
  @RequirePermission(READ)
  tenantStats(@TenantId() tenantId: string) {
    return this.reporting.tenantStats(tenantId);
  }
}

@Controller("autodialer/campaigns")
export class AutodialerController {
  constructor(
    private readonly autodialer: AutodialerService,
    private readonly reporting: DialerReportingService,
  ) {}

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query() query: ListDialerCampaignsQueryDto) {
    return this.autodialer.list(tenantId, query);
  }


  @Post()
  @RequirePermission(CREATE)
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateDialerCampaignDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.autodialer.create(tenantId, dto, req.user?.id);
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.get(tenantId, id);
  }

  /** The activation gate as a readable checklist (admin Overview card). */
  @Get(":id/preflight")
  @RequirePermission(READ)
  preflight(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.preflight(tenantId, id);
  }

  @Patch(":id")
  @RequirePermission(UPDATE)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateDialerCampaignDto) {
    return this.autodialer.update(tenantId, id, dto);
  }

  /** Archive rather than destroy — attempts/results are kept for reporting. */
  @Delete(":id")
  @RequirePermission(REMOVE)
  archive(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.archive(tenantId, id);
  }

  @Post(":id/activate")
  @RequirePermission(UPDATE)
  activate(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.activate(tenantId, id);
  }

  @Post(":id/pause")
  @RequirePermission(UPDATE)
  pause(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.pause(tenantId, id);
  }

  @Post(":id/resume")
  @RequirePermission(UPDATE)
  resume(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.resume(tenantId, id);
  }

  @Post(":id/complete")
  @RequirePermission(UPDATE)
  complete(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.autodialer.complete(tenantId, id);
  }

  @Post(":id/clone")
  @RequirePermission(CREATE)
  clone(@TenantId() tenantId: string, @Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.autodialer.clone(tenantId, id, req.user?.id);
  }

  /** Monitor tab: attempt totals, outcome split, connect rate, sessions. */
  @Get(":id/stats")
  @RequirePermission(READ)
  stats(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.reporting.campaignStats(tenantId, id);
  }

  /** Monitor tab: the recent-dials table (paged, newest first). */
  @Get(":id/attempts")
  @RequirePermission(READ)
  attempts(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Query() query: ListDialerAttemptsQueryDto,
  ) {
    return this.reporting.listAttempts(tenantId, id, {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  /** Results tab: survey answer distributions + the transfer ledger. */
  @Get(":id/results")
  @RequirePermission(READ)
  results(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.reporting.results(tenantId, id);
  }

  /** Full-graph put — replaces the campaign's survey questions atomically. */
  @Put(":id/questions")
  @RequirePermission(UPDATE)
  upsertQuestions(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpsertQuestionGraphDto,
  ) {
    return this.autodialer.upsertQuestionGraph(tenantId, id, dto);
  }
}
