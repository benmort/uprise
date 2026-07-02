import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto, SetBoundaryDto, UpdateCampaignDto } from "./dto/campaigns.dto";

@Controller("canvass/campaigns")
@UseGuards(RolesGuard)
export class CampaignsController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get()
  @Roles(AppUserRole.ORGANISER)
  async list() {
    const org = await this.ensureOrganization();
    return this.campaigns.list(org.id);
  }

  @Post()
  @Roles(AppUserRole.ORGANISER)
  async create(@Body() dto: CreateCampaignDto) {
    const org = await this.ensureOrganization();
    return this.campaigns.create(org.id, dto);
  }

  @Get(":id")
  @Roles(AppUserRole.ORGANISER)
  async get(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.campaigns.get(org.id, id);
  }

  @Get(":id/summary")
  @Roles(AppUserRole.ORGANISER)
  async summary(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.campaigns.getSummary(org.id, id);
  }

  @Get(":id/results")
  @Roles(AppUserRole.ORGANISER)
  async results(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.campaigns.getResults(org.id, id);
  }

  @Get(":id/live")
  @Roles(AppUserRole.ORGANISER)
  async live(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.campaigns.getLive(org.id, id);
  }

  @Patch(":id")
  @Roles(AppUserRole.ORGANISER)
  async update(@Param("id") id: string, @Body() dto: UpdateCampaignDto) {
    const org = await this.ensureOrganization();
    return this.campaigns.update(org.id, id, dto);
  }

  @Get(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async getBoundary(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    return this.campaigns.getBoundary(org.id, id);
  }

  @Put(":id/boundary")
  @Roles(AppUserRole.ORGANISER)
  async setBoundary(@Param("id") id: string, @Body() dto: SetBoundaryDto) {
    const org = await this.ensureOrganization();
    return this.campaigns.setBoundary(org.id, id, dto.sources);
  }
}
