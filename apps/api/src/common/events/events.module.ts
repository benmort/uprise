import { Module } from "@nestjs/common";
import { RealtimeEventsService } from "./realtime-events.service";

@Module({
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class EventsModule {}
