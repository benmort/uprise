import { Controller, Get, Param, Query } from "@nestjs/common";
import { CivicService } from "./civic.service";
import { RequirePermission } from "../auth/require-permission.decorator";

/**
 * Civic read API — politicians + policies synced from They Vote For You. Global reference
 * data (not tenant-scoped), so no `@TenantId()`; every route is permission-gated. Reads are
 * granted to members+ via `civic.all` (see @uprise/permissions roles). The `geoKind`+`geoCode`
 * filter on `politicians` is the electorate-detail hook (the rep(s) for a division code).
 */
const READ_POLITICIAN = { action: "read", resource: "civic.politician" } as const;
const READ_POLICY = { action: "read", resource: "civic.policy" } as const;

@Controller("civic")
export class CivicController {
  constructor(private readonly civic: CivicService) {}

  @Get("politicians")
  @RequirePermission(READ_POLITICIAN)
  listPoliticians(
    @Query("jurisdiction") jurisdiction?: string,
    @Query("chamber") chamber?: string,
    @Query("house") house?: string,
    @Query("party") party?: string,
    @Query("geoKind") geoKind?: string,
    @Query("geoCode") geoCode?: string,
    @Query("q") q?: string,
  ) {
    return this.civic.listPoliticians({ jurisdiction, chamber, house, party, geoKind, geoCode, q });
  }

  @Get("politicians/:id")
  @RequirePermission(READ_POLITICIAN)
  getPolitician(@Param("id") id: string) {
    return this.civic.getPolitician(id);
  }

  @Get("policies")
  @RequirePermission(READ_POLICY)
  listPolicies(@Query("q") q?: string, @Query("provisional") provisional?: string) {
    return this.civic.listPolicies({
      q,
      provisional: provisional === undefined ? undefined : provisional === "true",
    });
  }

  @Get("policies/:id")
  @RequirePermission(READ_POLICY)
  getPolicy(@Param("id") id: string) {
    return this.civic.getPolicy(id);
  }
}
