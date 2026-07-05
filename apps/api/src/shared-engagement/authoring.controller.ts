import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantId } from "../auth/tenant-id.decorator";
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
    private readonly surveys: SurveysService,
    private readonly scripts: ScriptsService,
  ) {}

  // ── Surveys ──────────────────────────────────────────────────
  @Get("surveys")
  async listSurveys(@TenantId() tenantId: string) {
    return this.surveys.list(tenantId);
  }

  @Get("surveys/:id")
  async getSurvey(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.surveys.get(tenantId, id);
  }

  @Post("surveys")
  async createSurvey(@TenantId() tenantId: string, @Body() dto: CreateSurveyDto) {
    return this.surveys.create(tenantId, dto);
  }

  @Patch("surveys/:id")
  async updateSurvey(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateSurveyDto,
  ) {
    return this.surveys.update(tenantId, id, dto);
  }

  @Delete("surveys/:id")
  async deleteSurvey(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.surveys.archive(tenantId, id);
  }

  // ── Scripts ──────────────────────────────────────────────────
  @Get("scripts")
  async listScripts(@TenantId() tenantId: string) {
    return this.scripts.list(tenantId);
  }

  @Get("scripts/:id")
  async getScript(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.scripts.get(tenantId, id);
  }

  @Post("scripts")
  async createScript(@TenantId() tenantId: string, @Body() dto: CreateScriptDto) {
    return this.scripts.create(tenantId, dto);
  }

  @Patch("scripts/:id")
  async updateScript(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateScriptDto,
  ) {
    return this.scripts.update(tenantId, id, dto);
  }

  @Delete("scripts/:id")
  async deleteScript(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.scripts.archive(tenantId, id);
  }
}
