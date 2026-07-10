import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { GeoService } from "../geo/geo.service";
import { InsightsService } from "./insights.service";

/** Boundary layers a public poll may render — anonymous tile access is scoped to
 *  these (open ABS reference data), never the full organiser-gated /geo/tiles surface. */
const PUBLIC_TILE_LAYERS = new Set(["sed_upper"]);

/**
 * UNAUTHENTICATED public poll surface for the `action` app. Every route here is allowlisted in
 * BasicAuthGuard (`isPublicWebhookPath`, prefix `/insights/public/`) and carries NO
 * `@RequirePermission`, so it is reachable with no session. Safety rests entirely on the
 * service: `getPublicPoll*` filter on `isPublic`, so a private or global-tier poll 404s here
 * exactly as a missing one would — nothing that isn't explicitly public is ever served.
 */
@Controller("insights/public")
export class PublicInsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly geo: GeoService,
  ) {}

  /**
   * Anonymous Mapbox Vector Tile of a public poll's region layer — the geometry the
   * embedded choropleth paints. Scoped to PUBLIC_TILE_LAYERS so this never opens the
   * organiser-gated /geo/tiles surface. Binary MVT via @Res() (bypasses the {ok,data}
   * interceptor); long-cacheable static reference data.
   */
  @Get("tiles/:geoKind/:z/:x/:y")
  async tile(
    @Param("geoKind") geoKind: string,
    @Param("z") z: string,
    @Param("x") x: string,
    @Param("y") y: string,
    @Res() res: Response,
  ) {
    if (!PUBLIC_TILE_LAYERS.has(geoKind)) {
      res.status(404).end();
      return;
    }
    const buf = await this.geo.tile(geoKind, Number(z), Number(x), Number(y));
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (!buf.length) {
      res.status(204).end();
      return;
    }
    res.send(buf);
  }

  @Get("polls/:id")
  getPoll(@Param("id") id: string) {
    return this.insights.getPublicPoll(id);
  }

  @Get("polls/:id/questions/:code")
  getQuestion(@Param("id") id: string, @Param("code") code: string) {
    return this.insights.getPublicPollQuestion(id, code);
  }

  @Get("polls/:id/questions/:code/choropleth")
  choropleth(@Param("id") id: string, @Param("code") code: string, @Query("response") response: string) {
    return this.insights.getPublicChoropleth(id, code, response);
  }
}
