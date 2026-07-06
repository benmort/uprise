import { ForbiddenException } from "@nestjs/common";
import { AppUserRole } from "@uprise/db";
import { TenantsController } from "./tenants.controller";

describe("TenantsController", () => {
  const tenants = {
    createTenant: jest.fn().mockResolvedValue({ id: "t1" }),
    isSlugAvailable: jest.fn().mockResolvedValue(true),
    tenantBrandBySlug: jest.fn().mockResolvedValue({ id: "t1", name: "Acme" }),
    searchTenants: jest.fn().mockResolvedValue([]),
    getTenant: jest.fn().mockResolvedValue({ id: "t1" }),
    updateTenant: jest.fn().mockResolvedValue({ id: "t1" }),
    deleteTenant: jest.fn().mockResolvedValue(undefined),
    getOnboarding: jest.fn().mockResolvedValue({ steps: [] }),
    updateOnboarding: jest.fn().mockResolvedValue({ steps: [] }),
    listMembers: jest.fn().mockResolvedValue([]),
    addMember: jest.fn().mockResolvedValue({ userId: "u2" }),
    updateMemberRole: jest.fn().mockResolvedValue({ userId: "u2" }),
    removeMember: jest.fn().mockResolvedValue(undefined),
    createInvitation: jest.fn().mockResolvedValue({ id: "i1" }),
    listInvitations: jest.fn().mockResolvedValue([]),
    revokeInvitation: jest.fn().mockResolvedValue(undefined),
    listJoinRequests: jest.fn().mockResolvedValue([]),
  } as any;
  const flows = {
    membershipsFor: jest.fn().mockResolvedValue([]),
    approveJoinRequest: jest.fn().mockResolvedValue({ id: "jr1" }),
    rejectJoinRequest: jest.fn().mockResolvedValue({ id: "jr1" }),
  } as any;
  const c = new TenantsController(tenants, flows);

  const reqFor = (user: any) => ({ user }) as any;
  const ownReq = reqFor({ id: "u1", tenantId: "t1", isSuperAdmin: false });
  const otherReq = reqFor({ id: "u1", tenantId: "other", isSuperAdmin: false });

  beforeEach(() => jest.clearAllMocks());

  it("create delegates with dto fields + ownerUserId from req.user", () => {
    c.create({ slug: "acme", name: "Acme", networkId: "n1" } as any, ownReq);
    expect(tenants.createTenant).toHaveBeenCalledWith({
      slug: "acme",
      name: "Acme",
      networkId: "n1",
      ownerUserId: "u1",
    });
  });

  it("createSelfServe throws when not authenticated", async () => {
    await expect(c.createSelfServe({ slug: "x", name: "X" } as any, reqFor(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("createSelfServe throws when the owner's plan disallows creating tenants", async () => {
    flows.membershipsFor.mockResolvedValueOnce([
      { tenantId: "t1", role: AppUserRole.OWNER, planName: "free" },
    ]);
    await expect(c.createSelfServe({ slug: "x", name: "X" } as any, ownReq)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tenants.createTenant).not.toHaveBeenCalled();
  });

  it("createSelfServe creates under the caller's network when owner on a paid plan", async () => {
    flows.membershipsFor.mockResolvedValueOnce([
      { tenantId: "t1", role: AppUserRole.OWNER, planName: "growth", network: { id: "n9" } },
    ]);
    await c.createSelfServe({ slug: "x", name: "X" } as any, ownReq);
    expect(tenants.createTenant).toHaveBeenCalledWith({
      slug: "x",
      name: "X",
      networkId: "n9",
      ownerUserId: "u1",
    });
  });

  it("createSelfServe skips the plan check for a super-admin", async () => {
    await c.createSelfServe(
      { slug: "x", name: "X" } as any,
      reqFor({ id: "sa", isSuperAdmin: true }),
    );
    expect(flows.membershipsFor).not.toHaveBeenCalled();
    expect(tenants.createTenant).toHaveBeenCalledWith({
      slug: "x",
      name: "X",
      networkId: undefined,
      ownerUserId: "sa",
    });
  });

  it("available delegates the slug", () => {
    c.available("acme");
    expect(tenants.isSlugAvailable).toHaveBeenCalledWith("acme");
  });

  it("available coerces a missing slug to empty string", () => {
    c.available(undefined as any);
    expect(tenants.isSlugAvailable).toHaveBeenCalledWith("");
  });

  it("brand delegates the slug", () => {
    c.brand("acme");
    expect(tenants.tenantBrandBySlug).toHaveBeenCalledWith("acme");
  });

  it("search delegates the query", () => {
    c.search("ac");
    expect(tenants.searchTenants).toHaveBeenCalledWith("ac");
  });

  it("get delegates with id", () => {
    c.get("t1");
    expect(tenants.getTenant).toHaveBeenCalledWith("t1");
  });

  it("update delegates with id + dto", () => {
    const dto = { name: "New" } as any;
    c.update("t1", dto);
    expect(tenants.updateTenant).toHaveBeenCalledWith("t1", dto);
  });

  it("remove delegates with id", () => {
    c.remove("t1");
    expect(tenants.deleteTenant).toHaveBeenCalledWith("t1");
  });

  it("getOnboarding delegates when acting on own tenant", () => {
    c.getOnboarding("t1", ownReq);
    expect(tenants.getOnboarding).toHaveBeenCalledWith("t1");
  });

  it("getOnboarding throws for a mismatched tenant", () => {
    expect(() => c.getOnboarding("t1", otherReq)).toThrow(ForbiddenException);
    expect(tenants.getOnboarding).not.toHaveBeenCalled();
  });

  it("getOnboarding lets a super-admin cross tenants", () => {
    c.getOnboarding("t1", reqFor({ id: "sa", tenantId: "other", isSuperAdmin: true }));
    expect(tenants.getOnboarding).toHaveBeenCalledWith("t1");
  });

  it("updateOnboarding delegates when acting on own tenant", () => {
    const dto = { completedStepId: "step-1" } as any;
    c.updateOnboarding("t1", dto, ownReq);
    expect(tenants.updateOnboarding).toHaveBeenCalledWith("t1", dto);
  });

  it("updateOnboarding throws for a mismatched tenant", () => {
    expect(() => c.updateOnboarding("t1", {} as any, otherReq)).toThrow(ForbiddenException);
  });

  it("listMembers delegates with id", () => {
    c.listMembers("t1");
    expect(tenants.listMembers).toHaveBeenCalledWith("t1");
  });

  it("addMember delegates with id + dto + addedBy", () => {
    c.addMember("t1", { userId: "u2", role: AppUserRole.ORGANISER } as any, ownReq);
    expect(tenants.addMember).toHaveBeenCalledWith("t1", {
      userId: "u2",
      role: AppUserRole.ORGANISER,
      addedBy: "u1",
    });
  });

  it("updateMemberRole delegates with id, userId + role", () => {
    c.updateMemberRole("t1", "u2", { role: AppUserRole.ORGANISER } as any);
    expect(tenants.updateMemberRole).toHaveBeenCalledWith("t1", "u2", AppUserRole.ORGANISER);
  });

  it("removeMember delegates with id + userId", () => {
    c.removeMember("t1", "u2");
    expect(tenants.removeMember).toHaveBeenCalledWith("t1", "u2");
  });

  it("createInvitation delegates with id + dto + invitedBy", () => {
    c.createInvitation("t1", { email: "a@b.co", role: AppUserRole.ORGANISER } as any, ownReq);
    expect(tenants.createInvitation).toHaveBeenCalledWith("t1", {
      email: "a@b.co",
      role: AppUserRole.ORGANISER,
      invitedBy: "u1",
    });
  });

  it("listInvitations delegates with id", () => {
    c.listInvitations("t1");
    expect(tenants.listInvitations).toHaveBeenCalledWith("t1");
  });

  it("revokeInvitation delegates with id + invitationId", () => {
    c.revokeInvitation("t1", "i1");
    expect(tenants.revokeInvitation).toHaveBeenCalledWith("t1", "i1");
  });

  it("listJoinRequests delegates when acting on own tenant", () => {
    c.listJoinRequests("t1", "PENDING", ownReq);
    expect(tenants.listJoinRequests).toHaveBeenCalledWith("t1", "PENDING");
  });

  it("listJoinRequests throws for a mismatched tenant", () => {
    expect(() => c.listJoinRequests("t1", undefined, otherReq)).toThrow(ForbiddenException);
    expect(tenants.listJoinRequests).not.toHaveBeenCalled();
  });

  it("approveJoinRequest delegates to flows with role + approvedBy", () => {
    c.approveJoinRequest("t1", "jr1", { role: AppUserRole.ORGANISER } as any, ownReq);
    expect(flows.approveJoinRequest).toHaveBeenCalledWith("t1", "jr1", {
      role: AppUserRole.ORGANISER,
      approvedBy: "u1",
    });
  });

  it("approveJoinRequest throws for a mismatched tenant", () => {
    expect(() => c.approveJoinRequest("t1", "jr1", {} as any, otherReq)).toThrow(ForbiddenException);
    expect(flows.approveJoinRequest).not.toHaveBeenCalled();
  });

  it("rejectJoinRequest delegates to flows with rejectedBy", () => {
    c.rejectJoinRequest("t1", "jr1", {} as any, ownReq);
    expect(flows.rejectJoinRequest).toHaveBeenCalledWith("t1", "jr1", { rejectedBy: "u1" });
  });

  it("rejectJoinRequest throws for a mismatched tenant", () => {
    expect(() => c.rejectJoinRequest("t1", "jr1", {} as any, otherReq)).toThrow(ForbiddenException);
    expect(flows.rejectJoinRequest).not.toHaveBeenCalled();
  });
});
