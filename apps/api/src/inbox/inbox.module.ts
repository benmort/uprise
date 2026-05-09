import { Module } from "@nestjs/common";
import { EventsModule } from "../common/events/events.module";
import { FlagsModule } from "../common/flags/flags.module";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import { InboxRepository } from "./inbox.repository";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Module({
  imports: [EventsModule, FlagsModule],
  controllers: [InboxController],
  providers: [InboxService, InboxRepository, AiSuggestionsService],
  exports: [InboxService],
})
export class InboxModule {}
