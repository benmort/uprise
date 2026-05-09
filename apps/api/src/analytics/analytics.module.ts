import { Module } from "@nestjs/common";
import { EventsModule } from "../common/events/events.module";
import { FlagsModule } from "../common/flags/flags.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [EventsModule, FlagsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
