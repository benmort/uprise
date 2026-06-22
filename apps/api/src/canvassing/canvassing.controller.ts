import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { AppUserRole, WalkListItemListType } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CanvassingService } from "./canvassing.service";
import {
  AssignTurfDto,
  CreateCanvasserDto,
  CreateDoorContactDto,
  CreateShiftDto,
  CreateTurfDto,
  CreateTurfFromAreasDto,
  CreateTurfFromDivisionDto,
  CreateWalkListDto,
  LoadUniverseDto,
  RecordDoorKnockDto,
  ReleaseTurfDto,
  UpdateCanvasserDto,
  UpdateShiftDto,
  UpdateTurfDto,
  UpdateWalkListDto,
} from "./dto/canvassing.dto";

@Controller("canvass")
@UseGuards(RolesGuard)
export class CanvassingController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly canvassing: CanvassingService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  // Organiser
  @Get("turfs")
  @Roles(AppUserRole.ORGANISER)
  async listTurfs(@Query("campaignId") campaignId?: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.listTurfs(org.id, campaignId);
  }

  @Get("canvassers")
  @Roles(AppUserRole.ORGANISER)
  async listCanvassers() {
    const org = await this.ensureOrganization();
    return this.canvassing.listCanvassers(org.id);
  }

  @Post("canvassers")
  @Roles(AppUserRole.ORGANISER)
  async createCanvasser(@Body() dto: CreateCanvasserDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createCanvasser(org.id, {
      ...dto,
      role: dto.role as AppUserRole | undefined,
    });
  }

  @Patch("canvassers/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateCanvasser(@Param("id") id: string, @Body() dto: UpdateCanvasserDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.updateCanvasser(org.id, id, {
      ...dto,
      role: dto.role as AppUserRole | undefined,
    });
  }

  @Get("turfs/:turfId/contacts")
  @Roles(AppUserRole.ORGANISER)
  async listTurfContacts(@Param("turfId") turfId: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.listTurfContacts(org.id, turfId);
  }

  @Post("turfs")
  @Roles(AppUserRole.ORGANISER)
  async createTurf(@Body() dto: CreateTurfDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createTurf(org.id, dto);
  }

  @Patch("turfs/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateTurf(@Param("id") id: string, @Body() dto: UpdateTurfDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.updateTurf(org.id, id, dto);
  }

  @Post("turfs/from-division")
  @Roles(AppUserRole.ORGANISER)
  async createTurfFromDivision(@Body() dto: CreateTurfFromDivisionDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createTurfFromDivision(org.id, dto);
  }

  @Post("turfs/from-areas")
  @Roles(AppUserRole.ORGANISER)
  async createTurfFromAreas(@Body() dto: CreateTurfFromAreasDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createTurfFromAreas(org.id, dto);
  }

  @Post("turfs/:id/rebucket")
  @Roles(AppUserRole.ORGANISER)
  async rebucketTurf(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.rebucketTurf(org.id, id);
  }

  @Post("turfs/:id/load-universe")
  @Roles(AppUserRole.ORGANISER)
  async loadUniverse(@Param("id") id: string, @Body() dto: LoadUniverseDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.loadUniverseIntoTurf(org.id, id, dto);
  }

  @Get("walk-lists")
  @Roles(AppUserRole.ORGANISER)
  async listWalkLists(@Query("turfId") turfId?: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.listWalkLists(org.id, turfId);
  }

  @Post("walk-lists")
  @Roles(AppUserRole.ORGANISER)
  async createWalkList(@Body() dto: CreateWalkListDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createWalkList(org.id, {
      ...dto,
      listType: dto.listType as WalkListItemListType | undefined,
    });
  }

  @Patch("walk-lists/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateWalkList(@Param("id") id: string, @Body() dto: UpdateWalkListDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.updateWalkList(org.id, id, {
      ...dto,
      listType: dto.listType as WalkListItemListType | undefined,
    });
  }

  @Post("turfs/assign")
  @Roles(AppUserRole.ORGANISER)
  async assignTurf(@Body() dto: AssignTurfDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.assignTurf(
      org.id,
      dto.turfId,
      dto.canvasserId,
      dto.lockedUntil ? new Date(dto.lockedUntil) : undefined,
    );
  }

  // Canvasser
  @Get("assignments")
  async assignments(@Query("canvasserId") canvasserId: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.listAssignments(org.id, canvasserId);
  }

  @Post("turfs/:id/release")
  async releaseTurf(@Param("id") id: string, @Body() dto: ReleaseTurfDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.releaseTurf(org.id, id, dto.canvasserId);
  }

  @Post("door-knocks")
  async recordDoorKnock(@Body() dto: RecordDoorKnockDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.recordDoorKnock(org.id, dto);
  }

  @Post("door-contacts")
  async createDoorContact(@Body() dto: CreateDoorContactDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createDoorContact(org.id, dto);
  }

  @Post("door-photos")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDoorPhoto(@UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    return this.canvassing.uploadDoorPhoto(file);
  }

  // ── Shifts (organiser) ───────────────────────────────────────
  @Get("shifts")
  @Roles(AppUserRole.ORGANISER)
  async listShifts(@Query("campaignId") campaignId?: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.listShifts(org.id, campaignId);
  }

  @Post("shifts")
  @Roles(AppUserRole.ORGANISER)
  async createShift(@Body() dto: CreateShiftDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.createShift(org.id, dto);
  }

  @Patch("shifts/:id")
  @Roles(AppUserRole.ORGANISER)
  async updateShift(@Param("id") id: string, @Body() dto: UpdateShiftDto) {
    const org = await this.ensureOrganization();
    return this.canvassing.updateShift(org.id, id, dto);
  }

  @Delete("shifts/:id")
  @Roles(AppUserRole.ORGANISER)
  async deleteShift(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.deleteShift(org.id, id);
  }

  // ── QA review (organiser) ────────────────────────────────────
  @Get("campaigns/:id/qa")
  @Roles(AppUserRole.ORGANISER)
  async qaReview(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.canvassing.qaReview(org.id, id);
  }
}
