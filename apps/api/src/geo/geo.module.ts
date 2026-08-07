import { Module } from "@nestjs/common";
import { GeoController } from "./geo.controller";
import { GeoTilesController } from "./geo-tiles.controller";
import { GeoService } from "./geo.service";

@Module({
  controllers: [GeoController, GeoTilesController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
