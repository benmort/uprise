import { Controller, Get } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";

@Controller("system")
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get("feature-flags")
  getFeatureFlags() {
    return this.flags.getSystemFeatureFlags();
  }
}
