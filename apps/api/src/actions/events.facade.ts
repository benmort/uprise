import { Injectable } from "@nestjs/common";
import { EventStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "../events/events.service";

/**
 * The one surface the actions domain uses to reach Events — the same port-token pattern as
 * AUTODIALER_FACADE, so actions depends on events one-way with no module cycle.
 *
 * Everything that makes an RSVP correct — capacity, waitlisting, dedupe by email, the outbox
 * event — stays in EventsService. An action page is a branded front door onto an event, so it
 * must not grow its own copy of any of that: `rsvp()` here is a pass-through to the same method
 * the public events page calls, and a page pointed at a full event waitlists exactly as that
 * page would.
 */
export const EVENTS_FACADE = "EventsFacade";

/** The event as the public widget may see it — no organiser detail. */
export type PublicActionEventView = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  spotsLeft: number | null;
  attendeeCount: number;
  imageUrl: string | null;
  derivedStatus: string;
};

export type ActionRsvpInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  guests?: number | null;
};

/** `manageToken` is nullable in the schema; a null one simply means no self-manage link. */
export type ActionRsvpResult = { id: string; status: string; manageToken: string | null };

/** What an action page needs to know about an event before it will publish. */
export type EventPublishability = {
  exists: boolean;
  /** PUBLISHED + publicRsvpEnabled — the same gate the public events page enforces. */
  publiclyRsvpable: boolean;
  /** Already over: a page collecting RSVPs for it would take names for nothing. */
  ended: boolean;
  cancelled: boolean;
};

export interface EventsFacade {
  /** Public projection, or null when the event is missing or not publicly RSVP-able. */
  getPublicEvent(eventId: string): Promise<PublicActionEventView | null>;
  /** Publish-time checks for the admin surface (distinguishes WHY, for the error message). */
  checkPublishable(tenantId: string, eventId: string): Promise<EventPublishability>;
  /** Create the RSVP. Throws the same errors the public events surface throws. */
  rsvp(eventId: string, input: ActionRsvpInput): Promise<ActionRsvpResult>;
}

@Injectable()
export class DefaultEventsFacade implements EventsFacade {
  constructor(
    private readonly events: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  async getPublicEvent(eventId: string): Promise<PublicActionEventView | null> {
    try {
      const view = await this.events.publicPreview(eventId);
      return {
        id: view.id,
        title: view.title,
        description: view.description,
        location: view.location,
        startsAt: view.startsAt.toISOString(),
        endsAt: view.endsAt ? view.endsAt.toISOString() : null,
        capacity: view.capacity,
        spotsLeft: view.spotsLeft,
        attendeeCount: view.attendeeCount,
        imageUrl: view.imageUrl,
        derivedStatus: String(view.derivedStatus),
      };
    } catch {
      // publicPreview throws EVENT_NOT_FOUND for missing / unpublished / RSVP-disabled alike.
      // For the public payload they are the same answer: there is nothing to show.
      return null;
    }
  }

  async checkPublishable(tenantId: string, eventId: string): Promise<EventPublishability> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { status: true, publicRsvpEnabled: true, endsAt: true, startsAt: true },
    });
    if (!event) return { exists: false, publiclyRsvpable: false, ended: false, cancelled: false };
    const finishesAt = event.endsAt ?? event.startsAt;
    return {
      exists: true,
      publiclyRsvpable: event.status === EventStatus.PUBLISHED && event.publicRsvpEnabled,
      ended: finishesAt.getTime() < Date.now(),
      cancelled: event.status === EventStatus.CANCELLED,
    };
  }

  async rsvp(eventId: string, input: ActionRsvpInput): Promise<ActionRsvpResult> {
    const rsvp = await this.events.publicRsvp(eventId, {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      guests: input.guests ?? null,
    });
    return { id: rsvp.id, status: String(rsvp.status), manageToken: rsvp.manageToken ?? null };
  }
}
