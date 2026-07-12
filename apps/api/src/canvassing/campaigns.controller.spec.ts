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
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ id: "c1" }),
    getBoundary: jest.fn().mockResolvedValue({}),
    boundaryAddressCount: jest.fn().mockResolvedValue({ addresses: 0 }),
    setBoundary: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new CampaignsController(svc);

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
});
