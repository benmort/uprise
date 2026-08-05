import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
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
  AdoptNumberDto,
  ConnectByoAccountDto,
  ResubmitRunDto,
  SetNumberNicknameDto,
  StartProvisioningRunDto,
  UploadDocumentDto,
} from "./dto/telephony.dto";

// Provisioning mutations live on system.* — a platform-operator domain the
// tenant-owner `manage telephony.all` wildcard cannot reach (super-admin only).
// Platform-operator gate (super-admin `manage all`) — release keeps this.
const PROVISION = { action: "manage", resource: "system.telephony-provisioning" } as const;
// Tenant self-serve provisioning: owners hold this via the `telephony.all` wildcard.
// Every mutation under it is tenant-scoped in-controller (never a cross-tenant id).
const PROVISION_TENANT = { action: "manage", resource: "telephony.provisioning" } as const;
// Reads are owner-visible (the tenant-settings timeline); scoped in-controller.
const READ = { action: "read", resource: "telephony.provisioning" } as const;
// Renaming a number is owner-reachable via the `manage telephony.all` wildcard.
const MANAGE_NUMBER = { action: "manage", resource: "telephony.number" } as const;

@Controller("telephony")
export class TelephonyProvisioningController {
  constructor(private readonly provisioning: TelephonyProvisioningService) {}

  /** A run-scoped mutation must target the caller's own tenant (super-admin exempt). */
  private async assertRunInScope(runId: string, req: Request & { user?: AuthUser }): Promise<void> {
    const user = req.user;
    if (user?.isSuperAdmin) return;
    const run = await this.provisioning.getRunWithTimeline(runId);
    if (!user?.tenantId || run.tenantId !== user.tenantId) {
      throw new ForbiddenException("You can only manage your own organisation's telephony");
    }
  }

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
  @RequirePermission(PROVISION_TENANT)
  async startRun(@Body() dto: StartProvisioningRunDto, @Req() req: Request & { user?: AuthUser }) {
    const tenantId = this.scopeTenant(req, dto.tenantId) ?? dto.tenantId;
    if (!tenantId) throw new ForbiddenException("No tenant in scope for this provisioning run");
    return this.provisioning.startRun({
      tenantId,
      campaignId: dto.campaignId ?? null,
      mode: dto.mode,
      byoAccountSid: dto.byoAccountSid,
      byoAuthToken: dto.byoAuthToken,
      // An already-approved bundle/address and the account's region – the service validates
      // and rejects them for non-BYO runs; the controller only carries them.
      byoBundleSid: dto.byoBundleSid,
      byoAddressSid: dto.byoAddressSid,
      byoRegion: dto.byoRegion,
      byoEdge: dto.byoEdge,
      friendlyName: dto.friendlyName,
      numberType: dto.numberType,
      chainComplementary: dto.chainComplementary,
      complianceInput: dto.complianceInput,
      requestedById: req.user?.id ?? null,
    });
  }

