import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { GeoService } from "./geo.service";

/**
 * Vector tiles, split out of `GeoController` so they carry NO `@Roles`.
 *
 * Not a cosmetic split. `GeoController` is class-gated `@Roles(ORGANISER)`, and a role can only
 * come from the full principal build — session, then user, then memberships: three sequential
 * queries and a write, per request. A choropleth asks for every tile in the viewport at once, so
 * turning on the targeting map fired ~22 of those against a connection pool of five and exhausted
 * it; the map 500'd on its own tiles.
 *
 * Tiles need none of it. The handler takes no tenant and no user, the bytes are ABS/AEC boundary
 * data identical for every caller, and the response is already `Cache-Control: public`. So
 * `BasicAuthGuard.isStaticTilePath` authenticates these with one indexed lookup and attaches a
 * principal with no role — which is exactly why this route must not live behind a role gate.
 *
 * Still signed-in-only. Cheap is not the same as open.
 */
@Controller("geo")
export class GeoTilesController {
  constructor(private readonly geo: GeoService) {}

  /**
   * One Mapbox Vector Tile of a geo layer's boundaries. The map source requests only the tiles it
   * needs at each zoom, so this is the fast, any-zoom replacement for the per-viewport
   * `GET /geo/areas` GeoJSON. Binary MVT via `@Res()`, which bypasses the global `{ok,data}`
   * interceptor (same as the analytics `@Sse`). Long-cacheable — boundaries are static reference
   * data. Feature properties are `{ code, name, density? }`; `density` is absent where the area is
   * unmeasured.
   */
  @Get("tiles/:layer/:z/:x/:y")
  async tile(
    @Param("layer") layer: string,
    @Param("z") z: string,
    @Param("x") x: string,
    @Param("y") y: string,
    @Res() res: Response,
    // Optional ABS indicator baked onto each feature as `value` — how SA1/meshblock choropleths
    // paint (client `["match"]` can't scale to 60k/360k features). Absent = the plain boundary tile.
    @Query("metric") metric?: string,
  ) {
    const buf = await this.geo.tile(layer, Number(z), Number(x), Number(y), metric || undefined);
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (!buf.length) {
      res.status(204).end();
      return;
    }
    res.send(buf);
  }
}
