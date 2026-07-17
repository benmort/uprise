import { EventsController } from "./events.controller";
import { PublicEventsController } from "./public-events.controller";

describe("EventsController", () => {
  const svc = {
    listEvents: jest.fn().mockResolvedValue([]),
    getEvent: jest.fn().mockResolvedValue({}),
    createEvent: jest.fn().mockResolvedValue({}),
    updateEvent: jest.fn().mockResolvedValue({}),
    cancelEvent: jest.fn().mockResolvedValue({}),
    listRsvps: jest.fn().mockResolvedValue([]),
    rsvp: jest.fn().mockResolvedValue({}),
    cancelRsvp: jest.fn().mockResolvedValue({}),
    checkIn: jest.fn().mockResolvedValue({}),
    exportRsvpsCsv: jest.fn().mockResolvedValue("csv"),
    uploadCover: jest.fn().mockResolvedValue({ imageUrl: "u" }),
    dispatchDueReminders: jest.fn().mockResolvedValue({ events: 0, sent: 0 }),
    listPublicEvents: jest.fn().mockResolvedValue({ tenant: null, events: [] }),
    manageByToken: jest.fn().mockResolvedValue({}),
    updateRsvpByToken: jest.fn().mockResolvedValue({}),
    cancelByToken: jest.fn().mockResolvedValue({}),
    publicPreview: jest.fn().mockResolvedValue({}),
    publicRsvp: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new EventsController(svc);
  const pub = new PublicEventsController(svc);

  afterEach(() => jest.clearAllMocks());

  it("list passes the status tab + search", async () => {
    await c.list("t1", "upcoming", "rally");
    expect(svc.listEvents).toHaveBeenCalledWith("t1", { status: "upcoming", search: "rally" });
  });
  it("list defaults the tab to all", async () => {
    await c.list("t1");
    expect(svc.listEvents).toHaveBeenCalledWith("t1", { status: "all", search: undefined });
  });
  it("get delegates with tenantId + id", async () => {
    await c.get("t1", "e1");
    expect(svc.getEvent).toHaveBeenCalledWith("t1", "e1");
  });
  it("create delegates with tenantId", async () => {
    await c.create("t1", { title: "T", startsAt: "a", endsAt: "b" } as any);
    expect(svc.createEvent).toHaveBeenCalledWith("t1", { title: "T", startsAt: "a", endsAt: "b" });
  });
  it("update delegates with tenantId + id", async () => {
    await c.update("t1", "e1", { title: "N" } as any);
    expect(svc.updateEvent).toHaveBeenCalledWith("t1", "e1", { title: "N" });
  });
  it("cancel delegates with tenantId + id", async () => {
    await c.cancel("t1", "e1");
    expect(svc.cancelEvent).toHaveBeenCalledWith("t1", "e1");
  });
  it("listRsvps + rsvp + cancelRsvp delegate", async () => {
    await c.listRsvps("t1", "e1");
    expect(svc.listRsvps).toHaveBeenCalledWith("t1", "e1");
    await c.rsvp("t1", "e1", { name: "Sam" } as any);
    expect(svc.rsvp).toHaveBeenCalledWith("t1", "e1", { name: "Sam" });
    await c.cancelRsvp("t1", "e1", "r1");
    expect(svc.cancelRsvp).toHaveBeenCalledWith("t1", "e1", "r1");
  });

  it("check-in / export / cover / reminders delegate", async () => {
    await c.checkIn("t1", "e1", "r1");
    expect(svc.checkIn).toHaveBeenCalledWith("t1", "e1", "r1");
    await c.exportRsvps("t1", "e1");
    expect(svc.exportRsvpsCsv).toHaveBeenCalledWith("t1", "e1");
    const file = { buffer: Buffer.from("x"), originalname: "c.jpg", mimetype: "image/jpeg" };
    await c.uploadCover("t1", "e1", file);
    expect(svc.uploadCover).toHaveBeenCalledWith("t1", "e1", file);
    await c.dispatchDueReminders();
    expect(svc.dispatchDueReminders).toHaveBeenCalled();
    await c.dispatchDueRemindersGet();
    expect(svc.dispatchDueReminders).toHaveBeenCalledTimes(2);
  });

  it("public preview + rsvp + board + self-manage delegate", async () => {
    await pub.preview("e1");
    expect(svc.publicPreview).toHaveBeenCalledWith("e1");
    await pub.rsvp("e1", { name: "Pat" } as any);
    expect(svc.publicRsvp).toHaveBeenCalledWith("e1", { name: "Pat" });
    await pub.board("acme");
    expect(svc.listPublicEvents).toHaveBeenCalledWith("acme");
    await pub.manage("tok");
    expect(svc.manageByToken).toHaveBeenCalledWith("tok");
    await pub.updateManage("tok", { guests: 2 } as any);
    expect(svc.updateRsvpByToken).toHaveBeenCalledWith("tok", 2);
    await pub.cancelManage("tok");
    expect(svc.cancelByToken).toHaveBeenCalledWith("tok");
  });

  it("board requires a tenant slug", async () => {
    await expect(pub.board(undefined)).rejects.toBeTruthy();
  });
});
