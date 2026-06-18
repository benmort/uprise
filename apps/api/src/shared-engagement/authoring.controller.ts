import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SurveysService } from "./surveys.service";
import { ScriptsService } from "./scripts.service";
import {
  CreateScriptDto,
  CreateSurveyDto,
  UpdateScriptDto,
  UpdateSurveyDto,
} from "./dto/authoring.dto";

/** Organiser-only authoring of surveys and scripts (the engagement library). */
@Controller("engagement")
@UseGuards(RolesGuard)
@Roles(AppUserRole.ORGANISER)
export class AuthoringController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly surveys: SurveysService,
    private readonly scripts: ScriptsService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  // ── Surveys ──────────────────────────────────────────────────
  @Get("surveys")
  async listSurveys() {
    const org = await this.ensureOrganization();
    return this.surveys.list(org.id);
  }

  @Get("surveys/:id")
  async getSurvey(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.surveys.get(org.id, id);
  }

  @Post("surveys")
  async createSurvey(@Body() dto: CreateSurveyDto) {
    const org = await this.ensureOrganization();
    return this.surveys.create(org.id, dto);
  }

  @Patch("surveys/:id")
  async updateSurvey(@Param("id") id: string, @Body() dto: UpdateSurveyDto) {
    const org = await this.ensureOrganization();
    return this.surveys.update(org.id, id, dto);
  }

  @Delete("surveys/:id")
  async deleteSurvey(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.surveys.archive(org.id, id);
  }

  // ── Scripts ──────────────────────────────────────────────────
  @Get("scripts")
  async listScripts() {
    const org = await this.ensureOrganization();
    return this.scripts.list(org.id);
  }

  @Get("scripts/:id")
  async getScript(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.scripts.get(org.id, id);
  }

  @Post("scripts")
  async createScript(@Body() dto: CreateScriptDto) {
    const org = await this.ensureOrganization();
    return this.scripts.create(org.id, dto);
  }

  @Patch("scripts/:id")
  async updateScript(@Param("id") id: string, @Body() dto: UpdateScriptDto) {
    const org = await this.ensureOrganization();
    return this.scripts.update(org.id, id, dto);
  }

  @Delete("scripts/:id")
  async deleteScript(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.scripts.archive(org.id, id);
  }
}
