import { NetworksController } from "./networks.controller";

describe("NetworksController", () => {
  const tenants = {
    createNetwork: jest.fn().mockResolvedValue({ id: "n1" }),
    searchNetworks: jest.fn().mockResolvedValue([]),
    getNetwork: jest.fn().mockResolvedValue({ id: "n1" }),
    listTenantsByNetwork: jest.fn().mockResolvedValue([]),
    updateNetworkBilling: jest.fn().mockResolvedValue({ id: "n1" }),
  } as any;
  const c = new NetworksController(tenants);

  beforeEach(() => jest.clearAllMocks());

  it("create delegates with name + owner from req.user", () => {
    const req = { user: { id: "u1" } } as any;
    c.create({ name: "Acme" } as any, req);
    expect(tenants.createNetwork).toHaveBeenCalledWith({ name: "Acme", ownerId: "u1" });
  });

  it("search delegates the query", () => {
    c.search("acme");
    expect(tenants.searchNetworks).toHaveBeenCalledWith("acme");
  });

  it("get delegates with id", () => {
    c.get("n1");
    expect(tenants.getNetwork).toHaveBeenCalledWith("n1");
  });

  it("tenantsIn delegates with id", () => {
    c.tenantsIn("n1");
    expect(tenants.listTenantsByNetwork).toHaveBeenCalledWith("n1");
  });

  it("updateBilling delegates with id + dto", () => {
    const dto = { planName: "growth" } as any;
    c.updateBilling("n1", dto);
    expect(tenants.updateNetworkBilling).toHaveBeenCalledWith("n1", dto);
  });
});
