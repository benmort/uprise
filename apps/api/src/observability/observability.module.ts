import { Module } from "@nestjs/common";
import { QueueModule } from "../common/queue/queue.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";
import { QueueInspectorService } from "./queue-inspector.service";
import { RailwayClient } from "./railway.client";
import { VercelLogsClient } from "./vercel-logs.client";

/**
 * Provider log clients + queue introspection.
 *
 * Exports the two provider clients as well as the service, so `PlatformStatusModule` can consume
 * `RailwayClient` rather than keeping its own copy of the Project-Access-Token rule. The dependency
 * runs one way only — nothing here imports platform-status — so there is no cycle for the boot
 * smoke to trip over.
 */
@Module({
  imports: [QueueModule],
  controllers: [ObservabilityController],
  providers: [RailwayClient, VercelLogsClient, QueueInspectorService, ObservabilityService],
  exports: [RailwayClient, VercelLogsClient, QueueInspectorService, ObservabilityService],
})
export class ObservabilityModule {}
