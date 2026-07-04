import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@uprise/db";
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

  @Get("states")
  listStates() {
    return this.geo.listStates();
  }

  @Get("states/:code")
  async stateDetail(@Param("code") code: string) {
    const org = await this.ensureOrganization();
    return this.geo.stateDetail(org.id, code);
  }

  /** One region's place in the containment tree: what contains it + what it
   *  contains (state ↔ SA4 ↔ … ↔ meshblock ↔ address, plus CED/SED/LGA). */
  @Get("hierarchy")
  regionHierarchy(@Query("kind") kind = "", @Query("code") code = "") {
    return this.geo.regionHierarchy(kind, code);
  }

  @Get("areas/search")
  searchAreas(
    @Query("layer") layer = "sa2",
    @Query("q") q = "",
    @Query("limit") limit?: string,
    @Query("state") state?: string,
  ) {
    return this.geo.searchAreas(layer, q, limit ? Number(limit) : undefined, state);
  }

  /** Paged national browse for the areas list view (declared before areas/:layer/:code). */
  @Get("areas/browse")
  browseAreas(
    @Query("layer") layer = "sa2",
    @Query("q") q = "",
    @Query("state") state?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.geo.browseAreas(layer, {
      q,
      state,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get("areas/:layer/:code")
  area(@Param("layer") layer: string, @Param("code") code: string) {
    return this.geo.area(layer, code);
  }

  @Get("areas/:layer/:code/detail")
  async areaDetail(@Param("layer") layer: string, @Param("code") code: string) {
    const org = await this.ensureOrganization();
    return this.geo.areaDetail(org.id, layer, code);
  }

  @Get("areas")
  listAreas(
    @Query("layer") layer = "sa2",
    @Query("bbox") bbox = "",
    @Query("limit") limit?: string,
  ) {
    return this.geo.areas({ layer, bbox, limit: limit ? Number(limit) : undefined });
  }

  /** Nearest real doors to a point (the Addresses page's geocoded search pin). */
  @Get("addresses/near")
  async addressesNear(
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("limit") limit?: string,
  ) {
    const org = await this.ensureOrganization();
    return this.geo.nearbyAddresses(org.id, {
      lat: Number(lat),
      lng: Number(lng),
      limit: limit ? Number(limit) : undefined,
    });
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
