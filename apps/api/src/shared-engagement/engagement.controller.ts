import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AppUserRole, EngagementChannel } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// Disposition + survey recording are canvasser field actions (volunteer perms; organisers
// inherit via canvass.all). Canned responses are inbox reply helpers (organiser). Authoring
// mutations already carry @Roles(ORGANISER).
const CANVASS_READ = { action: "read", resource: "canvass.script" } as const;
const DISPOSITION = { action: "create", resource: "canvass.disposition" } as const;
const INBOX_READ = { action: "read", resource: "messaging.conversation" } as const;
const INBOX_MANAGE = { action: "manage", resource: "messaging.conversation" } as const;
import { EngagementService } from "./engagement.service";
import { CannedResponsesService } from "./canned-responses.service";
import {
  CreateCannedResponseDto,
  CreateDispositionDefDto,
  RecordDispositionDto,
  RecordSurveyAnswerDto,
  UpdateCannedResponseDto,
  UpdateDispositionDefDto,
  UseCannedResponseDto,
} from "./dto/engagement.dto";

@Controller("engagement")
export class EngagementController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly canned: CannedResponsesService,
  ) {}

  @Get("dispositions")
  @RequirePermission(CANVASS_READ)
  async listDispositions(
    @TenantId() tenantId: string,
    @Query("channel") channel?: EngagementChannel,
  ) {
    return this.engagement.listDispositionDefs(tenantId, channel);
  }

  @Post("dispositions")
  @RequirePermission(DISPOSITION)
  async recordDisposition(@TenantId() tenantId: string, @Body() dto: RecordDispositionDto) {
    return this.engagement.recordDisposition(tenantId, dto);
  }

  // ── Disposition authoring (organiser) ──────────────────────────
  @Post("disposition-defs")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async createDispositionDef(@TenantId() tenantId: string, @Body() dto: CreateDispositionDefDto) {
    return this.engagement.createDispositionDef(tenantId, dto);
  }

  @Patch("disposition-defs/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async updateDispositionDef(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDispositionDefDto,
  ) {
    return this.engagement.updateDispositionDef(tenantId, id, dto);
  }

  @Delete("disposition-defs/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async deleteDispositionDef(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.engagement.deleteDispositionDef(tenantId, id);
  }

  @Post("survey-answers")
  @RequirePermission(DISPOSITION)
  async recordSurveyAnswer(@TenantId() tenantId: string, @Body() dto: RecordSurveyAnswerDto) {
    return this.engagement.recordSurveyAnswer(tenantId, dto);
  }

  @Get("canned-responses")
  @RequirePermission(INBOX_READ)
  async listCanned(
    @TenantId() tenantId: string,
    @Query("channel") channel?: EngagementChannel,
    @Query("ownerId") ownerId?: string,
  ) {
    return this.canned.listForChannel(tenantId, channel ?? EngagementChannel.SMS, ownerId);
  }

  @Post("canned-responses")
  @RequirePermission(INBOX_MANAGE)
  async createCanned(@TenantId() tenantId: string, @Body() dto: CreateCannedResponseDto) {
    return this.canned.create(tenantId, dto);
  }

  @Patch("canned-responses/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async updateCanned(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.canned.update(tenantId, id, dto);
  }

  @Delete("canned-responses/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async deleteCanned(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.canned.archive(tenantId, id);
  }

  @Post("canned-responses/use")
  @RequirePermission(INBOX_MANAGE)
  async useCanned(@TenantId() tenantId: string, @Body() dto: UseCannedResponseDto) {
    return this.engagement.useCannedResponse(tenantId, {
      cannedResponseId: dto.cannedResponseId,
      contactId: dto.contactId,
      channel: dto.channel ?? EngagementChannel.SMS,
    });
  }
}
