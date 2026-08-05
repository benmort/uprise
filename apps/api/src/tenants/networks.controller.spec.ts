import { ForbiddenException } from "@nestjs/common";
import { NetworksController } from "./networks.controller";
import { SUPER_ADMIN_KEY } from "../auth/super-admin.decorator";

describe("NetworksController", () => {
  const tenants = {
    createNetwork: jest.fn().mockResolvedValue({ id: "n1" }),
    searchNetworks: jest.fn().mockResolvedValue([]),
    getNetwork: jest.fn().mockResolvedValue({ id: "n1" }),
    listTenantsByNetwork: jest.fn().mockResolvedValue([]),
    updateNetworkBilling: jest.fn().mockResolvedValue({ id: "n1" }),
    tenantBelongsToNetwork: jest.fn().mockResolvedValue(false),
  } as any;
  const c = new NetworksController(tenants);

  const superReq = { user: { id: "u1", isSuperAdmin: true, tenantId: null } } as any;
  const memberReq = { user: { id: "u2", isSuperAdmin: false, tenantId: "t1" } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    tenants.tenantBelongsToNetwork.mockResolvedValue(false);
  });

  it("create delegates with name + owner from req.user", () => {
    const req = { user: { id: "u1" } } as any;
    c.create({ name: "Acme" } as any, req);
    expect(tenants.createNetwork).toHaveBeenCalledWith({ name: "Acme", ownerId: "u1" });
  });

  it("search delegates the query", () => {
    c.search("acme");
    expect(tenants.searchNetworks).toHaveBeenCalledWith("acme");
  });

  // The instance guard: CASL checks the ACTION only, so without it any owner of any
  // tenant could read any network's tenant roster by id (the ced3164 bug class).
  it("get: a super-admin reads any network", async () => {
    await c.get("n1", superReq);
    expect(tenants.getNetwork).toHaveBeenCalledWith("n1");
  });

  it("get: an owner whose tenant is IN the network reads it", async () => {
    tenants.tenantBelongsToNetwork.mockResolvedValue(true);
    await c.get("n1", memberReq);
    expect(tenants.tenantBelongsToNetwork).toHaveBeenCalledWith("t1", "n1");
    expect(tenants.getNetwork).toHaveBeenCalledWith("n1");
  });

  it("get: an owner outside the network is refused", async () => {
    await expect(c.get("n1", memberReq)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenants.getNetwork).not.toHaveBeenCalled();
  });

  it("tenantsIn: same instance guard as get", async () => {
    await expect(c.tenantsIn("n1", memberReq)).rejects.toBeInstanceOf(ForbiddenException);
    tenants.tenantBelongsToNetwork.mockResolvedValue(true);
    await c.tenantsIn("n1", memberReq);
    expect(tenants.listTenantsByNetwork).toHaveBeenCalledWith("n1");
  });

  it("tenantsIn: a tenant-less non-super-admin is refused without a lookup", async () => {
    await expect(
      c.tenantsIn("n1", { user: { id: "u3", isSuperAdmin: false, tenantId: null } } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenants.tenantBelongsToNetwork).not.toHaveBeenCalled();
  });

  it("updateBilling delegates with id + dto and is super-admin-gated", () => {
    const dto = { planName: "growth" } as any;
    c.updateBilling("n1", dto);
    expect(tenants.updateNetworkBilling).toHaveBeenCalledWith("n1", dto);
    // Billing repoints plan entitlements for every tenant in the network — pin the gate.
    expect(Reflect.getMetadata(SUPER_ADMIN_KEY, NetworksController.prototype.updateBilling)).toBe(true);
  });
});
