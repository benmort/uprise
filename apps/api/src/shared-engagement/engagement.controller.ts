import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole, EngagementChannel } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
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
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
    private readonly canned: CannedResponsesService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get("dispositions")
  async listDispositions(@Query("channel") channel?: EngagementChannel) {
    const org = await this.ensureOrganization();
    return this.engagement.listDispositionDefs(org.id, channel);
  }

  @Post("dispositions")
  async recordDisposition(@Body() dto: RecordDispositionDto) {
    const org = await this.ensureOrganization();
    return this.engagement.recordDisposition(org.id, dto);
  }

  // ── Disposition authoring (organiser) ──────────────────────────
  @Post("disposition-defs")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async createDispositionDef(@Body() dto: CreateDispositionDefDto) {
    const org = await this.ensureOrganization();
    return this.engagement.createDispositionDef(org.id, dto);
  }

  @Patch("disposition-defs/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async updateDispositionDef(@Param("id") id: string, @Body() dto: UpdateDispositionDefDto) {
    const org = await this.ensureOrganization();
    return this.engagement.updateDispositionDef(org.id, id, dto);
  }

  @Delete("disposition-defs/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async deleteDispositionDef(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.engagement.deleteDispositionDef(org.id, id);
  }

  @Post("survey-answers")
  async recordSurveyAnswer(@Body() dto: RecordSurveyAnswerDto) {
    const org = await this.ensureOrganization();
    return this.engagement.recordSurveyAnswer(org.id, dto);
  }

  @Get("canned-responses")
  async listCanned(
    @Query("channel") channel?: EngagementChannel,
    @Query("ownerId") ownerId?: string,
  ) {
    const org = await this.ensureOrganization();
    return this.canned.listForChannel(org.id, channel ?? EngagementChannel.SMS, ownerId);
  }

  @Post("canned-responses")
  async createCanned(@Body() dto: CreateCannedResponseDto) {
    const org = await this.ensureOrganization();
    return this.canned.create(org.id, dto);
  }

  @Patch("canned-responses/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async updateCanned(@Param("id") id: string, @Body() dto: UpdateCannedResponseDto) {
    const org = await this.ensureOrganization();
    return this.canned.update(org.id, id, dto);
  }

  @Delete("canned-responses/:id")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async deleteCanned(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.canned.archive(org.id, id);
  }

  @Post("canned-responses/use")
  async useCanned(@Body() dto: UseCannedResponseDto) {
    const org = await this.ensureOrganization();
    return this.engagement.useCannedResponse(org.id, {
      cannedResponseId: dto.cannedResponseId,
      contactId: dto.contactId,
      channel: dto.channel ?? EngagementChannel.SMS,
    });
  }
}
