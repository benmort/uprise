import { CalendarController } from "./calendar.controller";

describe("CalendarController", () => {
  const svc = {
    listCalendar: jest.fn().mockResolvedValue([]),
    listEntries: jest.fn().mockResolvedValue([]),
    createEntry: jest.fn().mockResolvedValue({}),
    updateEntry: jest.fn().mockResolvedValue({}),
    deleteEntry: jest.fn().mockResolvedValue({ deleted: true }),
  } as any;
  const c = new CalendarController(svc);
  const req = { user: { id: "u1" } } as any;

  afterEach(() => jest.clearAllMocks());

  it("list passes the from/to window", async () => {
    await c.list("t1", "2030-01-01", "2030-01-31");
    expect(svc.listCalendar).toHaveBeenCalledWith("t1", "2030-01-01", "2030-01-31");
  });
  it("listEntries delegates with tenantId", async () => {
    await c.listEntries("t1");
    expect(svc.listEntries).toHaveBeenCalledWith("t1");
  });
  it("createEntry threads the session user as createdBy", async () => {
    await c.createEntry("t1", { title: "T", startsAt: "2030-01-01" } as any, req);
    expect(svc.createEntry).toHaveBeenCalledWith("t1", { title: "T", startsAt: "2030-01-01" }, "u1");
  });
  it("updateEntry delegates with tenantId + id", async () => {
    await c.updateEntry("t1", "ce1", { title: "N" } as any);
    expect(svc.updateEntry).toHaveBeenCalledWith("t1", "ce1", { title: "N" });
  });
  it("deleteEntry delegates with tenantId + id", async () => {
    await c.deleteEntry("t1", "ce1");
    expect(svc.deleteEntry).toHaveBeenCalledWith("t1", "ce1");
  });
});
