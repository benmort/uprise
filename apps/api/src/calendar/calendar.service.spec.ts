import { EventStatus, ShiftType } from "@uprise/db";
import { CalendarService } from "./calendar.service";

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    calendarEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "ce1", ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

describe("CalendarService", () => {
  let prisma: any;
  let service: CalendarService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CalendarService(prisma);
  });

  describe("listCalendar", () => {
    it("merges entries, events and shifts into tagged, time-sorted items", async () => {
      prisma.calendarEntry.findMany.mockResolvedValue([
        { id: "ce1", title: "Reminder", startsAt: new Date("2030-01-03"), endsAt: null, allDay: true, color: "warning", description: "d" },
      ]);
      prisma.event.findMany.mockResolvedValue([
        { id: "e1", title: "Rally", status: EventStatus.PUBLISHED, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02"), location: "Sq", campaignId: null },
      ]);
      prisma.shift.findMany.mockResolvedValue([
        { id: "s1", name: "AM booth", type: ShiftType.POLLING_BOOTH, startsAt: new Date("2030-01-02"), endsAt: new Date("2030-01-02"), campaignId: null, eventId: null, capacity: 4 },
      ]);
      const items = await service.listCalendar("org1", "2030-01-01", "2030-01-31");
      expect(items.map((i) => i.kind)).toEqual(["event", "shift", "entry"]);
      expect(items[0]).toMatchObject({ id: "e1", meta: expect.objectContaining({ derivedStatus: "upcoming" }) });
      expect(items[1].meta).toMatchObject({ type: ShiftType.POLLING_BOOTH });
    });

    it("defaults to a wide window when no bounds are given", async () => {
      await service.listCalendar("org1");
      const evWhere = prisma.event.findMany.mock.calls[0][0].where;
      expect(evWhere.startsAt.lte).toBeInstanceOf(Date);
      expect(evWhere.endsAt.gte).toBeInstanceOf(Date);
    });
  });

  describe("entry CRUD", () => {
    it("creates an entry with createdBy", async () => {
      await service.createEntry("org1", { title: "T", startsAt: "2030-01-01" }, "u1");
      expect(prisma.calendarEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: "org1", createdBy: "u1" }) }),
      );
    });
    it("404s updating an entry that isn't the tenant's", async () => {
      prisma.calendarEntry.findFirst.mockResolvedValue(null);
      await expect(service.updateEntry("org1", "x", { title: "z" })).rejects.toMatchObject({
        response: { error: { code: "ENTRY_NOT_FOUND" } },
      });
    });
    it("updates an existing entry", async () => {
      prisma.calendarEntry.findFirst.mockResolvedValue({ id: "ce1" });
      const res = await service.updateEntry("org1", "ce1", { title: "New", endsAt: "2030-01-02", allDay: true });
      expect(res).toMatchObject({ id: "ce1", title: "New" });
    });
    it("deletes only the tenant's entry", async () => {
      expect(await service.deleteEntry("org1", "ce1")).toEqual({ deleted: true });
      prisma.calendarEntry.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteEntry("org1", "gone")).rejects.toMatchObject({
        response: { error: { code: "ENTRY_NOT_FOUND" } },
      });
    });
  });
});
