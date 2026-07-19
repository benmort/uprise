import { CampaignsController } from "./campaigns.controller";

// Delegation checks: every handler forwards to CampaignsService with tenantId first.
describe("CampaignsController", () => {
  const svc = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue({}),
    getSummary: jest.fn().mockResolvedValue({}),
    getResults: jest.fn().mockResolvedValue({}),
    getLive: jest.fn().mockResolvedValue({}),
    getFieldReport: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ id: "c1" }),
    getBoundary: jest.fn().mockResolvedValue({}),
    boundaryAddressCount: jest.fn().mockResolvedValue({ addresses: 0 }),
    setBoundary: jest.fn().mockResolvedValue({}),
  } as any;
  const heat = {
    getForCampaign: jest.fn().mockResolvedValue({ meta: {}, cells: [] }),
    setConfig: jest.fn().mockResolvedValue({ meta: {}, cells: [] }),
    refresh: jest.fn().mockResolvedValue({ meta: {}, cells: [] }),
  } as any;
  const evaluation = {
    get: jest.fn().mockResolvedValue(null),
    power: jest.fn().mockResolvedValue({ clustersPerArm: 0 }),
    enable: jest.fn().mockResolvedValue({}),
    disable: jest.fn().mockResolvedValue(undefined),
  } as any;
  const c = new CampaignsController(svc, heat, evaluation);

  afterEach(() => jest.clearAllMocks());

  it("list delegates with tenantId", async () => {
    await c.list("t1");
    expect(svc.list).toHaveBeenCalledWith("t1");
  });

  it("create delegates with tenantId", async () => {
    await c.create({ name: "C" } as any, "t1");
    expect(svc.create).toHaveBeenCalledWith("t1", { name: "C" });
  });

  it("get delegates with tenantId + id", async () => {
    await c.get("c1", "t1");
    expect(svc.get).toHaveBeenCalledWith("t1", "c1");
  });

  it("summary delegates to getSummary with tenantId + id", async () => {
    await c.summary("c1", "t1");
    expect(svc.getSummary).toHaveBeenCalledWith("t1", "c1");
  });

  it("results delegates to getResults with tenantId + id", async () => {
    await c.results("c1", "t1");
    expect(svc.getResults).toHaveBeenCalledWith("t1", "c1");
  });

  it("live delegates to getLive with tenantId + id", async () => {
    await c.live("c1", "t1");
    expect(svc.getLive).toHaveBeenCalledWith("t1", "c1");
  });

  it("fieldReport delegates with tenantId + id, parsing the weeks query", async () => {
    await c.fieldReport("c1", "12", "t1");
    expect(svc.getFieldReport).toHaveBeenCalledWith("t1", "c1", { weeks: 12 });
    await c.fieldReport("c1", undefined, "t1");
    expect(svc.getFieldReport).toHaveBeenCalledWith("t1", "c1", { weeks: undefined });
  });

  it("resultsAll delegates to getResults with tenantId only (tenant-wide)", async () => {
    await c.resultsAll("t1");
    expect(svc.getResults).toHaveBeenCalledWith("t1");
  });

  it("liveAll delegates to getLive with tenantId only (tenant-wide)", async () => {
    await c.liveAll("t1");
    expect(svc.getLive).toHaveBeenCalledWith("t1");
  });

  it("update delegates with tenantId + id", async () => {
    await c.update("c1", { name: "N" } as any, "t1");
    expect(svc.update).toHaveBeenCalledWith("t1", "c1", { name: "N" });
  });

  it("remove delegates with tenantId + id", async () => {
    await c.remove("c1", "t1");
    expect(svc.remove).toHaveBeenCalledWith("t1", "c1");
  });

  it("boundaryAddressCount delegates with tenantId + id", async () => {
    await c.boundaryAddressCount("c1", "t1");
    expect(svc.boundaryAddressCount).toHaveBeenCalledWith("t1", "c1");
  });

  it("getBoundary delegates with tenantId + id", async () => {
    await c.getBoundary("c1", "t1");
    expect(svc.getBoundary).toHaveBeenCalledWith("t1", "c1");
  });

  it("setBoundary delegates the dto sources with tenantId + id", async () => {
    await c.setBoundary("c1", { sources: [{ kind: "division" }] } as any, "t1");
    expect(svc.setBoundary).toHaveBeenCalledWith("t1", "c1", [{ kind: "division" }]);
  });

  it("heat endpoints delegate get / config / refresh with tenantId + id", async () => {
    await c.getHeat("c1", "t1");
    expect(heat.getForCampaign).toHaveBeenCalledWith("t1", "c1");
    await c.setHeatConfig("c1", { preset: "gotv" } as any, "t1");
    expect(heat.setConfig).toHaveBeenCalledWith("t1", "c1", { preset: "gotv" });
    await c.refreshHeat("c1", "t1");
    expect(heat.refresh).toHaveBeenCalledWith("t1", "c1");
  });

  it("snapshot + evaluation endpoints delegate with tenantId + id", async () => {
    heat.snapshot = jest.fn().mockResolvedValue({ frozenRunId: "r1" });
    await c.snapshotHeat("c1", "t1");
    expect(heat.snapshot).toHaveBeenCalledWith("t1", "c1");
    await c.getEvaluation("c1", "t1");
    expect(evaluation.get).toHaveBeenCalledWith("t1", "c1");
    await c.evaluationPower("c1", "0.05", "t1");
    expect(evaluation.power).toHaveBeenCalledWith("t1", "c1", 0.05);
    await c.evaluationPower("c1", undefined, "t1");
    expect(evaluation.power).toHaveBeenCalledWith("t1", "c1", undefined);
    await c.enableEvaluation("c1", { icc: 0.02 }, "t1");
    expect(evaluation.enable).toHaveBeenCalledWith("t1", "c1", { icc: 0.02 });
    await c.disableEvaluation("c1", "t1");
    expect(evaluation.disable).toHaveBeenCalledWith("t1", "c1");
  });
});
