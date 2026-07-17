import { HttpStatus, Injectable } from "@nestjs/common";
import { EventStatus, Prisma, RsvpStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { ApiHttpException } from "../common/http/api-response";

/** The time-derived label the events table shows (raw status wins when DRAFT/CANCELLED). */
export type DerivedEventStatus = "draft" | "upcoming" | "ongoing" | "completed" | "cancelled";

export function derivedEventStatus(
  e: { status: EventStatus; startsAt: Date; endsAt: Date },
  now: Date,
): DerivedEventStatus {
  if (e.status === EventStatus.CANCELLED) return "cancelled";
  if (e.status === EventStatus.DRAFT) return "draft";
  if (now < e.startsAt) return "upcoming";
  if (now > e.endsAt) return "completed";
  return "ongoing";
}

const ATTENDING: RsvpStatus[] = [RsvpStatus.GOING, RsvpStatus.ATTENDED];

export interface ListEventsFilter {
  /** Tab filter over the derived status; "all" (default) returns everything. */
  status?: DerivedEventStatus | "all";
  search?: string;
}

interface RsvpInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  contactId?: string | null;
  volunteerId?: string | null;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Live attendee counts (GOING + ATTENDED) for a set of events, keyed by eventId. */
  private async attendeeCounts(tenantId: string, eventIds: string[]): Promise<Map<string, number>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.prisma.eventRsvp.groupBy({
      by: ["eventId"],
      where: { tenantId, eventId: { in: eventIds }, status: { in: ATTENDING } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.eventId, r._count._all]));
  }

  async listEvents(tenantId: string, filter: ListEventsFilter = {}) {
    const search = filter.search?.trim();
    const events = await this.prisma.event.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { location: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { startsAt: "desc" },
    });
    const counts = await this.attendeeCounts(tenantId, events.map((e) => e.id));
    const now = new Date();
    const mapped = events.map((e) => ({
      ...e,
      attendeeCount: counts.get(e.id) ?? 0,
      derivedStatus: derivedEventStatus(e, now),
    }));
    if (filter.status && filter.status !== "all") {
      return mapped.filter((e) => e.derivedStatus === filter.status);
    }
    return mapped;
  }

  async getEvent(tenantId: string, id: string) {
    const event = await this.prisma.event.findFirst({ where: { id, tenantId } });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    const [rsvps, shifts, attending] = await Promise.all([
      this.prisma.eventRsvp.findMany({ where: { tenantId, eventId: id }, orderBy: { createdAt: "desc" } }),
      // Volunteer shifts that staff this event (id-only cross-schema link).
      this.prisma.shift.findMany({ where: { tenantId, eventId: id }, orderBy: { startsAt: "asc" } }),
      this.attendeeCounts(tenantId, [id]),
    ]);
    return {
      ...event,
      attendeeCount: attending.get(id) ?? 0,
      derivedStatus: derivedEventStatus(event, new Date()),
      rsvps,
      shifts,
    };
  }

  async createEvent(
    tenantId: string,
    input: {
      title: string;
      description?: string;
      category?: string;
      status?: EventStatus;
      location?: string;
      pollingPlaceId?: string;
      lat?: number;
      lng?: number;
      startsAt: string;
      endsAt: string;
      capacity?: number;
      imageUrl?: string;
      campaignId?: string;
      publicRsvpEnabled?: boolean;
    },
  ) {
    const status = (input.status as EventStatus | undefined) ?? EventStatus.DRAFT;
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          tenantId,
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? null,
          status,
          location: input.location ?? null,
          pollingPlaceId: input.pollingPlaceId ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          capacity: input.capacity ?? null,
          imageUrl: input.imageUrl ?? null,
          campaignId: input.campaignId ?? null,
          publicRsvpEnabled: input.publicRsvpEnabled ?? false,
        },
      });
      if (status === EventStatus.PUBLISHED) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "events.event.published",
          aggregateId: event.id,
          payload: { eventId: event.id, tenantId, campaignId: event.campaignId },
        });
      }
      return event;
    });
  }

  async updateEvent(
    tenantId: string,
    id: string,
    input: {
      title?: string;
      description?: string;
      category?: string;
      status?: EventStatus;
      location?: string;
      pollingPlaceId?: string;
      lat?: number;
      lng?: number;
      startsAt?: string;
      endsAt?: string;
      capacity?: number;
      imageUrl?: string;
      campaignId?: string;
      publicRsvpEnabled?: boolean;
    },
  ) {
    const existing = await this.prisma.event.findFirst({ where: { id, tenantId } });
    if (!existing) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    const data: Prisma.EventUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.status !== undefined) data.status = input.status as EventStatus;
    if (input.location !== undefined) data.location = input.location;
    if (input.pollingPlaceId !== undefined) data.pollingPlaceId = input.pollingPlaceId;
    if (input.lat !== undefined) data.lat = input.lat;
    if (input.lng !== undefined) data.lng = input.lng;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
    if (input.capacity !== undefined) data.capacity = input.capacity;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.campaignId !== undefined) data.campaignId = input.campaignId;
    if (input.publicRsvpEnabled !== undefined) data.publicRsvpEnabled = input.publicRsvpEnabled;

    // A DRAFT→PUBLISHED or *→CANCELLED transition emits the matching domain event atomically.
    const publishing = input.status === EventStatus.PUBLISHED && existing.status !== EventStatus.PUBLISHED;
    const cancelling = input.status === EventStatus.CANCELLED && existing.status !== EventStatus.CANCELLED;
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.update({ where: { id }, data });
      if (publishing) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "events.event.published",
          aggregateId: id,
          payload: { eventId: id, tenantId, campaignId: event.campaignId },
        });
      }
      if (cancelling) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "events.event.cancelled",
          aggregateId: id,
          payload: { eventId: id, tenantId },
        });
      }
      return event;
    });
  }

  async cancelEvent(tenantId: string, id: string) {
    return this.updateEvent(tenantId, id, { status: EventStatus.CANCELLED });
  }

  listRsvps(tenantId: string, eventId: string) {
    return this.prisma.eventRsvp.findMany({
      where: { tenantId, eventId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Record an RSVP against an already-loaded event. WAITLISTs once the event is full;
   *  a repeat RSVP for the same email re-activates the existing row (no duplicate). */
  private async rsvpToEvent(
    event: { id: string; tenantId: string; capacity: number | null },
    input: RsvpInput,
  ) {
    const going = await this.prisma.eventRsvp.count({
      where: { tenantId: event.tenantId, eventId: event.id, status: { in: ATTENDING } },
    });
    const status = event.capacity != null && going >= event.capacity ? RsvpStatus.WAITLIST : RsvpStatus.GOING;
    const email = input.email?.trim() ? input.email.trim() : null;
    try {
      const rsvp = await this.prisma.$transaction(async (tx) => {
        const row = await tx.eventRsvp.create({
          data: {
            tenantId: event.tenantId,
            eventId: event.id,
            name: input.name,
            email,
            phone: input.phone ?? null,
            contactId: input.contactId ?? null,
            volunteerId: input.volunteerId ?? null,
            status,
          },
        });
        await this.outbox.append(tx, {
          tenantId: event.tenantId,
          eventType: "events.rsvp.created",
          aggregateId: event.id,
          payload: { rsvpId: row.id, eventId: event.id, tenantId: event.tenantId },
        });
        return row;
      });
      return rsvp;
    } catch (error) {
      // Same email re-RSVPing: reactivate the existing row rather than 500 on the unique index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && email) {
        const existing = await this.prisma.eventRsvp.findFirst({
          where: { tenantId: event.tenantId, eventId: event.id, email: { equals: email, mode: "insensitive" } },
        });
        if (existing) {
          return this.prisma.eventRsvp.update({
            where: { id: existing.id },
            data: { status, name: input.name, phone: input.phone ?? existing.phone },
          });
        }
      }
      throw error;
    }
  }

  /** Organiser records an RSVP for a tenant's event. */
  async rsvp(tenantId: string, eventId: string, input: RsvpInput) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, tenantId: true, capacity: true },
    });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    return this.rsvpToEvent(event, input);
  }

  async cancelRsvp(tenantId: string, eventId: string, rsvpId: string) {
    const rsvp = await this.prisma.eventRsvp.findFirst({
      where: { id: rsvpId, tenantId, eventId },
      select: { id: true },
    });
    if (!rsvp) throw new ApiHttpException("RSVP_NOT_FOUND", "RSVP not found", HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventRsvp.update({ where: { id: rsvpId }, data: { status: RsvpStatus.CANCELLED } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "events.rsvp.cancelled",
        aggregateId: eventId,
        payload: { rsvpId, eventId, tenantId },
      });
    });
    return { id: rsvpId, status: RsvpStatus.CANCELLED };
  }

  // ── Public (tokenless) surface — gated by Event.publicRsvpEnabled ────────────
  private async loadPublicEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, publicRsvpEnabled: true, status: EventStatus.PUBLISHED },
    });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    return event;
  }

  /** Safe public view of an open event — no tenant/organiser detail leaked. */
  async publicPreview(eventId: string) {
    const event = await this.loadPublicEvent(eventId);
    const going = await this.prisma.eventRsvp.count({
      where: { tenantId: event.tenantId, eventId, status: { in: ATTENDING } },
    });
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      capacity: event.capacity,
      imageUrl: event.imageUrl,
      attendeeCount: going,
      spotsLeft: event.capacity != null ? Math.max(0, event.capacity - going) : null,
    };
  }

  async publicRsvp(eventId: string, input: RsvpInput) {
    const event = await this.loadPublicEvent(eventId);
    const rsvp = await this.rsvpToEvent(
      { id: event.id, tenantId: event.tenantId, capacity: event.capacity },
      input,
    );
    return { id: rsvp.id, status: rsvp.status };
  }
}
