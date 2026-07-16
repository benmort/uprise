import { Module } from "@nestjs/common";
import { EventsModule } from "../common/events/events.module";
import { JourneysModule } from "../journeys/journeys.module";
import { EngagementService } from "./engagement.service";
import { CannedResponsesService } from "./canned-responses.service";
import { SurveysService } from "./surveys.service";
import { ScriptsService } from "./scripts.service";
import { ContentService } from "./content.service";
import { EngagementController } from "./engagement.controller";
import { AuthoringController } from "./authoring.controller";
import { ContentController } from "./content.controller";

@Module({
  imports: [EventsModule, JourneysModule],
  controllers: [EngagementController, AuthoringController, ContentController],
  providers: [EngagementService, CannedResponsesService, SurveysService, ScriptsService, ContentService],
  exports: [EngagementService, CannedResponsesService, ContentService],
})
export class SharedEngagementModule {}
