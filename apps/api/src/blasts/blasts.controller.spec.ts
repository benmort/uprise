import { BlastsController } from "./blasts.controller";

// Unit-level delegation checks: each handler forwards to the service with the
// tenant id as the first arg (the tenant-scoped path the service relies on).
describe("BlastsController", () => {
  const svc = {
    createDraft: jest.fn().mockResolvedValue({}),
    updateDraft: jest.fn().mockResolvedValue({}),
    deleteBlast: jest.fn().mockResolvedValue({}),
    previewProof: jest.fn().mockResolvedValue({}),
    markProofed: jest.fn().mockResolvedValue({}),
    schedule: jest.fn().mockResolvedValue({}),
    requestSendNow: jest.fn().mockResolvedValue({}),
    dispatchDueScheduled: jest.fn().mockResolvedValue({}),
    requestRetryFailed: jest.fn().mockResolvedValue({}),
    listBlasts: jest.fn().mockResolvedValue([]),
  } as any;
  const c = new BlastsController(svc);

  afterEach(() => jest.clearAllMocks());

  it("create delegates to createDraft with tenantId", async () => {
    await c.create("t1", { subject: "x" } as any);
    expect(svc.createDraft).toHaveBeenCalledWith("t1", { subject: "x" });
  });

  it("update delegates to updateDraft with tenantId + id", async () => {
    await c.update("t1", "b1", { subject: "y" } as any);
    expect(svc.updateDraft).toHaveBeenCalledWith("t1", "b1", { subject: "y" });
  });

  it("remove delegates to deleteBlast with tenantId + id", async () => {
    await c.remove("t1", "b1");
    expect(svc.deleteBlast).toHaveBeenCalledWith("t1", "b1");
  });

  it("proofPreview delegates to previewProof with tenantId + id", async () => {
    await c.proofPreview("t1", "b1", { to: "a@b.co" } as any);
    expect(svc.previewProof).toHaveBeenCalledWith("t1", "b1", { to: "a@b.co" });
  });

  it("markProofed delegates with tenantId + id", async () => {
    await c.markProofed("t1", "b1");
    expect(svc.markProofed).toHaveBeenCalledWith("t1", "b1");
  });

  it("schedule delegates with tenantId + id", async () => {
    await c.schedule("t1", "b1", { sendAt: "2026-01-01" } as any);
    expect(svc.schedule).toHaveBeenCalledWith("t1", "b1", { sendAt: "2026-01-01" });
  });

  it("sendNow delegates to requestSendNow with tenantId + id", async () => {
    await c.sendNow("t1", "b1");
    expect(svc.requestSendNow).toHaveBeenCalledWith("t1", "b1");
  });

  it("dispatchDue parses the limit query when present", async () => {
    await c.dispatchDue("25");
    expect(svc.dispatchDueScheduled).toHaveBeenCalledWith(25);
  });

  it("dispatchDue passes undefined when no limit", async () => {
    await c.dispatchDue();
    expect(svc.dispatchDueScheduled).toHaveBeenCalledWith(undefined);
  });

  it("retryFailed delegates to requestRetryFailed with tenantId + id", async () => {
    await c.retryFailed("t1", "b1");
    expect(svc.requestRetryFailed).toHaveBeenCalledWith("t1", "b1");
  });

  it("list delegates to listBlasts with tenantId", async () => {
    await c.list("t1", {} as any);
    expect(svc.listBlasts).toHaveBeenCalledWith("t1");
  });
});
