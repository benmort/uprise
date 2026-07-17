import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { EventsService } from "./events.service";
import { ManageRsvpDto, PublicRsvpDto } from "./dto/events.dto";

/**
 * Tokenless public RSVP surface, gated per-event by `Event.publicRsvpEnabled` +
 * PUBLISHED status (enforced in the service). Reachable pre-session — the
 * `/public-events/` prefix is a deliberate allowlist entry in BasicAuthGuard
 * (mirrors the public poll viewer). No `@RequirePermission`: it is public by design.
 * Self-manage routes are authorised by an unguessable per-RSVP `manageToken`.
 */
@Controller("public-events")
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  /** Public events board for one org (by slug): `/public-events?tenant=<slug>`. */
  @Get()
  async board(@Query("tenant") tenant?: string) {
    if (!tenant) throw new BadRequestException("tenant slug is required");
    return this.events.listPublicEvents(tenant);
  }

  @Get(":eventId")
  async preview(@Param("eventId") eventId: string) {
    return this.events.publicPreview(eventId);
  }

  @Post(":eventId/rsvp")
  async rsvp(@Param("eventId") eventId: string, @Body() dto: PublicRsvpDto) {
    return this.events.publicRsvp(eventId, dto);
  }

  // ── Attendee self-manage (authorised by the manage token) ──────────────────
  @Get("rsvp/:token")
  async manage(@Param("token") token: string) {
    return this.events.manageByToken(token);
  }

  @Patch("rsvp/:token")
  async updateManage(@Param("token") token: string, @Body() dto: ManageRsvpDto) {
    return this.events.updateRsvpByToken(token, dto.guests);
  }

  @Post("rsvp/:token/cancel")
  async cancelManage(@Param("token") token: string) {
    return this.events.cancelByToken(token);
  }
}
