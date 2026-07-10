import { Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantId } from "../auth/tenant-id.decorator";
import { GeoService } from "./geo.service";

@Controller("geo")
@UseGuards(RolesGuard)
@Roles(AppUserRole.ORGANISER)
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get("status")
  status() {
    return this.geo.status();
  }

  @Get("divisions")
  listDivisions(@Query("type") type = "ced") {
    return this.geo.listDivisions(type);
  }

  @Get("divisions/:type/:code")
  async divisionDetail(
    @TenantId() tenantId: string,
    @Param("type") type: string,
    @Param("code") code: string,
  ) {
    return this.geo.divisionDetail(tenantId, type, code);
  }

  @Get("states")
  listStates() {
    return this.geo.listStates();
  }

  @Get("states/:code")
  async stateDetail(@TenantId() tenantId: string, @Param("code") code: string) {
    return this.geo.stateDetail(tenantId, code);
  }

  /** The chamber catalogue — including the chambers that do NOT exist (Queensland, the
   *  ACT and the NT have no upper house; councils are unicameral), so the explorer can say
   *  so rather than render an empty tab. */
  @Get("chambers")
  listChambers() {
    return this.geo.listChambers();
  }

  /** Electorates of the chambers that have no sub-state boundaries: the Senate and the
   *  NSW/SA/WA Legislative Councils. Their boundary is the jurisdiction itself. */
  @Get("chamber-electorates")
  listChamberElectorates() {
    return this.geo.listChamberElectorates();
  }

  @Get("chamber-electorates/:code")
  async chamberElectorateDetail(@TenantId() tenantId: string, @Param("code") code: string) {
    return this.geo.chamberElectorateDetail(tenantId, code);
  }

  /** First Nations (ABS Indigenous Structure) — a REFERENCE-ONLY layer. Browsable and
   *  tileable, but absent from every turf/boundary code path by construction. */
  @Get("first-nations")
  listFirstNations(
    @Query("level") level = "ireg",
    @Query("q") q = "",
    @Query("state") state?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.geo.listFirstNations(level, {
      q,
      state,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get("first-nations/:level/:code")
  async firstNationsDetail(
    @TenantId() tenantId: string,
    @Param("level") level: string,
    @Param("code") code: string,
  ) {
    return this.geo.firstNationsDetail(tenantId, level, code);
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
  async areaDetail(
    @TenantId() tenantId: string,
    @Param("layer") layer: string,
    @Param("code") code: string,
  ) {
    return this.geo.areaDetail(tenantId, layer, code);
  }

  @Get("areas")
  listAreas(
    @Query("layer") layer = "sa2",
    @Query("bbox") bbox = "",
    @Query("limit") limit?: string,
  ) {
    return this.geo.areas({ layer, bbox, limit: limit ? Number(limit) : undefined });
  }

  /**
   * The five colour bands for a layer's density choropleth (four quantile breaks).
   * The tiles already carry each region's `density`; this is the scale to paint it with,
   * computed nationally so a colour means the same thing wherever the map is panned.
   */
  @Get("density/scale")
  densityScale(@Query("kind") kind: string) {
    return this.geo.densityScale(kind);
  }

  /**
   * One Mapbox Vector Tile of a geo layer's boundaries. The map source requests
   * only the tiles it needs at each zoom, so this is the fast, any-zoom replacement
   * for the per-viewport `GET /geo/areas` GeoJSON. Binary MVT via `@Res()`, which
   * bypasses the global `{ok,data}` interceptor (same as the analytics `@Sse`).
   * Long-cacheable — boundaries are static reference data. Feature properties are
   * `{ code, name, density? }`; `density` is absent where the area is unmeasured.
   */
  @Get("tiles/:layer/:z/:x/:y")
  async tile(
    @Param("layer") layer: string,
    @Param("z") z: string,
    @Param("x") x: string,
    @Param("y") y: string,
    @Res() res: Response,
  ) {
    const buf = await this.geo.tile(layer, Number(z), Number(x), Number(y));
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (!buf.length) {
      res.status(204).end();
      return;
    }
    res.send(buf);
  }

  // ── Polling places (booths) — federal (AEC) + state/territory (The Tally Room) ──

  /** Minimal booth points for the map layer (declared before polling-places/:id). */
  @Get("polling-places/points")
  pollingPlacePoints(
    @Query("jurisdiction") jurisdiction?: string,
    @Query("state") state?: string,
    @Query("limit") limit?: string,
  ) {
    return this.geo.pollingPlacePoints({ jurisdiction, state, limit: limit ? Number(limit) : undefined });
  }

  /** Paged, filterable booth list for the polling-places explorer list view. */
  @Get("polling-places")
  browsePollingPlaces(
    @Query("jurisdiction") jurisdiction?: string,
    @Query("state") state?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.geo.browsePollingPlaces({
      jurisdiction,
      state,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get("polling-places/:id")
  pollingPlaceDetail(@Param("id") id: string) {
    return this.geo.pollingPlaceDetail(id);
  }

  /** Nearest real doors to a point (the Addresses page's geocoded search pin). */
  @Get("addresses/near")
  async addressesNear(
    @TenantId() tenantId: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("limit") limit?: string,
  ) {
    return this.geo.nearbyAddresses(tenantId, {
      lat: Number(lat),
      lng: Number(lng),
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("addresses")
  async addresses(
    @TenantId() tenantId: string,
    @Query("turfId") turfId?: string,
    @Query("divisionType") divisionType?: string,
    @Query("divisionCode") divisionCode?: string,
    @Query("withoutContacts") withoutContacts?: string,
    @Query("limit") limit?: string,
  ) {
    return this.geo.addresses(tenantId, {
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
  async ingest(@TenantId() _tenantId: string) {
    return {
      queued: true,
      note: "Run the geo ETL on a host with disk + psql: `npm --prefix apps/api run geo:fetch && geo:load && geo:map`.",
    };
  }
}
