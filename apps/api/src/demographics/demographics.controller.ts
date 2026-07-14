import { Controller, Get, Param, Query } from "@nestjs/common";
import { DemographicsService } from "./demographics.service";
import { RequirePermission } from "../auth/require-permission.decorator";

/**
 * ABS demographics read API — Census + SEIFA indicators attached to geo regions. Global reference
 * data (not tenant-scoped), so no `@TenantId()`; every route is permission-gated. Reads are granted
 * to members+ via `demographics.all` (see @uprise/permissions roles). Geometry + tiles live in the
 * geo domain; this serves the attribute values the choropleth paints them with.
 */
const READ = { action: "read", resource: "demographics.indicator" } as const;

@Controller("demographics")
export class DemographicsController {
  constructor(private readonly demographics: DemographicsService) {}

  // Declared before the `:` routes so "indicators"/"status" are never captured as a param.
  @Get("indicators")
  @RequirePermission(READ)
  listIndicators() {
    return this.demographics.listIndicators();
  }

  @Get("status")
  @RequirePermission(READ)
  status() {
    return this.demographics.status();
  }

  @Get("choropleth")
  @RequirePermission(READ)
  choropleth(@Query("level") level = "sa2", @Query("indicator") indicator = "") {
    return this.demographics.choropleth(level, indicator);
  }

  @Get("regions/:level/:code")
  @RequirePermission(READ)
  regionProfile(@Param("level") level: string, @Param("code") code: string) {
    return this.demographics.regionProfile(level, code);
  }
}
