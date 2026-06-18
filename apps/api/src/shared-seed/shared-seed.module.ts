import { Module } from "@nestjs/common";
import { SharedEngagementModule } from "../shared-engagement/shared-engagement.module";
import { CanvassingModule } from "../canvassing/canvassing.module";
import { SeedService } from "./seed.service";

@Module({
  imports: [SharedEngagementModule, CanvassingModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SharedSeedModule {}
