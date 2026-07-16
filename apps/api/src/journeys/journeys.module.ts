import { Module } from "@nestjs/common";
import { EventsModule } from "../common/events/events.module";
import { FlagsModule } from "../common/flags/flags.module";
import { QueueModule } from "../common/queue/queue.module";
import { TwilioModule } from "../twilio/twilio.module";
import { TagsModule } from "../tags/tags.module";
import { JourneysController } from "./journeys.controller";
import { JourneysService } from "./journeys.service";
import { SingleSendService } from "./single-send.service";
import { JOURNEY_TRIGGER_PORT } from "./journey-trigger.port";

@Module({
  imports: [EventsModule, FlagsModule, QueueModule, TwilioModule, TagsModule],
  controllers: [JourneysController],
  providers: [
    JourneysService,
    SingleSendService,
    // Expose the same instance under the port token so engagement/inbox depend
    // on journeys one-way, with no module cycle.
    { provide: JOURNEY_TRIGGER_PORT, useExisting: JourneysService },
  ],
  exports: [JourneysService, JOURNEY_TRIGGER_PORT],
})
export class JourneysModule {}
