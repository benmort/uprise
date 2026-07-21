import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AppUserRole, type EmailProvisioningRequestStatus } from "@uprise/db";
import { RequirePermission } from "../auth/require-permission.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth-user";
import { EmailProvisioningService } from "./email-provisioning.service";
import {
  DeclineEmailSetupRequestDto,
  RequestEmailSetupDto,
  StartEmailProvisioningRunDto,
} from "./dto/email-provisioning.dto";

// NOTE: deliberately NOT under @Controller("email") — email.controller.ts has a
// GET ":id" catch-all that would swallow these routes.
//
// Provisioning mutations live on system.* — a platform-operator domain the
// tenant-owner `manage email.all` wildcard cannot reach (super-admin only).
const PROVISION = { action: "manage", resource: "system.email-provisioning" } as const;
// Reads are owner-visible (the tenant-settings timeline); scoped in-controller.
const READ = { action: "read", resource: "email.provisioning" } as const;
// Setup REQUESTS are the one owner-reachable write: an ask, not provisioning. Organisers
// also hold `manage email.all`, so the stacked @Roles(OWNER) (org-profile credential
// pattern) is what actually narrows these to owners.
const REQUEST = { action: "manage", resource: "email.identity" } as const;

@Controller("email-provisioning")
export class EmailProvisioningController {
  constructor(private readonly provisioning: EmailProvisioningService) {}

  /** Non-super-admin readers see only their own tenant's rows. */
  private scopeTenant(req: Request & { user?: AuthUser }, requested?: string): string | undefined {
    const user = req.user;
    if (user?.isSuperAdmin) return requested || undefined;
    const own = user?.tenantId ?? undefined;
    if (requested && own && requested !== own) {
      throw new ForbiddenException("You can only view your own organisation's email identities");
    }
    return own;
  }

  @Post("runs")
  @RequirePermission(PROVISION)
  async startRun(@Body() dto: StartEmailProvisioningRunDto, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.startRun({
      tenantId: dto.tenantId,
      campaignId: dto.campaignId ?? null,
      mode: dto.mode,
      kind: dto.kind,
      slug: dto.slug,
      domain: dto.domain,
      fromLocalPart: dto.fromLocalPart,
      fromName: dto.fromName,
      purpose: dto.purpose,
      byoApiKey: dto.byoApiKey,
      requestedById: req.user?.id ?? null,
      requestId: dto.requestId,
    });
  }

  // ── Setup requests: the owner ask → operator queue ─────────────────────────

  /** Owner asks for email setup; always their own tenant. Plan-gated in the service. */
  @Post("requests")
  @RequirePermission(REQUEST)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  async createRequest(@Body() dto: RequestEmailSetupDto, @Req() req: Request & { user?: AuthUser }) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("No active workspace");
    return this.provisioning.createSetupRequest({
      tenantId,
      requestedById: req.user?.id ?? null,
      kind: dto.kind,
      domain: dto.domain ?? null,
      notes: dto.notes ?? null,
    });
  }

  /** Operator queue (all tenants, filterable) or a tenant's own requests. */
  @Get("requests")
  @RequirePermission(READ)
  async listRequests(
    @Req() req: Request & { user?: AuthUser },
    @Query("status") status?: EmailProvisioningRequestStatus,
    @Query("tenantId") tenantId?: string,
  ) {
    return this.provisioning.listSetupRequests({
      tenantId: this.scopeTenant(req, tenantId),
      status,
    });
  }

  /** Owner withdraws their own OPEN request. */
  @Post("requests/:id/withdraw")
  @RequirePermission(REQUEST)
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.OWNER)
  async withdrawRequest(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("No active workspace");
    return this.provisioning.withdrawSetupRequest(id, tenantId);
  }

  /** Operator declines an OPEN request. */
  @Post("requests/:id/decline")
  @RequirePermission(PROVISION)
  async declineRequest(
    @Param("id") id: string,
    @Body() dto: DeclineEmailSetupRequestDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.provisioning.declineSetupRequest(id, req.user?.id ?? null, dto.reason);
  }

  @Post("runs/:id/retry")
  @RequirePermission(PROVISION)
  async retry(@Param("id") id: string) {
    return this.provisioning.retry(id);
  }

  @Post("runs/:id/validate")
  @RequirePermission(PROVISION)
  async validateNow(@Param("id") id: string) {
    return this.provisioning.validateNow(id);
  }

  @Post("identities/:id/revoke")
  @RequirePermission(PROVISION)
  async revoke(@Param("id") id: string) {
    return this.provisioning.revokeIdentity(id);
  }

  @Get("runs")
  @RequirePermission(READ)
  async listRuns(@Query("tenantId") tenantId: string | undefined, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.listRuns(this.scopeTenant(req, tenantId));
  }

  @Get("runs/:id")
  @RequirePermission(READ)
  async getRun(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const run = await this.provisioning.getRunWithTimeline(id);
    const user = req.user;
    if (!user?.isSuperAdmin && user?.tenantId && run.tenantId !== user.tenantId) {
      throw new ForbiddenException("You can only view your own organisation's email identities");
    }
    return run;
  }

  @Get("identities")
  @RequirePermission(READ)
  async listIdentities(@Query("tenantId") tenantId: string | undefined, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.listIdentities(this.scopeTenant(req, tenantId));
  }

  /**
   * Cron fallback for DNS validation. Two legitimate callers: the scheduler
   * (CRON_SECRET bearer — BasicAuthGuard allowlists the path and attaches no
   * user) and a super-admin poking it manually. A @RequirePermission decorator
   * would break the cron path (AbilityGuard denies user-less requests when a
   * permission is required), so the session gate lives here.
   */
  // GET for the Vercel cron (crons issue GET), POST for a manual operator trigger —
  // same dual-decorator pattern the blasts/audiences/journeys crons use.
  @Get("poll")
  @Post("poll")
  async poll(@Req() req: Request & { user?: AuthUser }) {
    if (req.user && !req.user.isSuperAdmin) {
      throw new ForbiddenException("Email provisioning poll is operator-only");
    }
    return this.provisioning.pollPendingValidations();
  }
}
