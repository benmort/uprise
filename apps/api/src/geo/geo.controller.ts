import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { GeoService } from "./geo.service";

@Controller("geo")
@UseGuards(RolesGuard)
@Roles(AppUserRole.ORGANISER)
export class GeoController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get("status")
  status() {
    return this.geo.status();
  }

  @Get("divisions")
  listDivisions(@Query("type") type = "ced") {
    return this.geo.listDivisions(type);
  }

  @Get("divisions/:type/:code")
  async divisionDetail(@Param("type") type: string, @Param("code") code: string) {
    const org = await this.ensureOrganization();
    return this.geo.divisionDetail(org.id, type, code);
  }

  @Get("areas/search")
  searchAreas(
    @Query("layer") layer = "sa2",
    @Query("q") q = "",
    @Query("limit") limit?: string,
  ) {
    return this.geo.searchAreas(layer, q, limit ? Number(limit) : undefined);
  }

  @Get("areas/:layer/:code")
  area(@Param("layer") layer: string, @Param("code") code: string) {
    return this.geo.area(layer, code);
  }

  @Get("areas")
  listAreas(
    @Query("layer") layer = "sa2",
    @Query("bbox") bbox = "",
    @Query("limit") limit?: string,
  ) {
    return this.geo.areas({ layer, bbox, limit: limit ? Number(limit) : undefined });
  }

  @Get("addresses")
  async addresses(
    @Query("turfId") turfId?: string,
    @Query("divisionType") divisionType?: string,
    @Query("divisionCode") divisionCode?: string,
    @Query("withoutContacts") withoutContacts?: string,
    @Query("limit") limit?: string,
  ) {
    const org = await this.ensureOrganization();
    return this.geo.addresses(org.id, {
      turfId,
      divisionType,
      divisionCode,
      withoutContacts: withoutContacts === "true",
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Trigger/queue a (re-)ingest. The heavy ETL runs via the geo CLI scripts; this
   *  marks intent + is the hook the worker/runbook reads. */
  @Post("ingest")
  async ingest() {
    await this.ensureOrganization();
    return {
      queued: true,
      note: "Run the geo ETL on a host with disk + psql: `npm --prefix apps/api run geo:fetch && geo:load && geo:map`.",
    };
  }
}
