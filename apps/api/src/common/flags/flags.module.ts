import { Module } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import { FeatureFlagsController } from "./feature-flags.controller";
import { PlansService } from "./plans.service";
import { PlansController } from "./plans.controller";
import { PlanLimitsService } from "./plan-limits.service";

@Module({
  controllers: [FeatureFlagsController, PlansController],
  providers: [FeatureFlagsService, PlansService, PlanLimitsService],
  exports: [FeatureFlagsService, PlansService, PlanLimitsService],
})
export class FlagsModule {}
