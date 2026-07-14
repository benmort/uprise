import { Module } from "@nestjs/common";
import { DemographicsController } from "./demographics.controller";
import { DemographicsService } from "./demographics.service";

/**
 * `demographics` domain — ABS Census 2021 (GCP) + SEIFA 2021 indicators attached to ASGS regions.
 * Read-only reference data (loaded today by the `abs:load` script). PrismaService is global, so
 * nothing to import. Geometry + tiles stay in GeoModule; this owns the attribute values only.
 */
@Module({
  controllers: [DemographicsController],
  providers: [DemographicsService],
  exports: [DemographicsService],
})
export class DemographicsModule {}
