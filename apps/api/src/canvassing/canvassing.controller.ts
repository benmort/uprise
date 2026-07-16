import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { AppUserRole, WalkListItemListType } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TurfEstimateService } from "./turf-estimate.service";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";
import { CanvassingService } from "./canvassing.service";
import {
  AssignTurfDto,
  ClaimAreaDto,
  ClaimDrawDto,
  ClaimTurfDto,
  CreateVolunteerDto,
  CreateDoorContactDto,
  CreateShiftDto,
  CreateTurfDto,
  CreateTurfFromAreasDto,
  CreateTurfFromDivisionDto,
  CreateTurfFromSourcesDto,
  CreateWalkListDto,
  LoadUniverseDto,
  ReassignTurfDto,
  RebuildWalkListsDto,
  RecordDoorKnockDto,
  ReleaseTurfDto,
  ResolveQaFlagDto,
  UpdateVolunteerDto,
  UpdateShiftDto,
  UpdateTurfDto,
  UpdateWalkListDto,
} from "./dto/canvassing.dto";

// Field/volunteer routes gate on the canvasser CASL perms volunteers already hold
// (read canvass.turf, manage canvass.doorknock). The per-campaign business rules
// (openJoinEnabled, own-turf) stay enforced in the service.
const CANVASS_READ = { action: "read", resource: "canvass.turf" } as const;
const DOORKNOCK = { action: "manage", resource: "canvass.doorknock" } as const;

@Controller("canvass")
@UseGuards(RolesGuard)
export class CanvassingController {
  constructor(
    private readonly canvassing: CanvassingService,
    private readonly estimates: TurfEstimateService,
  ) {}

  // Organiser
  @Get("turfs")
  @Roles(AppUserRole.ORGANISER)
  async listTurfs(@TenantId() tenantId: string, @Query("campaignId") campaignId?: string) {
    return this.canvassing.listTurfs(tenantId, campaignId);
  }

  /**
   * The cached doors-per-hour estimate for one turf. Null when it has never been priced.
   * `source` is "directions" (Mapbox walked the real footpaths) or "crowflies" (straight
   * lines, which always flatter the turf) — the client must say which.
   */
  @Get("turfs/:id/estimate")
  @Roles(AppUserRole.ORGANISER)
  async getTurfEstimate(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.estimates.get(tenantId, id);
  }

  /**
   * Price a turf now. A turf too large to order inside a request is handed to the
   * `turf-estimate` worker instead, and the response says so (`queued: true`).
   */
  @Post("turfs/:id/estimate")
  @Roles(AppUserRole.ORGANISER)
  async refreshTurfEstimate(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.estimates.requestRefresh(tenantId, id);
  }

  @Get("volunteers")
  @Roles(AppUserRole.ORGANISER)
  async listVolunteers(@TenantId() tenantId: string) {
    return this.canvassing.listVolunteers(tenantId);
  }

  @Post("volunteers")
  @Roles(AppUserRole.ORGANISER)
  async createVolunteer(@Body() dto: CreateVolunteerDto, @TenantId() tenantId: string) {
    return this.canvassing.createVolunteer(tenantId, {
      ...dto,
      role: dto.role as AppUserRole | undefined,
    });
  }

  @Patch("volunteers/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateVolunteer(@Param("id") id: string, @Body() dto: UpdateVolunteerDto, @TenantId() tenantId: string) {
    return this.canvassing.updateVolunteer(tenantId, id, {
      ...dto,
      role: dto.role as AppUserRole | undefined,
    });
  }

  @Get("turfs/:turfId/contacts")
  @Roles(AppUserRole.ORGANISER)
  async listTurfContacts(@Param("turfId") turfId: string, @TenantId() tenantId: string) {
    return this.canvassing.listTurfContacts(tenantId, turfId);
  }

  @Get("turfs/:turfId/route")
  @Roles(AppUserRole.ORGANISER)
  async turfRoute(@Param("turfId") turfId: string, @TenantId() tenantId: string) {
    return this.canvassing.turfRoute(tenantId, turfId);
  }

