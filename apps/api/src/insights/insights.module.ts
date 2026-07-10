import { Module } from "@nestjs/common";
import { InsightsIngestService } from "./insights-ingest.service";
import { InsightsService } from "./insights.service";
import { InsightsController } from "./insights.controller";
import { PublicInsightsController } from "./public-insights.controller";

/**
 * Insights / Polling domain — public-opinion polls attached to geo regions.
 * PrismaService + OutboxService are global. The ingest service is CLI-driven; the
 * read service + controller serve the /insights surfaces and the RegionPolling panel.
 * PublicInsightsController is the unauthenticated surface for the public `action` app.
 */
@Module({
  controllers: [InsightsController, PublicInsightsController],
  providers: [InsightsIngestService, InsightsService],
  exports: [InsightsIngestService, InsightsService],
})
export class InsightsModule {}