  @Post("provisioning-runs/:id/documents")
  @RequirePermission(PROVISION_TENANT)
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @Param("id") id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    await this.assertRunInScope(id, req);
    return this.provisioning.addDocument(id, file, dto.type);
  }

  @Post("provisioning-runs/:id/retry")
  @RequirePermission(PROVISION_TENANT)
  async retry(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    await this.assertRunInScope(id, req);
    return this.provisioning.retry(id);
  }

  @Post("provisioning-runs/:id/resubmit")
  @RequirePermission(PROVISION_TENANT)
  async resubmit(@Param("id") id: string, @Body() dto: ResubmitRunDto, @Req() req: Request & { user?: AuthUser }) {
    await this.assertRunInScope(id, req);
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

  /**
   * Org-KYC → compliance-form prefill for the tenant self-serve dialog: legal
   * name/ABN from OrgCredential, the primary contact, and the first address.
   * Missing pieces come back empty — the form stays editable either way.
   */
  @Get("compliance-prefill")
  @RequirePermission(READ)
  async compliancePrefill(@Req() req: Request & { user?: AuthUser }) {
    const tenantId = this.scopeTenant(req);
    if (!tenantId) throw new ForbiddenException("No tenant in scope");
    return this.provisioning.compliancePrefill(tenantId);
  }

  /**
   * The tenant an account-scoped call is bound to. Super-admin ⇒ undefined (the service then
   * takes the account's own tenant). Anyone else MUST have a tenant: `scopeTenant` returns
   * undefined for a tenant-less session, and undefined reads downstream as "unscoped", which
   * would let such a session reach any tenant's account.
   */
  private accountScope(req: Request & { user?: AuthUser }): string | undefined {
    const user = req.user;
    if (user?.isSuperAdmin) return undefined;
    const own = user?.tenantId ?? undefined;
    if (!own) throw new ForbiddenException("No tenant in scope for this telephony account");
    return own;
  }

  /**
   * Numbers the tenant's own Twilio account ALREADY owns, and whether uprise can adopt each.
   * Read-only – it changes nothing at Twilio, and exists so an operator can see the
   * candidates (and any configuration already on them) before choosing.
   */
  @Get("accounts/:id/adoptable-numbers")
  @RequirePermission(READ)
  async listAdoptableNumbers(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.provisioning.listAdoptableNumbers(id, this.accountScope(req));
  }

  /**
   * Connect a tenant's own Twilio account. Separate from startRun because connecting is not
   * provisioning: there is nothing to buy and nothing to review, and requiring a purchase run
   * just to obtain an accountId is what made adoption unreachable for the organisations it was
   * built for.
   */
  @Post("accounts/connect")
  @RequirePermission(PROVISION_TENANT)
  async connectByoAccount(
    @Body() dto: ConnectByoAccountDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const scope = this.accountScope(req);
    const tenantId = scope ?? req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException("A tenant is required to connect a telephony account");
    }
    return this.provisioning.connectByoAccount({
      tenantId,
      accountSid: dto.accountSid,
      authToken: dto.authToken,
      region: dto.region,
      edge: dto.edge,
      friendlyName: dto.friendlyName,
      scopeTenantId: scope,
    });
  }

  /** Register an already-owned number against the tenant. No purchase, no bundle, no run. */
  @Post("accounts/:id/adopt-number")
  @RequirePermission(PROVISION_TENANT)
  async adoptNumber(
    @Param("id") id: string,
    @Body() dto: AdoptNumberDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.provisioning.adoptNumber({
      accountId: id,
      phoneNumberSid: dto.phoneNumberSid,
      nickname: dto.nickname,
      claimSmsHook: dto.claimSmsHook,
      claimVoiceHook: dto.claimVoiceHook,
      scopeTenantId: this.accountScope(req),
    });
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

  // Renaming is tenant-owner metadata (not a platform-operator action), so it uses
  // the owner-reachable `manage telephony.number` gate, scoped in-controller.
  @Patch("numbers/:id")
  @RequirePermission(MANAGE_NUMBER)
  async setNickname(
    @Param("id") id: string,
    @Body() dto: SetNumberNicknameDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.provisioning.setNickname(id, dto.nickname, this.scopeTenant(req), dto.purpose);
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

  /**
   * Re-sync the private telephony pool from PRIVATE_TELEPHONY_*, in-process.
   *
   * It exists as an endpoint rather than only as the CLI script because the sync ENCRYPTS an
   * auth token and writes an inbound webhook URL, and both are environment-derived: run from
   * a developer's machine against the production database, a mismatched
   * INTEGRATION_CREDENTIAL_SECRET stores a token production cannot decrypt, and a local
   * API_BASE_URL points live numbers' inbound hooks at a dev tunnel. Running it inside the
   * deployment makes both correct by construction.
   *
   * Same auth shape as the poll above: CRON_SECRET bearer (no user attached, so no
   * @RequirePermission — AbilityGuard would deny it), or a super-admin session. Idempotent,
   * so re-running after the organisation buys another number picks up just the new one.
   */
  @Get("accounts/sync-private-pool")
  @Post("accounts/sync-private-pool")
  async syncPrivatePool(@Req() req: Request & { user?: AuthUser }) {
    if (req.user && !req.user.isSuperAdmin) {
      throw new ForbiddenException("Private pool sync is operator-only");
    }
    return this.provisioning.syncPrivatePool();
  }
}