  // Field volunteers' own walk route — ordered from their GPS (?lat=&lng=), with real Mapbox
  // walking legs + geometry. Gated on the canvasser read perm; own-turf enforced in the service.
  @Get("turfs/:turfId/walk-route")
  @RequirePermission(CANVASS_READ)
  async walkRoute(
    @Param("turfId") turfId: string,
    @TenantId() tenantId: string,
    @Query("volunteerId") volunteerId: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
  ) {
    const latN = Number(lat);
    const lngN = Number(lng);
    const origin =
      lat != null && lng != null && Number.isFinite(latN) && Number.isFinite(lngN)
        ? { lat: latN, lng: lngN }
        : undefined;
    return this.canvassing.walkRouteForVolunteer(tenantId, turfId, volunteerId, origin);
  }

  @Post("turfs")
  @Roles(AppUserRole.ORGANISER)
  async createTurf(@Body() dto: CreateTurfDto, @TenantId() tenantId: string) {
    return this.canvassing.createTurf(tenantId, dto);
  }

  @Patch("turfs/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateTurf(@Param("id") id: string, @Body() dto: UpdateTurfDto, @TenantId() tenantId: string) {
    return this.canvassing.updateTurf(tenantId, id, dto);
  }

  @Delete("turfs/:id")
  @Roles(AppUserRole.ORGANISER)
  async deleteTurf(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.deleteTurf(tenantId, id);
  }

  @Post("turfs/:id/unassign")
  @Roles(AppUserRole.ORGANISER)
  async unassignTurf(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.unassignTurf(tenantId, id);
  }

  @Post("turfs/:id/reassign")
  @Roles(AppUserRole.ORGANISER)
  async reassignTurf(@Param("id") id: string, @Body() dto: ReassignTurfDto, @TenantId() tenantId: string) {
    return this.canvassing.reassignTurf(tenantId, id, dto.volunteerId);
  }

  @Post("turfs/from-division")
  @Roles(AppUserRole.ORGANISER)
  async createTurfFromDivision(@Body() dto: CreateTurfFromDivisionDto, @TenantId() tenantId: string) {
    return this.canvassing.createTurfFromDivision(tenantId, dto);
  }

  @Post("turfs/from-areas")
  @Roles(AppUserRole.ORGANISER)
  async createTurfFromAreas(@Body() dto: CreateTurfFromAreasDto, @TenantId() tenantId: string) {
    return this.canvassing.createTurfFromAreas(tenantId, dto);
  }

  @Post("turfs/from-sources")
  @Roles(AppUserRole.ORGANISER)
  async createTurfFromSources(@Body() dto: CreateTurfFromSourcesDto, @TenantId() tenantId: string) {
    return this.canvassing.createTurfFromSources(tenantId, dto);
  }

  @Post("turfs/:id/rebucket")
  @Roles(AppUserRole.ORGANISER)
  async rebucketTurf(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.rebucketTurf(tenantId, id);
  }

  @Post("turfs/:id/load-universe")
  @Roles(AppUserRole.ORGANISER)
  async loadUniverse(@Param("id") id: string, @Body() dto: LoadUniverseDto, @TenantId() tenantId: string) {
    return this.canvassing.loadUniverseIntoTurf(tenantId, id, dto);
  }

  @Post("turfs/:id/rebuild-walk-list")
  @Roles(AppUserRole.ORGANISER)
  async rebuildTurfWalkList(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.rebuildTurfWalkList(tenantId, id);
  }

  @Post("walk-lists/rebuild")
  @Roles(AppUserRole.ORGANISER)
  async rebuildWalkLists(@Body() dto: RebuildWalkListsDto, @TenantId() tenantId: string) {
    return this.canvassing.rebuildWalkLists(tenantId, dto.turfIds);
  }

  @Get("walk-lists")
  @Roles(AppUserRole.ORGANISER)
  async listWalkLists(@TenantId() tenantId: string, @Query("turfId") turfId?: string) {
    return this.canvassing.listWalkLists(tenantId, turfId);
  }

  @Post("walk-lists")
  @Roles(AppUserRole.ORGANISER)
  async createWalkList(@Body() dto: CreateWalkListDto, @TenantId() tenantId: string) {
    return this.canvassing.createWalkList(tenantId, {
      ...dto,
      listType: dto.listType as WalkListItemListType | undefined,
    });
  }

