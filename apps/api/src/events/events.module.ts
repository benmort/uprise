import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { PublicEventsController } from "./public-events.controller";

/**
 * The user-facing Events domain (public happenings + RSVPs). Named
 * EventsDomainModule to avoid a symbol clash with the infra outbox/realtime
 * `EventsModule` (src/common/events). PrismaService + the @Global OutboxService
 * are resolved from their global modules.
 */
@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsDomainModule {}
