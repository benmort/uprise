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
    getBlast: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new BlastsController(svc);

  afterEach(() => jest.clearAllMocks());

  // The composer used to resolve a blast by scanning listBlasts, which the service caps at 100
  // rows and which ignores pagination — so any blast past the hundredth read as "not found" at a
  // URL naming a real one, and the first autosave created a duplicate draft.
  it("get delegates to getBlast with tenantId + id", async () => {
    await c.get("t1", "b1");
    expect(svc.getBlast).toHaveBeenCalledWith("t1", "b1");
  });

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
    expect(svc.listBlasts).toHaveBeenCalledWith("t1", undefined);
  });

  it("list passes the campaignId filter through as a where clause", async () => {
    await c.list("t1", { campaignId: "c1" } as any);
    expect(svc.listBlasts).toHaveBeenCalledWith("t1", { campaignId: "c1" });
  });
});

/**
 * Route ORDER, not just delegation.
 *
 * Nest matches in declaration order, so a parameterised `@Get(":id")` declared above a literal
 * `@Get("dispatch-due")` swallows it — the cron would hit getBlast with id="dispatch-due" and
 * 404, silently, with no scheduled blast ever dispatching. Reflect the metadata rather than trust
 * the reading.
 */
describe("BlastsController route order", () => {
  it("declares every literal GET before the parameterised one", () => {
    const proto = BlastsController.prototype as unknown as Record<string, unknown>;
    const getPaths: string[] = [];
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const handler = proto[name];
      if (typeof handler !== "function") continue;
      const method = Reflect.getMetadata("method", handler);
      // 0 is RequestMethod.GET.
      if (method !== 0) continue;
      getPaths.push(String(Reflect.getMetadata("path", handler) ?? ""));
    }
    const paramIndex = getPaths.findIndex((p) => p.startsWith(":"));
    if (paramIndex === -1) return; // no parameterised GET — nothing to shadow
    // `/` (the bare collection route) is NOT shadowed by `:id` — Nest matches the empty segment
    // exactly. Only a named literal segment after the param would be swallowed.
    const shadowed = getPaths
      .slice(paramIndex + 1)
      .filter((p) => p && p !== "/" && !p.startsWith(":"));
    expect(shadowed).toEqual([]);
  });
});
