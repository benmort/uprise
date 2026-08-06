import { Module } from "@nestjs/common";
import { ObservabilityModule } from "../observability/observability.module";
import { PlatformStatusController } from "./platform-status.controller";
import { PlatformStatusService } from "./platform-status.service";

@Module({
  // For RailwayClient — the shared GraphQL transport this service's worker-deploy lookup uses.
  imports: [ObservabilityModule],
  controllers: [PlatformStatusController],
  providers: [PlatformStatusService],
})
export class PlatformStatusModule {}
