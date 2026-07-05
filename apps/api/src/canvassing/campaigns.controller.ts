import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantId } from "../auth/tenant-id.decorator";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto, SetBoundaryDto, UpdateCampaignDto } from "./dto/campaigns.dto";

@Controller("canvass/campaigns")
@UseGuards(RolesGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

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

  @Get(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async getBoundary(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.campaigns.getBoundary(tenantId, id);
  }

  @Put(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async setBoundary(@Param("id") id: string, @Body() dto: SetBoundaryDto, @TenantId() tenantId: string) {
    return this.campaigns.setBoundary(tenantId, id, dto.sources);
  }
}
