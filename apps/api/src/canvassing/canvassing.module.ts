import { Module } from "@nestjs/common";
import { SharedEngagementModule } from "../shared-engagement/shared-engagement.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { CanvassingController } from "./canvassing.controller";
import { CanvassingService } from "./canvassing.service";

@Module({
  imports: [SharedEngagementModule],
  controllers: [CampaignsController, CanvassingController],
  providers: [CanvassingService, CampaignsService],
  exports: [CanvassingService, CampaignsService],
})
export class CanvassingModule {}
