import { Module } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import { FeatureFlagsController } from "./feature-flags.controller";
import { PlansService } from "./plans.service";
import { PlansController } from "./plans.controller";

@Module({
  controllers: [FeatureFlagsController, PlansController],
  providers: [FeatureFlagsService, PlansService],
  exports: [FeatureFlagsService, PlansService],
})
export class FlagsModule {}