  @Patch("walk-lists/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateWalkList(@Param("id") id: string, @Body() dto: UpdateWalkListDto, @TenantId() tenantId: string) {
    return this.canvassing.updateWalkList(tenantId, id, {
      ...dto,
      listType: dto.listType as WalkListItemListType | undefined,
    });
  }

  @Delete("walk-lists/:id")
  @Roles(AppUserRole.ORGANISER)
  async deleteWalkList(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.deleteWalkList(tenantId, id);
  }

  @Post("turfs/assign")
  @Roles(AppUserRole.ORGANISER)
  async assignTurf(@Body() dto: AssignTurfDto, @TenantId() tenantId: string) {
    return this.canvassing.assignTurf(
      tenantId,
      dto.turfId,
      dto.volunteerId,
      dto.lockedUntil ? new Date(dto.lockedUntil) : undefined,
    );
  }

  // ── Turf requests + campaign roster (organiser) ──────────────
  @Get("campaigns/:campaignId/turf-requests")
  @Roles(AppUserRole.ORGANISER)
  async turfRequests(@Param("campaignId") campaignId: string, @TenantId() tenantId: string) {
    return this.canvassing.listTurfRequests(tenantId, campaignId);
  }

  @Post("turf-requests/:assignmentId/approve")
  @Roles(AppUserRole.ORGANISER)
  async approveTurfRequest(@Param("assignmentId") assignmentId: string, @TenantId() tenantId: string) {
    return this.canvassing.approveTurfRequest(tenantId, assignmentId);
  }

  @Post("turf-requests/:assignmentId/deny")
  @Roles(AppUserRole.ORGANISER)
  async denyTurfRequest(@Param("assignmentId") assignmentId: string, @TenantId() tenantId: string) {
    return this.canvassing.denyTurfRequest(tenantId, assignmentId);
  }

  @Get("campaigns/:campaignId/volunteer-roster")
  @Roles(AppUserRole.ORGANISER)
  async volunteerRoster(@Param("campaignId") campaignId: string, @TenantId() tenantId: string) {
    return this.canvassing.getVolunteerRoster(tenantId, campaignId);
  }

  @Get("campaigns/:campaignId/volunteers/:volunteerId/contacts")
  @Roles(AppUserRole.ORGANISER)
  async volunteerContacts(
    @Param("campaignId") campaignId: string,
    @Param("volunteerId") volunteerId: string,
    @TenantId() tenantId: string,
  ) {
    return this.canvassing.listVolunteerContacts(tenantId, campaignId, volunteerId);
  }

  // Volunteer
  @Get("assignments")
  @RequirePermission(CANVASS_READ)
  async assignments(@Query("volunteerId") volunteerId: string, @TenantId() tenantId: string) {
    return this.canvassing.listAssignments(tenantId, volunteerId);
  }

  @Get("volunteer-metrics")
  @RequirePermission(CANVASS_READ)
  async volunteerMetrics(@Query("volunteerId") volunteerId: string, @TenantId() tenantId: string) {
    return this.canvassing.getVolunteerMetrics(tenantId, volunteerId);
  }

  @Get("recommended-turf")
  @RequirePermission(CANVASS_READ)
  async recommendedTurf(@Query("volunteerId") volunteerId: string, @TenantId() tenantId: string) {
    return this.canvassing.recommendedTurf(tenantId, volunteerId);
  }

  @Post("turfs/:id/release")
  @RequirePermission(CANVASS_READ)
  async releaseTurf(@Param("id") id: string, @Body() dto: ReleaseTurfDto, @TenantId() tenantId: string) {
    return this.canvassing.releaseTurf(tenantId, id, dto.volunteerId);
  }

  @Post("door-knocks")
  @RequirePermission(DOORKNOCK)
  async recordDoorKnock(@Body() dto: RecordDoorKnockDto, @TenantId() tenantId: string) {
    return this.canvassing.recordDoorKnock(tenantId, dto);
  }

  @Post("door-contacts")
  @RequirePermission(DOORKNOCK)
  async createDoorContact(@Body() dto: CreateDoorContactDto, @TenantId() tenantId: string) {
    return this.canvassing.createDoorContact(tenantId, dto);
  }

