import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantId } from "../auth/tenant-id.decorator";
import { CampaignsService } from "./campaigns.service";
import { HeatService } from "./heat.service";
import { CreateCampaignDto, HeatConfigDto, SetBoundaryDto, UpdateCampaignDto } from "./dto/campaigns.dto";

@Controller("canvass/campaigns")
@UseGuards(RolesGuard)
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly heat: HeatService,
  ) {}

  @Get()
  @Roles(AppUserRole.ORGANISER)
  async list(@TenantId() tenantId: string) {
    return this.campaigns.list(tenantId);
  }

  @Post()
  @Roles(AppUserRole.ORGANISER)
  async create(@Body() dto: CreateCampaignDto, @TenantId() tenantId: string) {
    return this.campaigns.create(tenantId, dto);
  }

  // Tenant-wide aggregates (the "All campaigns" views). Declared BEFORE `:id` so the
  // literal segment wins — otherwise `/canvass/campaigns/results` matches `:id="results"`.
  @Get("results")
  @Roles(AppUserRole.ORGANISER)
  async resultsAll(@TenantId() tenantId: string) {
    return this.campaigns.getResults(tenantId);
  }

  @Get("live")
  @Roles(AppUserRole.ORGANISER)
  async liveAll(@TenantId() tenantId: string) {
    return this.campaigns.getLive(tenantId);
  }

  @Get(":id")
  @Roles(AppUserRole.ORGANISER)
  async get(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.get(tenantId, id);
  }

  @Get(":id/summary")
  @Roles(AppUserRole.ORGANISER)
  async summary(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.getSummary(tenantId, id);
  }

  @Get(":id/results")
  @Roles(AppUserRole.ORGANISER)
  async results(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.getResults(tenantId, id);
  }

  @Get(":id/live")
  @Roles(AppUserRole.ORGANISER)
  async live(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.getLive(tenantId, id);
  }

  @Patch(":id")
  @Roles(AppUserRole.ORGANISER)
  async update(@Param("id") id: string, @Body() dto: UpdateCampaignDto, @TenantId() tenantId: string) {
    return this.campaigns.update(tenantId, id, dto);
  }

  @Delete(":id")
  @Roles(AppUserRole.ORGANISER)
  async remove(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.remove(tenantId, id);
  }

  @Get(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async getBoundary(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.getBoundary(tenantId, id);
  }

  @Get(":id/boundary/address-count")
  @Roles(AppUserRole.ORGANISER)
  async boundaryAddressCount(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.boundaryAddressCount(tenantId, id);
  }

  @Put(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async setBoundary(@Param("id") id: string, @Body() dto: SetBoundaryDto, @TenantId() tenantId: string) {
    return this.campaigns.setBoundary(tenantId, id, dto.sources);
  }

  // Live boundary preview — unions the sources without saving (drawn as the organiser builds it).
  @Post(":id/boundary/preview")
  @Roles(AppUserRole.ORGANISER)
  async previewBoundary(@Param("id") id: string, @Body() dto: SetBoundaryDto, @TenantId() tenantId: string) {
    return this.campaigns.previewBoundary(tenantId, id, dto.sources);
  }

  // Areas at `layer` (sa4/sa3/sa2/sa1/mb) intersecting the campaign boundary — the
  // selectable layer for cutting turf inside a bounded campaign.
  @Get(":id/areas/:layer")
  @Roles(AppUserRole.ORGANISER)
  async areasInBoundary(
    @Param("id") id: string,
    @Param("layer") layer: string,
    @TenantId() tenantId: string,
  ) {
    return this.campaigns.areasInBoundary(tenantId, id, layer);
  }

  // ── Targeting heat map (SA1 "where to knock" score over the boundary) ──────

  @Get(":id/heat")
  @Roles(AppUserRole.ORGANISER)
  async getHeat(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.heat.getForCampaign(tenantId, id);
  }

  @Put(":id/heat-config")
  @Roles(AppUserRole.ORGANISER)
  async setHeatConfig(@Param("id") id: string, @Body() dto: HeatConfigDto, @TenantId() tenantId: string) {
    return this.heat.setConfig(tenantId, id, dto);
  }

  @Post(":id/heat/refresh")
  @Roles(AppUserRole.ORGANISER)
  async refreshHeat(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.heat.refresh(tenantId, id);
  }
}
