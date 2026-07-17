import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { EventStatus, Prisma, RsvpStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { ApiHttpException } from "../common/http/api-response";
import { ImageUploadService } from "../common/storage/image-upload.service";
import { BRAND_SELECT, brandFields } from "../common/brand";
import { TRANSACTIONAL_DISPATCHER, type TransactionalDispatcher } from "../messaging/transactional-dispatcher";

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

/** A row shape carrying the public-safe columns (from Event). */
type EventRow = {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  capacity: number | null;
  imageUrl: string | null;
};

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
  guests?: number | null;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly images: ImageUploadService,
    private readonly config: ConfigService,
    @Inject(TRANSACTIONAL_DISPATCHER) private readonly dispatcher: TransactionalDispatcher,
  ) {}

  private newManageToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Attendee HEADCOUNT (rows + their guests) for GOING/ATTENDED, keyed by eventId. */
  private async attendeeCounts(tenantId: string, eventIds: string[]): Promise<Map<string, number>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.prisma.eventRsvp.groupBy({
      by: ["eventId"],
      where: { tenantId, eventId: { in: eventIds }, status: { in: ATTENDING } },
      _count: { _all: true },
      _sum: { guests: true },
    });
    return new Map(rows.map((r) => [r.eventId, (r._count?._all ?? 0) + (r._sum?.guests ?? 0)]));
  }

  /** Live headcount (rows + guests) for one event's GOING/ATTENDED RSVPs. */
  private async attendingHeads(tenantId: string, eventId: string): Promise<number> {
    const agg = await this.prisma.eventRsvp.aggregate({
      where: { tenantId, eventId, status: { in: ATTENDING } },
      _count: { _all: true },
      _sum: { guests: true },
    });
    return (agg._count?._all ?? 0) + (agg._sum?.guests ?? 0);
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

  async uploadCover(
    tenantId: string,
    id: string,
    file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    const event = await this.prisma.event.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    if (!file?.buffer) throw new ApiHttpException("NO_FILE", "No file uploaded", HttpStatus.BAD_REQUEST);
    if (!this.images.enabled) {
      throw new ApiHttpException("STORAGE_DISABLED", "Image storage is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const ext = this.images.extFrom(file.originalname ?? "cover.jpg", "jpg");
    const out = await this.images.put(file.buffer, {
      key: this.images.randomKey("event-covers", ext),
      contentType: file.mimetype,
    });
    await this.prisma.event.update({ where: { id }, data: { imageUrl: out.url } });
    return { imageUrl: out.url };
  }

  listRsvps(tenantId: string, eventId: string) {
    return this.prisma.eventRsvp.findMany({
      where: { tenantId, eventId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Record an RSVP against an already-loaded event. A whole party (registrant + guests) is
   *  admitted together: it lands GOING when it fits the remaining capacity, else WAITLIST. A
   *  repeat RSVP for the same email re-activates the existing row (keeps its manage token). */
  private async rsvpToEvent(event: { id: string; tenantId: string; capacity: number | null }, input: RsvpInput) {
    const guests = Math.max(0, input.guests ?? 0);
    const heads = await this.attendingHeads(event.tenantId, event.id);
    const party = 1 + guests;
    const status = event.capacity != null && heads + party > event.capacity ? RsvpStatus.WAITLIST : RsvpStatus.GOING;
    const email = input.email?.trim() ? input.email.trim() : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.eventRsvp.create({
          data: {
            tenantId: event.tenantId,
            eventId: event.id,
            name: input.name,
            email,
            phone: input.phone ?? null,
            contactId: input.contactId ?? null,
            volunteerId: input.volunteerId ?? null,
            guests,
            status,
            manageToken: this.newManageToken(),
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
    } catch (error) {
      // Same email re-RSVPing: reactivate the existing row rather than 500 on the unique index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && email) {
        const existing = await this.prisma.eventRsvp.findFirst({
          where: { tenantId: event.tenantId, eventId: event.id, email: { equals: email, mode: "insensitive" } },
        });
        if (existing) {
          return this.prisma.eventRsvp.update({
            where: { id: existing.id },
            data: {
              status,
              name: input.name,
              phone: input.phone ?? existing.phone,
              guests,
              manageToken: existing.manageToken ?? this.newManageToken(),
            },
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
    await this.promoteWaitlist(tenantId, eventId);
    return { id: rsvpId, status: RsvpStatus.CANCELLED };
  }

  /** After a cancellation frees seats, promote the oldest WAITLIST parties that now fit (FIFO —
   *  stop at the first party that doesn't fit). Each promotion emits events.rsvp.promoted. */
  private async promoteWaitlist(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { capacity: true } });
    if (!event) return;
    const waitlist = await this.prisma.eventRsvp.findMany({
      where: { tenantId, eventId, status: RsvpStatus.WAITLIST },
      orderBy: { createdAt: "asc" },
    });
    if (waitlist.length === 0) return;
    let heads = await this.attendingHeads(tenantId, eventId);
    for (const r of waitlist) {
      const party = 1 + r.guests;
      if (event.capacity != null && heads + party > event.capacity) break; // FIFO fairness
      await this.prisma.$transaction(async (tx) => {
        await tx.eventRsvp.update({ where: { id: r.id }, data: { status: RsvpStatus.GOING } });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "events.rsvp.promoted",
          aggregateId: eventId,
          payload: { rsvpId: r.id, eventId, tenantId },
        });
      });
      heads += party;
    }
  }

  /** Organiser marks a registrant present at the door → ATTENDED + checkedInAt. */
  async checkIn(tenantId: string, eventId: string, rsvpId: string) {
    const rsvp = await this.prisma.eventRsvp.findFirst({
      where: { id: rsvpId, tenantId, eventId },
      select: { id: true },
    });
    if (!rsvp) throw new ApiHttpException("RSVP_NOT_FOUND", "RSVP not found", HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventRsvp.update({
        where: { id: rsvpId },
        data: { status: RsvpStatus.ATTENDED, checkedInAt: new Date() },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "events.rsvp.attended",
        aggregateId: eventId,
        payload: { rsvpId, eventId, tenantId },
      });
    });
    return { id: rsvpId, status: RsvpStatus.ATTENDED };
  }

  /** RSVP list as CSV (organiser export). */
  async exportRsvpsCsv(tenantId: string, eventId: string): Promise<string> {
    const rows = await this.prisma.eventRsvp.findMany({
      where: { tenantId, eventId },
      orderBy: { createdAt: "asc" },
    });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Email", "Phone", "Status", "Guests", "Checked in"].join(",");
    const lines = rows.map((r) =>
      [r.name, r.email, r.phone, r.status, r.guests, r.checkedInAt ? r.checkedInAt.toISOString() : ""]
        .map(esc)
        .join(","),
    );
    return [header, ...lines].join("\n");
  }

  // ── Reminders (cron-swept; T-24h) ────────────────────────────────────────────
  private manageUrl(token: string | null): string {
    if (!token) return "";
    const base =
      this.config.get<string>("ACTION_APP_URL") ||
      this.config.get<string>("NEXT_PUBLIC_ACTION_APP_URL") ||
      "";
    return `${base}/events/rsvp/${encodeURIComponent(token)}`;
  }

  /** Send a one-off reminder to every un-reminded attendee of events starting in ~24h. Email when
   *  the RSVP has one, else SMS. Idempotent via reminderSentAt (a failed send is retried next sweep). */
  async dispatchDueReminders(limit = 500) {
    const now = new Date();
    const from = new Date(now.getTime() + 23 * 3600_000);
    const to = new Date(now.getTime() + 24 * 3600_000);
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, startsAt: { gte: from, lte: to } },
      select: { id: true, tenantId: true, title: true, startsAt: true, location: true },
    });
    let sent = 0;
    for (const ev of events) {
      const rsvps = await this.prisma.eventRsvp.findMany({
        where: { eventId: ev.id, status: { in: ATTENDING }, reminderSentAt: null },
        take: limit,
      });
      const whenText = ev.startsAt.toLocaleString("en-AU");
      for (const r of rsvps) {
        try {
          if (r.email) {
            await this.dispatcher.sendEmail({
              tenantId: ev.tenantId,
              toAddress: r.email,
              templateKey: "event_reminder",
              vars: {
                name: r.name,
                eventTitle: ev.title,
                whenText,
                whereSuffix: ev.location ? ` at ${ev.location}` : "",
                manageUrl: this.manageUrl(r.manageToken),
              },
              purpose: "event_reminder",
            });
          } else if (r.phone) {
            await this.dispatcher.sendSms({
              tenantId: ev.tenantId,
              toPhone: r.phone,
              body: `Reminder: ${ev.title} is on ${whenText}. Manage your RSVP: ${this.manageUrl(r.manageToken)}`,
              purpose: "event_reminder",
            });
          } else {
            continue;
          }
          await this.prisma.eventRsvp.update({ where: { id: r.id }, data: { reminderSentAt: new Date() } });
          sent++;
        } catch {
          // leave reminderSentAt null so the next sweep retries this recipient
        }
      }
    }
    return { events: events.length, sent };
  }

  // ── Public (tokenless) surface — gated by Event.publicRsvpEnabled ────────────
  private async loadPublicEvent(eventId: string): Promise<EventRow> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, publicRsvpEnabled: true, status: EventStatus.PUBLISHED },
    });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    return event;
  }

  /** The tenant's public brand block (mirrors the public poll's `tenant`), for branded pages. */
  private async tenantBrand(tenantId: string) {
    const [t, profile] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } }),
      this.prisma.orgProfile.findFirst({ where: { tenantId }, select: BRAND_SELECT }),
    ]);
    if (!t) return null;
    return { id: t.id, name: t.name, slug: t.slug, ...brandFields(profile) };
  }

  /** Leak-safe public projection of an event (no organiser detail) — the shape public pages render. */
  private async buildPublicView(event: EventRow) {
    const heads = await this.attendingHeads(event.tenantId, event.id);
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      lat: event.lat,
      lng: event.lng,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      capacity: event.capacity,
      imageUrl: event.imageUrl,
      attendeeCount: heads,
      spotsLeft: event.capacity != null ? Math.max(0, event.capacity - heads) : null,
      derivedStatus: derivedEventStatus(event, new Date()),
    };
  }

  /** Public single-event view — includes the tenant brand for branded rendering. */
  async publicPreview(eventId: string) {
    const event = await this.loadPublicEvent(eventId);
    return { ...(await this.buildPublicView(event)), tenant: await this.tenantBrand(event.tenantId) };
  }

  /** Public events board for one tenant (by slug): its published, public, not-yet-ended events. */
  async listPublicEvents(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) throw new ApiHttpException("TENANT_NOT_FOUND", "Organisation not found", HttpStatus.NOT_FOUND);
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        publicRsvpEnabled: true,
        status: EventStatus.PUBLISHED,
        endsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
    });
    const items = await Promise.all(events.map((e) => this.buildPublicView(e)));
    return { tenant: await this.tenantBrand(tenant.id), events: items };
  }

  async publicRsvp(eventId: string, input: RsvpInput) {
    const event = await this.loadPublicEvent(eventId);
    const rsvp = await this.rsvpToEvent(
      { id: event.id, tenantId: event.tenantId, capacity: event.capacity },
      input,
    );
    return { id: rsvp.id, status: rsvp.status, manageToken: rsvp.manageToken };
  }

  // ── Attendee self-manage (long-lived, non-consuming manage token) ────────────
  private async rsvpByToken(token: string) {
    const rsvp = await this.prisma.eventRsvp.findUnique({ where: { manageToken: token } });
    if (!rsvp) throw new ApiHttpException("RSVP_NOT_FOUND", "RSVP not found", HttpStatus.NOT_FOUND);
    return rsvp;
  }

  async manageByToken(token: string) {
    const rsvp = await this.rsvpByToken(token);
    const event = await this.prisma.event.findUnique({ where: { id: rsvp.eventId } });
    if (!event) throw new ApiHttpException("EVENT_NOT_FOUND", "Event not found", HttpStatus.NOT_FOUND);
    return {
      event: { ...(await this.buildPublicView(event)), tenant: await this.tenantBrand(event.tenantId) },
      rsvp: {
        id: rsvp.id,
        name: rsvp.name,
        email: rsvp.email,
        phone: rsvp.phone,
        guests: rsvp.guests,
        status: rsvp.status,
      },
    };
  }

  async updateRsvpByToken(token: string, guests: number) {
    const rsvp = await this.rsvpByToken(token);
    await this.prisma.eventRsvp.update({ where: { id: rsvp.id }, data: { guests: Math.max(0, guests) } });
    return { id: rsvp.id, guests: Math.max(0, guests) };
  }

  async cancelByToken(token: string) {
    const rsvp = await this.rsvpByToken(token);
    if (rsvp.status !== RsvpStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventRsvp.update({ where: { id: rsvp.id }, data: { status: RsvpStatus.CANCELLED } });
        await this.outbox.append(tx, {
          tenantId: rsvp.tenantId,
          eventType: "events.rsvp.cancelled",
          aggregateId: rsvp.eventId,
          payload: { rsvpId: rsvp.id, eventId: rsvp.eventId, tenantId: rsvp.tenantId },
        });
      });
      await this.promoteWaitlist(rsvp.tenantId, rsvp.eventId);
    }
    return { id: rsvp.id, status: RsvpStatus.CANCELLED };
  }
}