  @Post("door-photos")
  @RequirePermission(DOORKNOCK)
  @UseInterceptors(FileInterceptor("file"))
  async uploadDoorPhoto(@UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    return this.canvassing.uploadDoorPhoto(file);
  }

  // ── Volunteer self-serve turf (gated per-campaign; volunteer id from the session) ──
  @Get("campaigns/:campaignId/self-serve/available")
  @RequirePermission(CANVASS_READ)
  async selfServeAvailable(@Param("campaignId") campaignId: string, @TenantId() tenantId: string) {
    return this.canvassing.selfServeAvailable(tenantId, campaignId);
  }

  @Post("campaigns/:campaignId/self-serve/claim-area")
  @RequirePermission(CANVASS_READ)
  async selfServeClaimArea(
    @Param("campaignId") campaignId: string,
    @Body() dto: ClaimAreaDto,
    @Req() req: Request & { user?: AuthUser },
    @TenantId() tenantId: string,
  ) {
    return this.canvassing.claimAreaSelfServe(tenantId, campaignId, this.requireUserId(req), dto.areas);
  }

  @Post("campaigns/:campaignId/self-serve/claim-draw")
  @RequirePermission(CANVASS_READ)
  async selfServeClaimDraw(
    @Param("campaignId") campaignId: string,
    @Body() dto: ClaimDrawDto,
    @Req() req: Request & { user?: AuthUser },
    @TenantId() tenantId: string,
  ) {
    return this.canvassing.claimDrawSelfServe(tenantId, campaignId, this.requireUserId(req), dto.polygon);
  }

  @Post("campaigns/:campaignId/self-serve/claim-turf")
  @RequirePermission(CANVASS_READ)
  async selfServeClaimTurf(
    @Param("campaignId") campaignId: string,
    @Body() dto: ClaimTurfDto,
    @Req() req: Request & { user?: AuthUser },
    @TenantId() tenantId: string,
  ) {
    return this.canvassing.claimExistingTurfSelfServe(tenantId, campaignId, this.requireUserId(req), dto.turfId);
  }

  private requireUserId(req: { user?: AuthUser }): string {
    const id = req.user?.id;
    if (!id) throw new UnauthorizedException("Sign in to claim turf");
    return id;
  }

  // ── Shifts (organiser) ───────────────────────────────────────
  @Get("shifts")
  @Roles(AppUserRole.ORGANISER)
  async listShifts(@TenantId() tenantId: string, @Query("campaignId") campaignId?: string) {
    return this.canvassing.listShifts(tenantId, campaignId);
  }

  @Post("shifts")
  @Roles(AppUserRole.ORGANISER)
  async createShift(@Body() dto: CreateShiftDto, @TenantId() tenantId: string) {
    return this.canvassing.createShift(tenantId, dto);
  }

  @Patch("shifts/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateShift(@Param("id") id: string, @Body() dto: UpdateShiftDto, @TenantId() tenantId: string) {
    return this.canvassing.updateShift(tenantId, id, dto);
  }

  @Delete("shifts/:id")
  @Roles(AppUserRole.ORGANISER)
  async deleteShift(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.deleteShift(tenantId, id);
  }

  // ── QA review (organiser) ────────────────────────────────────
  // Tenant-wide aggregate (the "All campaigns" QA view). Declared before the `:id` variant.
  @Get("campaigns/qa")
  @Roles(AppUserRole.ORGANISER)
  async qaReviewAll(@TenantId() tenantId: string) {
    return this.canvassing.qaReview(tenantId);
  }

  @Get("campaigns/:id/qa")
  @Roles(AppUserRole.ORGANISER)
  async qaReview(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.canvassing.qaReview(tenantId, id);
  }

  @Post("campaigns/:id/qa/resolve")
  @Roles(AppUserRole.ORGANISER)
  async resolveQaFlag(
    @Param("id") id: string,
    @Body() dto: ResolveQaFlagDto,
    @Req() req: Request & { user?: AuthUser },
    @TenantId() tenantId: string,
  ) {
    return this.canvassing.setQaFlagResolution(tenantId, id, { ...dto, resolvedById: req.user?.id });
  }
}
