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
import { HeatService } from "./heat.service";
import { HeatFactorsService } from "./heat-factors.service";
import { EvaluationService } from "./evaluation.service";

@Module({
  imports: [SharedEngagementModule, GeoModule, QueueModule],
  controllers: [CampaignsController, CanvassingController],
  providers: [CanvassingService, CampaignsService, TurfEstimateService, MapboxDirectionsClient, HeatService, HeatFactorsService, EvaluationService],
  exports: [CanvassingService, CampaignsService, TurfEstimateService, HeatService, EvaluationService],
})
export class CanvassingModule {}
