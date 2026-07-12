import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { RequirePermission } from "../auth/require-permission.decorator";
import type { AuthUser } from "../auth/auth-user";
import { TelephonyProvisioningService } from "./telephony-provisioning.service";
import {
  ResubmitRunDto,
  StartProvisioningRunDto,
  UploadDocumentDto,
} from "./dto/telephony.dto";

// Provisioning mutations live on system.* — a platform-operator domain the
// tenant-owner `manage telephony.all` wildcard cannot reach (super-admin only).
const PROVISION = { action: "manage", resource: "system.telephony-provisioning" } as const;
// Reads are owner-visible (the tenant-settings timeline); scoped in-controller.
const READ = { action: "read", resource: "telephony.provisioning" } as const;

@Controller("telephony")
export class TelephonyProvisioningController {
  constructor(private readonly provisioning: TelephonyProvisioningService) {}

  /** Non-super-admin readers see only their own tenant's rows. */
  private scopeTenant(req: Request & { user?: AuthUser }, requested?: string): string | undefined {
    const user = req.user;
    if (user?.isSuperAdmin) return requested || undefined;
    const own = user?.tenantId ?? undefined;
    if (requested && own && requested !== own) {
      throw new ForbiddenException("You can only view your own organisation's telephony");
    }
    return own;
  }

  @Post("provisioning-runs")
  @RequirePermission(PROVISION)
  async startRun(@Body() dto: StartProvisioningRunDto, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.startRun({
      tenantId: dto.tenantId,
      campaignId: dto.campaignId ?? null,
      mode: dto.mode,
      byoAccountSid: dto.byoAccountSid,
      byoAuthToken: dto.byoAuthToken,
      friendlyName: dto.friendlyName,
      complianceInput: dto.complianceInput,
      requestedById: req.user?.id ?? null,
    });
  }

  @Post("provisioning-runs/:id/documents")
  @RequirePermission(PROVISION)
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @Param("id") id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    return this.provisioning.addDocument(id, file, dto.type);
  }

  @Post("provisioning-runs/:id/retry")
  @RequirePermission(PROVISION)
  async retry(@Param("id") id: string) {
    return this.provisioning.retry(id);
  }

  @Post("provisioning-runs/:id/resubmit")
  @RequirePermission(PROVISION)
  async resubmit(@Param("id") id: string, @Body() dto: ResubmitRunDto) {
    return this.provisioning.resubmit(id, dto.complianceInput);
  }

  @Get("provisioning-runs")
  @RequirePermission(READ)
  async listRuns(@Query("tenantId") tenantId: string | undefined, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.listRuns(this.scopeTenant(req, tenantId));
  }

  @Get("provisioning-runs/:id")
  @RequirePermission(READ)
  async getRun(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const run = await this.provisioning.getRunWithTimeline(id);
    const user = req.user;
    if (!user?.isSuperAdmin && user?.tenantId && run.tenantId !== user.tenantId) {
      throw new ForbiddenException("You can only view your own organisation's telephony");
    }
    return run;
  }

  @Get("numbers")
  @RequirePermission(READ)
  async listNumbers(@Query("tenantId") tenantId: string | undefined, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.listNumbers(this.scopeTenant(req, tenantId));
  }

  @Post("numbers/:id/release")
  @RequirePermission(PROVISION)
  async releaseNumber(@Param("id") id: string) {
    return this.provisioning.releaseNumber(id);
  }

  /**
   * Cron fallback for bundle approvals. Two legitimate callers: the scheduler
   * (CRON_SECRET bearer — BasicAuthGuard allowlists the path and attaches no
   * user) and a super-admin poking it manually. A @RequirePermission decorator
   * would break the cron path (AbilityGuard denies user-less requests when a
   * permission is required), so the session gate lives here: any session-authed
   * caller must be super-admin.
   */
  // GET for the Vercel cron (crons issue GET), POST for a manual operator trigger —
  // same dual-decorator pattern the blasts/audiences/journeys crons use.
  @Get("provisioning/poll")
  @Post("provisioning/poll")
  async poll(@Req() req: Request & { user?: AuthUser }) {
    if (req.user && !req.user.isSuperAdmin) {
      throw new ForbiddenException("Provisioning poll is operator-only");
    }
    return this.provisioning.pollSubmittedBundles();
  }
}
