import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { derivedEventStatus } from "../events/events.service";

/** One plotted item on the generic calendar. `kind` drives the colour/click-through in the UI. */
export interface CalendarItem {
  kind: "entry" | "event" | "shift";
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  color: string | null;
  /** Kind-specific extras (event status, shift type, campaign/event links). */
  meta: Record<string, unknown>;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every schedulable thing in a window, as a flat CalendarItem[]: generic entries +
   * events + shifts. Overlap test — an item shows if it starts on/before `to` and ends
   * (or starts, if open-ended) on/after `from`. Absent bounds default to a wide window.
   */
  async listCalendar(tenantId: string, fromIso?: string, toIso?: string): Promise<CalendarItem[]> {
    const from = fromIso ? new Date(fromIso) : new Date("1970-01-01T00:00:00.000Z");
    const to = toIso ? new Date(toIso) : new Date("2999-12-31T00:00:00.000Z");

    const [entries, events, shifts] = await Promise.all([
      this.prisma.calendarEntry.findMany({
        where: {
          tenantId,
          startsAt: { lte: to },
          OR: [{ endsAt: null }, { endsAt: { gte: from } }],
        },
      }),
      this.prisma.event.findMany({
        where: { tenantId, startsAt: { lte: to }, endsAt: { gte: from } },
      }),
      this.prisma.shift.findMany({
        where: { tenantId, startsAt: { lte: to }, endsAt: { gte: from } },
      }),
    ]);

    const now = new Date();
    const items: CalendarItem[] = [];

    for (const e of entries) {
      items.push({
        kind: "entry",
        id: e.id,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt ? e.endsAt.toISOString() : null,
        allDay: e.allDay,
        color: e.color,
        meta: { description: e.description },
      });
    }
    for (const ev of events) {
      items.push({
        kind: "event",
        id: ev.id,
        title: ev.title,
        startsAt: ev.startsAt.toISOString(),
        endsAt: ev.endsAt.toISOString(),
        allDay: false,
        color: null,
        meta: {
          status: ev.status,
          derivedStatus: derivedEventStatus(ev, now),
          location: ev.location,
          campaignId: ev.campaignId,
        },
      });
    }
    for (const s of shifts) {
      items.push({
        kind: "shift",
        id: s.id,
        title: s.name,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        allDay: false,
        color: null,
        meta: {
          type: s.type,
          campaignId: s.campaignId,
          eventId: s.eventId,
          capacity: s.capacity,
        },
      });
    }
    return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  listEntries(tenantId: string) {
    return this.prisma.calendarEntry.findMany({ where: { tenantId }, orderBy: { startsAt: "asc" } });
  }

  createEntry(
    tenantId: string,
    input: { title: string; description?: string; color?: string; startsAt: string; endsAt?: string; allDay?: boolean },
    createdBy?: string,
  ) {
    return this.prisma.calendarEntry.create({
      data: {
        tenantId,
        title: input.title,
        description: input.description ?? null,
        color: input.color ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        allDay: input.allDay ?? false,
        createdBy: createdBy ?? null,
      },
    });
  }

  async updateEntry(
    tenantId: string,
    id: string,
    input: { title?: string; description?: string; color?: string; startsAt?: string; endsAt?: string; allDay?: boolean },
  ) {
    const existing = await this.prisma.calendarEntry.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("ENTRY_NOT_FOUND", "Calendar entry not found", HttpStatus.NOT_FOUND);
    const data: Prisma.CalendarEntryUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.color !== undefined) data.color = input.color;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.allDay !== undefined) data.allDay = input.allDay;
    return this.prisma.calendarEntry.update({ where: { id }, data });
  }

  async deleteEntry(tenantId: string, id: string) {
    const res = await this.prisma.calendarEntry.deleteMany({ where: { id, tenantId } });
    if (res.count === 0) throw new ApiHttpException("ENTRY_NOT_FOUND", "Calendar entry not found", HttpStatus.NOT_FOUND);
    return { deleted: true };
  }
}
