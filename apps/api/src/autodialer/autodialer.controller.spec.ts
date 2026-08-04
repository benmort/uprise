import "reflect-metadata";
import { AutodialerController } from "./autodialer.controller";
import { REQUIRE_PERMISSION_KEY } from "../auth/require-permission.decorator";

describe("AutodialerController", () => {
  const service = {
    list: jest.fn().mockResolvedValue({ campaigns: [], total: 0 }),
    create: jest.fn().mockResolvedValue({ id: "dc1" }),
    get: jest.fn().mockResolvedValue({ id: "dc1" }),
    preflight: jest.fn().mockResolvedValue({ ok: true, checks: [] }),
    update: jest.fn().mockResolvedValue({ id: "dc1" }),
    archive: jest.fn().mockResolvedValue({ id: "dc1" }),
    activate: jest.fn().mockResolvedValue({ id: "dc1" }),
    pause: jest.fn().mockResolvedValue({ id: "dc1" }),
    resume: jest.fn().mockResolvedValue({ id: "dc1" }),
    complete: jest.fn().mockResolvedValue({ id: "dc1" }),
    clone: jest.fn().mockResolvedValue({ id: "dc2" }),
    upsertQuestionGraph: jest.fn().mockResolvedValue({ campaign: { id: "dc1" }, issues: [] }),
  } as any;
  const reporting = {
    tenantStats: jest.fn().mockResolvedValue({ active: 0 }),
    campaignStats: jest.fn().mockResolvedValue({ attempts: { total: 0 } }),
    listAttempts: jest.fn().mockResolvedValue({ total: 0, attempts: [] }),
    results: jest.fn().mockResolvedValue({ questions: [], transfers: [], transferCount: 0 }),
  } as any;
  const c = new AutodialerController(service, reporting);

  beforeEach(() => jest.clearAllMocks());

  it("list delegates with tenant + query", () => {
    const q = { status: "DRAFT", limit: 25, offset: 0 } as any;
    c.list("t1", q);
    expect(service.list).toHaveBeenCalledWith("t1", q);
  });

  it("create delegates with the session user id", () => {
    const dto = { name: "Spring ring-around" } as any;
    c.create("t1", dto, { user: { id: "u1" } } as any);
    expect(service.create).toHaveBeenCalledWith("t1", dto, "u1");
  });

  it("get / preflight delegate tenant + id", () => {
    c.get("t1", "dc1");
    c.preflight("t1", "dc1");
    expect(service.get).toHaveBeenCalledWith("t1", "dc1");
    expect(service.preflight).toHaveBeenCalledWith("t1", "dc1");
  });

  it("update / lifecycle actions delegate", () => {
    const dto = { name: "Renamed" } as any;
    c.update("t1", "dc1", dto);
    c.activate("t1", "dc1");
    c.pause("t1", "dc1");
    c.resume("t1", "dc1");
    c.complete("t1", "dc1");
    c.archive("t1", "dc1");
    expect(service.update).toHaveBeenCalledWith("t1", "dc1", dto);
    expect(service.activate).toHaveBeenCalledWith("t1", "dc1");
    expect(service.pause).toHaveBeenCalledWith("t1", "dc1");
    expect(service.resume).toHaveBeenCalledWith("t1", "dc1");
    expect(service.complete).toHaveBeenCalledWith("t1", "dc1");
    expect(service.archive).toHaveBeenCalledWith("t1", "dc1");
  });

  it("clone carries the acting user; questions put delegates the graph dto", () => {
    c.clone("t1", "dc1", { user: { id: "u9" } } as any);
    expect(service.clone).toHaveBeenCalledWith("t1", "dc1", "u9");
    const dto = { questions: [] } as any;
    c.upsertQuestions("t1", "dc1", dto);
    expect(service.upsertQuestionGraph).toHaveBeenCalledWith("t1", "dc1", dto);
  });

  it("reporting reads delegate to the reporting service with tenant scope", () => {
    c.tenantStats("t1");
    expect(reporting.tenantStats).toHaveBeenCalledWith("t1");
    c.stats("t1", "dc1");
    expect(reporting.campaignStats).toHaveBeenCalledWith("t1", "dc1");
    c.attempts("t1", "dc1", { limit: 25, offset: 50 } as any);
    expect(reporting.listAttempts).toHaveBeenCalledWith("t1", "dc1", { limit: 25, offset: 50 });
    c.attempts("t1", "dc1", {} as any);
    expect(reporting.listAttempts).toHaveBeenLastCalledWith("t1", "dc1", { limit: 50, offset: 0 });
    c.results("t1", "dc1");
    expect(reporting.results).toHaveBeenCalledWith("t1", "dc1");
  });

  it("every route carries @RequirePermission", () => {
    const methods = [
      "list",
      "create",
      "get",
      "preflight",
      "update",
      "archive",
      "activate",
      "pause",
      "resume",
      "complete",
      "clone",
      "upsertQuestions",
      "tenantStats",
      "stats",
      "attempts",
      "results",
    ] as const;
    for (const m of methods) {
      const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AutodialerController.prototype[m]);
      expect(meta).toBeDefined();
      expect(String(meta.resource)).toContain("autodialer.");
    }
  });
});
