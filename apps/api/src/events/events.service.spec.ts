import { EventStatus, RsvpStatus } from "@uprise/db";
import { EventsService, derivedEventStatus } from "./events.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "e1", campaignId: null, ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, campaignId: null, ...data })),
    },
    eventRsvp: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: "r1", ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    shift: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
  base.$transaction = jest.fn(async (fn: any) => fn(base));
  return base;
}

describe("derivedEventStatus", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const base = { startsAt: new Date("2026-06-20T00:00:00Z"), endsAt: new Date("2026-06-21T00:00:00Z") };
  it("maps raw DRAFT/CANCELLED before time", () => {
    expect(derivedEventStatus({ ...base, status: EventStatus.DRAFT }, now)).toBe("draft");
    expect(derivedEventStatus({ ...base, status: EventStatus.CANCELLED }, now)).toBe("cancelled");
  });
  it("derives upcoming / ongoing / completed for PUBLISHED", () => {
    expect(derivedEventStatus({ ...base, status: EventStatus.PUBLISHED }, now)).toBe("upcoming");
    const during = new Date("2026-06-20T12:00:00Z");
    expect(derivedEventStatus({ ...base, status: EventStatus.PUBLISHED }, during)).toBe("ongoing");
    const after = new Date("2026-06-22T00:00:00Z");
    expect(derivedEventStatus({ ...base, status: EventStatus.PUBLISHED }, after)).toBe("completed");
  });
});

describe("EventsService", () => {
  let prisma: any;
  let outbox: any;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = { append: jest.fn() };
    service = new EventsService(prisma, outbox);
  });

  describe("listEvents", () => {
    it("attaches attendee counts and derived status, filtered by tab", async () => {
      prisma.event.findMany.mockResolvedValue([
        { id: "e1", status: EventStatus.PUBLISHED, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") },
        { id: "e2", status: EventStatus.DRAFT, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") },
      ]);
      prisma.eventRsvp.groupBy.mockResolvedValue([{ eventId: "e1", _count: { _all: 5 } }]);
      const upcoming = await service.listEvents("org1", { status: "upcoming" });
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0]).toMatchObject({ id: "e1", attendeeCount: 5, derivedStatus: "upcoming" });
    });

    it("passes a case-insensitive search into the where clause", async () => {
      await service.listEvents("org1", { search: "rally" });
      const where = prisma.event.findMany.mock.calls[0][0].where;
      expect(where.OR[0]).toEqual({ title: { contains: "rally", mode: "insensitive" } });
    });
  });

  describe("getEvent", () => {
    it("404s an unknown event", async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getEvent("org1", "x")).rejects.toMatchObject({
        response: { error: { code: "EVENT_NOT_FOUND" } },
      });
    });
    it("returns rsvps + staffing shifts + attendee count", async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: "e1", status: EventStatus.PUBLISHED, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02"),
      });
      prisma.eventRsvp.findMany.mockResolvedValue([{ id: "r1" }]);
      prisma.shift.findMany.mockResolvedValue([{ id: "s1", eventId: "e1" }]);
      prisma.eventRsvp.groupBy.mockResolvedValue([{ eventId: "e1", _count: { _all: 3 } }]);
      const res = await service.getEvent("org1", "e1");
      expect(res.attendeeCount).toBe(3);
      expect(res.rsvps).toHaveLength(1);
      expect(res.shifts).toHaveLength(1);
    });
  });

  describe("createEvent", () => {
    it("defaults to DRAFT and emits no event", async () => {
      await service.createEvent("org1", { title: "Launch", startsAt: "2030-01-01", endsAt: "2030-01-02" });
      expect(prisma.event.create).toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });
    it("emits events.event.published when created PUBLISHED", async () => {
      await service.createEvent("org1", {
        title: "Rally", status: EventStatus.PUBLISHED, startsAt: "2030-01-01", endsAt: "2030-01-02",
      });
      expect(outbox.append).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ eventType: "events.event.published" }),
      );
    });
  });

  describe("updateEvent", () => {
    it("emits published only on the DRAFT→PUBLISHED transition", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", status: EventStatus.DRAFT });
      await service.updateEvent("org1", "e1", { status: EventStatus.PUBLISHED });
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.event.published" }));
    });
    it("emits cancelled on the transition to CANCELLED", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", status: EventStatus.PUBLISHED });
      await service.cancelEvent("org1", "e1");
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.event.cancelled" }));
    });
    it("404s an unknown event", async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.updateEvent("org1", "x", { title: "z" })).rejects.toMatchObject({
        response: { error: { code: "EVENT_NOT_FOUND" } },
      });
    });
  });

  describe("rsvp", () => {
    it("records GOING and emits rsvp.created", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: null });
      const res = await service.rsvp("org1", "e1", { name: "Sam", email: "sam@x.org" });
      expect(res.status).toBe(RsvpStatus.GOING);
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.created" }));
    });
    it("WAITLISTs once capacity is reached", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: 2 });
      prisma.eventRsvp.count.mockResolvedValue(2);
      const res = await service.rsvp("org1", "e1", { name: "Late" });
      expect(res.status).toBe(RsvpStatus.WAITLIST);
    });
    it("404s an unknown event", async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.rsvp("org1", "x", { name: "n" })).rejects.toMatchObject({
        response: { error: { code: "EVENT_NOT_FOUND" } },
      });
    });
  });

  describe("cancelRsvp", () => {
    it("marks the rsvp CANCELLED and emits", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue({ id: "r1" });
      const res = await service.cancelRsvp("org1", "e1", "r1");
      expect(res.status).toBe(RsvpStatus.CANCELLED);
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.cancelled" }));
    });
    it("404s an unknown rsvp", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue(null);
      await expect(service.cancelRsvp("org1", "e1", "x")).rejects.toMatchObject({
        response: { error: { code: "RSVP_NOT_FOUND" } },
      });
    });
  });

  describe("public surface", () => {
    it("previews only a published, public-RSVP event and computes spotsLeft", async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: "e1", tenantId: "org1", title: "T", description: null, category: null, location: null,
        startsAt: new Date(), endsAt: new Date(), capacity: 10, imageUrl: null,
      });
      prisma.eventRsvp.count.mockResolvedValue(4);
      const res = await service.publicPreview("e1");
      expect(res).toMatchObject({ attendeeCount: 4, spotsLeft: 6 });
    });
    it("404s a non-public event", async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.publicPreview("x")).rejects.toMatchObject({
        response: { error: { code: "EVENT_NOT_FOUND" } },
      });
      await expect(service.publicRsvp("x", { name: "n" })).rejects.toMatchObject({
        response: { error: { code: "EVENT_NOT_FOUND" } },
      });
    });
    it("accepts a public RSVP", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: null });
      const res = await service.publicRsvp("e1", { name: "Pat", email: "pat@x.org" });
      expect(res.status).toBe(RsvpStatus.GOING);
    });
  });
});
