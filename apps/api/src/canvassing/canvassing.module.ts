import { Module } from "@nestjs/common";
import { SharedEngagementModule } from "../shared-engagement/shared-engagement.module";
import { GeoModule } from "../geo/geo.module";
import { QueueModule } from "../common/queue/queue.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { CanvassingController } from "./canvassing.controller";
import { CanvassingService } from "./canvassing.service";
import { TurfEstimateService } from "./turf-estimate.service";
import { MapboxDirectionsClient } from "./mapbox-directions.client";

@Module({
  imports: [SharedEngagementModule, GeoModule, QueueModule],
  controllers: [CampaignsController, CanvassingController],
  providers: [CanvassingService, CampaignsService, TurfEstimateService, MapboxDirectionsClient],
  exports: [CanvassingService, CampaignsService, TurfEstimateService],
})
export class CanvassingModule {}
