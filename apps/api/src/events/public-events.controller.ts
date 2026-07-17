import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { EventsService } from "./events.service";
import { PublicRsvpDto } from "./dto/events.dto";

/**
 * Tokenless public RSVP surface, gated per-event by `Event.publicRsvpEnabled` +
 * PUBLISHED status (enforced in the service). Reachable pre-session — the
 * `/public-events/` prefix is a deliberate allowlist entry in BasicAuthGuard
 * (mirrors the public poll viewer). No `@RequirePermission`: it is public by design.
 */
@Controller("public-events")
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get(":eventId")
  async preview(@Param("eventId") eventId: string) {
    return this.events.publicPreview(eventId);
  }

  @Post(":eventId/rsvp")
  async rsvp(@Param("eventId") eventId: string, @Body() dto: PublicRsvpDto) {
    return this.events.publicRsvp(eventId, dto);
  }
}
