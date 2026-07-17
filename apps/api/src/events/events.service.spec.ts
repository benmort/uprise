import { EventStatus, RsvpStatus } from "@uprise/db";
import { EventsService, derivedEventStatus } from "./events.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "e1", campaignId: null, ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, campaignId: null, ...data })),
    },
    eventRsvp: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { guests: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: "r1", ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    shift: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: "org1", name: "Acme", slug: "acme" }) },
    orgProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
  base.$transaction = jest.fn(async (fn: any) => fn(base));
  return base;
}

const heads = (n: number) => ({ _count: { _all: n }, _sum: { guests: 0 } });

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
  let dispatcher: any;
  let images: any;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = { append: jest.fn() };
    dispatcher = { sendSms: jest.fn(), sendEmail: jest.fn() };
    images = { enabled: true, extFrom: () => "jpg", randomKey: () => "event-covers/x.jpg", put: jest.fn(async () => ({ url: "https://blob/x.jpg", key: "k" })) };
    const config = { get: jest.fn(() => "https://act.test") } as any;
    service = new EventsService(prisma, outbox, images, config, dispatcher);
  });

  describe("listEvents", () => {
    it("attaches attendee headcounts (rows + guests) and derived status, filtered by tab", async () => {
      prisma.event.findMany.mockResolvedValue([
        { id: "e1", status: EventStatus.PUBLISHED, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") },
        { id: "e2", status: EventStatus.DRAFT, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") },
      ]);
      prisma.eventRsvp.groupBy.mockResolvedValue([{ eventId: "e1", _count: { _all: 5 }, _sum: { guests: 3 } }]);
      const upcoming = await service.listEvents("org1", { status: "upcoming" });
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0]).toMatchObject({ id: "e1", attendeeCount: 8, derivedStatus: "upcoming" });
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
      await expect(service.getEvent("org1", "x")).rejects.toMatchObject({ response: { error: { code: "EVENT_NOT_FOUND" } } });
    });
    it("returns rsvps + staffing shifts + attendee count", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", status: EventStatus.PUBLISHED, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") });
      prisma.eventRsvp.findMany.mockResolvedValue([{ id: "r1" }]);
      prisma.shift.findMany.mockResolvedValue([{ id: "s1", eventId: "e1" }]);
      prisma.eventRsvp.groupBy.mockResolvedValue([{ eventId: "e1", _count: { _all: 3 }, _sum: { guests: 0 } }]);
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
      await service.createEvent("org1", { title: "Rally", status: EventStatus.PUBLISHED, startsAt: "2030-01-01", endsAt: "2030-01-02" });
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.event.published" }));
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
      await expect(service.updateEvent("org1", "x", { title: "z" })).rejects.toMatchObject({ response: { error: { code: "EVENT_NOT_FOUND" } } });
    });
  });

  describe("rsvp (guest-aware capacity)", () => {
    it("records GOING and emits rsvp.created, generating a manage token", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: null });
      const res = await service.rsvp("org1", "e1", { name: "Sam", email: "sam@x.org" });
      expect(res.status).toBe(RsvpStatus.GOING);
      expect((res as any).manageToken).toBeTruthy();
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.created" }));
    });
    it("WAITLISTs a party that overflows capacity (heads count guests)", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: 3 });
      prisma.eventRsvp.aggregate.mockResolvedValue(heads(2)); // 2 heads used, cap 3
      const res = await service.rsvp("org1", "e1", { name: "Late", guests: 2 }); // party of 3 → 2+3 > 3
      expect(res.status).toBe(RsvpStatus.WAITLIST);
    });
    it("admits a party that exactly fits", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: 3 });
      prisma.eventRsvp.aggregate.mockResolvedValue(heads(1)); // 1 used, cap 3
      const res = await service.rsvp("org1", "e1", { name: "Fits", guests: 1 }); // party of 2 → 1+2 = 3
      expect(res.status).toBe(RsvpStatus.GOING);
    });
  });

  describe("cancelRsvp → waitlist promotion", () => {
    it("cancels, emits, and promotes the oldest fitting waitlister", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue({ id: "r1" });
      prisma.event.findFirst.mockResolvedValue({ capacity: 2 });
      prisma.eventRsvp.aggregate.mockResolvedValue(heads(0)); // fully free after cancel
      prisma.eventRsvp.findMany.mockResolvedValue([{ id: "w1", guests: 0 }, { id: "w2", guests: 5 }]);
      const res = await service.cancelRsvp("org1", "e1", "r1");
      expect(res.status).toBe(RsvpStatus.CANCELLED);
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.cancelled" }));
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.promoted" }));
      // w1 (party 1) promoted; w2 (party 6) doesn't fit → FIFO stop, only one promotion event
      const promoted = outbox.append.mock.calls.filter((c: any) => c[1].eventType === "events.rsvp.promoted");
      expect(promoted).toHaveLength(1);
    });
    it("404s an unknown rsvp", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue(null);
      await expect(service.cancelRsvp("org1", "e1", "x")).rejects.toMatchObject({ response: { error: { code: "RSVP_NOT_FOUND" } } });
    });
  });

  describe("checkIn", () => {
    it("marks ATTENDED + emits events.rsvp.attended", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue({ id: "r1" });
      const res = await service.checkIn("org1", "e1", "r1");
      expect(res.status).toBe(RsvpStatus.ATTENDED);
      expect(prisma.eventRsvp.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: RsvpStatus.ATTENDED }) }));
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.attended" }));
    });
    it("404s an unknown rsvp", async () => {
      prisma.eventRsvp.findFirst.mockResolvedValue(null);
      await expect(service.checkIn("org1", "e1", "x")).rejects.toMatchObject({ response: { error: { code: "RSVP_NOT_FOUND" } } });
    });
  });

  describe("exportRsvpsCsv", () => {
    it("emits a CSV with a header + quoted rows", async () => {
      prisma.eventRsvp.findMany.mockResolvedValue([
        { name: 'A "B"', email: "a@x.org", phone: null, status: "GOING", guests: 2, checkedInAt: null },
      ]);
      const csv = await service.exportRsvpsCsv("org1", "e1");
      expect(csv.split("\n")[0]).toBe("Name,Email,Phone,Status,Guests,Checked in");
      expect(csv).toContain('"A ""B"""');
    });
  });

  describe("cover upload", () => {
    it("puts the file + persists imageUrl", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1" });
      const res = await service.uploadCover("org1", "e1", { buffer: Buffer.from("x"), originalname: "c.jpg", mimetype: "image/jpeg" });
      expect(res.imageUrl).toBe("https://blob/x.jpg");
      expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: { imageUrl: "https://blob/x.jpg" } }));
    });
    it("400s with no file", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1" });
      await expect(service.uploadCover("org1", "e1", {})).rejects.toMatchObject({ response: { error: { code: "NO_FILE" } } });
    });
  });

  describe("reminders", () => {
    it("emails attendees with an email, SMSes the rest, and stamps reminderSentAt", async () => {
      prisma.event.findMany.mockResolvedValue([{ id: "e1", tenantId: "org1", title: "Rally", startsAt: new Date(), location: "Sq" }]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        { id: "r1", name: "A", email: "a@x.org", phone: null, manageToken: "t1" },
        { id: "r2", name: "B", email: null, phone: "+61400000000", manageToken: "t2" },
      ]);
      const res = await service.dispatchDueReminders();
      expect(dispatcher.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "event_reminder", toAddress: "a@x.org" }));
      expect(dispatcher.sendSms).toHaveBeenCalledWith(expect.objectContaining({ toPhone: "+61400000000" }));
      expect(res.sent).toBe(2);
    });
  });

  describe("public surface + self-manage", () => {
    it("previews a published public event with tenant brand + spotsLeft", async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: "e1", tenantId: "org1", title: "T", description: null, category: null, location: null,
        lat: null, lng: null, startsAt: new Date(), endsAt: new Date(), status: EventStatus.PUBLISHED, capacity: 10, imageUrl: null,
      });
      prisma.eventRsvp.aggregate.mockResolvedValue(heads(4));
      const res = await service.publicPreview("e1");
      expect(res).toMatchObject({ attendeeCount: 4, spotsLeft: 6 });
      expect(res.tenant).toMatchObject({ slug: "acme", name: "Acme" });
    });
    it("404s a non-public event (preview + rsvp)", async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.publicPreview("x")).rejects.toMatchObject({ response: { error: { code: "EVENT_NOT_FOUND" } } });
      await expect(service.publicRsvp("x", { name: "n" })).rejects.toMatchObject({ response: { error: { code: "EVENT_NOT_FOUND" } } });
    });
    it("accepts a public RSVP + returns its manage token", async () => {
      prisma.event.findFirst.mockResolvedValue({ id: "e1", tenantId: "org1", capacity: null, status: EventStatus.PUBLISHED, publicRsvpEnabled: true });
      const res = await service.publicRsvp("e1", { name: "Pat", email: "pat@x.org" });
      expect(res.status).toBe(RsvpStatus.GOING);
      expect(res.manageToken).toBeTruthy();
    });
    it("lists a tenant's public events by slug", async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({ id: "org1" }).mockResolvedValue({ id: "org1", name: "Acme", slug: "acme" });
      prisma.event.findMany.mockResolvedValue([
        { id: "e1", tenantId: "org1", title: "T", description: null, category: null, location: null, lat: null, lng: null, startsAt: new Date(), endsAt: new Date(), status: EventStatus.PUBLISHED, capacity: null, imageUrl: null },
      ]);
      const res = await service.listPublicEvents("acme");
      expect(res.events).toHaveLength(1);
      expect(res.tenant).toMatchObject({ slug: "acme" });
    });
    it("manageByToken 404s an unknown token, and cancelByToken cancels + promotes", async () => {
      prisma.eventRsvp.findUnique.mockResolvedValue(null);
      await expect(service.manageByToken("nope")).rejects.toMatchObject({ response: { error: { code: "RSVP_NOT_FOUND" } } });
      prisma.eventRsvp.findUnique.mockResolvedValue({ id: "r1", eventId: "e1", tenantId: "org1", status: RsvpStatus.GOING });
      prisma.event.findFirst.mockResolvedValue({ capacity: null });
      const res = await service.cancelByToken("tok");
      expect(res.status).toBe(RsvpStatus.CANCELLED);
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "events.rsvp.cancelled" }));
    });
  });
});
