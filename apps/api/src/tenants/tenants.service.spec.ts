import { AppUserRole } from "@uprise/db";
import { TenantsService } from "./tenants.service";

// Re-auth is delegated to the shared password helper; the tenant service just calls it.
jest.mock("../auth/password.util", () => ({
  verifyPassword: jest.fn(async (password: string) => password === "correct-password"),
}));

function setup() {
  const prisma: any = {
    tenant: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => ({ id: "t1", slug: "acme", name: "Acme", deletedAt: null })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: "t1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "t1", ...data })),
    },
    network: {
      findUnique: jest.fn(async () => ({ id: "n1", name: "Net" })),
      create: jest.fn(async ({ data }: any) => ({ id: "n1", ...data })),
    },
    tenantMember: {
      create: jest.fn(async ({ data }: any) => ({ id: "m1", ...data })),
      upsert: jest.fn(async ({ create }: any) => ({ id: "m1", ...create })),
      findUnique: jest.fn(async () => ({ tenantId: "t1", userId: "u1", role: "ORGANISER" })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 2),
      update: jest.fn(async ({ data }: any) => ({ id: "m1", ...data })),
      delete: jest.fn(async () => ({})),
    },
    tenantInvitation: {
      upsert: jest.fn(async ({ create }: any) => ({ id: "inv1", ...create })),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ id: "inv1", tenantId: "t1" })),
      update: jest.fn(async () => ({})),
    },
    user: { findUnique: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
    orgProfile: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const planLimits = { assertCanAddTeamMember: jest.fn(async () => undefined) } as any;
  // Inline invitation delivery (doc-14) goes through the transactional dispatcher.
  const dispatcher = { sendEmail: jest.fn(async () => undefined), sendSms: jest.fn(async () => undefined) } as any;
  const config = { get: jest.fn((_k: string, fb?: string) => fb ?? "http://localhost:3002") } as any;
  const svc = new TenantsService(prisma, outbox, planLimits, dispatcher, config);
  return { svc, prisma, outbox, planLimits, dispatcher, config };
}

describe("TenantsService", () => {
  it("createTenant normalises the slug, adds the owner, and emits events", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.createTenant({ slug: "ACME", name: "Acme Inc", ownerUserId: "u1" });
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "acme", name: "Acme Inc" }) }),
    );
    expect(prisma.tenantMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", role: AppUserRole.OWNER }) }),
    );
    const events = outbox.append.mock.calls.map((c: any) => c[1].eventType);
    expect(events).toEqual(["tenant.tenant.created", "tenant.member.added"]);
  });

  it("createTenant rejects a taken slug", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: "existing", slug: "acme" });
    await expect(svc.createTenant({ slug: "acme", name: "Acme" })).rejects.toThrow();
  });

  it("createTenant validates a referenced network", async () => {
    const { svc, prisma } = setup();
    prisma.network.findUnique.mockResolvedValueOnce(null);
    await expect(svc.createTenant({ slug: "acme", name: "Acme", networkId: "missing" })).rejects.toThrow();
  });

  it("createInvitation issues a token, emits the event, and sends the invite email inline", async () => {
    const { svc, outbox, dispatcher } = setup();
    const res = await svc.createInvitation("t1", { email: "New@X.Y", role: AppUserRole.VOLUNTEER });
    expect(res.token).toEqual(expect.any(String));
    expect(res.token.length).toBeGreaterThan(20);
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.invitation.sent" }),
    );
    // Delivered inline (doc-14), not left to the worker reaction. Email is lowercased.
    expect(dispatcher.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: "new@x.y",
        templateKey: "invitation",
        purpose: "invitation",
        vars: expect.objectContaining({ link: `http://localhost:3002/invite/${res.token}` }),
      }),
    );
    expect(dispatcher.sendSms).not.toHaveBeenCalled();
  });

  it("createInvitation sends an SMS for a phone-only invite (not email)", async () => {
    const { svc, dispatcher } = setup();
    const res = await svc.createInvitation("t1", { phone: "+61400000000", role: AppUserRole.VOLUNTEER });
    expect(dispatcher.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        toPhone: "+61400000000",
        purpose: "invitation",
        body: expect.stringContaining(`http://localhost:3002/v/invite/${res.token}`),
      }),
    );
    expect(dispatcher.sendEmail).not.toHaveBeenCalled();
  });

  it("createInvitation still succeeds when the inline send throws (best-effort)", async () => {
    const { svc, dispatcher } = setup();
    dispatcher.sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    const res = await svc.createInvitation("t1", { email: "x@y.z", role: AppUserRole.VOLUNTEER });
    expect(res.token).toEqual(expect.any(String));
    expect(dispatcher.sendEmail).toHaveBeenCalled();
  });

  it("addMember resolves the user by email and creates the membership", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.tenantMember.findUnique.mockResolvedValueOnce(null); // not yet a member
    await svc.addMember("t1", { email: "a@b.c", role: AppUserRole.ORGANISER });
    expect(prisma.tenantMember.create).toHaveBeenCalled();
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.member.added" }),
    );
  });

  it("addMember rejects a user who is already a member", async () => {
    const { svc, prisma } = setup();
    prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t1", userId: "u1", role: "ORGANISER" });
    await expect(
      svc.addMember("t1", { email: "a@b.c", role: AppUserRole.VOLUNTEER }),
    ).rejects.toThrow("already_member");
  });

  it("addMember throws when the user does not exist", async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(svc.addMember("t1", { email: "nope@x.y", role: AppUserRole.VOLUNTEER })).rejects.toThrow();
  });

  it("createNetwork emits tenant.network.created", async () => {
    const { svc, outbox } = setup();
    const net = await svc.createNetwork({ name: "Climate Net" });
    expect(net.id).toBe("n1");
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.network.created" }),
    );
  });

  it("removeMember rejects a non-existent membership", async () => {
    const { svc, prisma } = setup();
    prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
    await expect(svc.removeMember("t1", "u9")).rejects.toThrow();
  });

  it("removeMember emits tenant.member.removed", async () => {
    const { svc, outbox } = setup();
    await svc.removeMember("t1", "u1");
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.member.removed" }),
    );
  });

  it("updateMemberRole emits tenant.member.role-updated", async () => {
    const { svc, outbox } = setup();
    await svc.updateMemberRole("t1", "u1", AppUserRole.VOLUNTEER);
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.member.role-updated" }),
    );
  });

  it("refuses to remove the last owner of a tenant", async () => {
    const { svc, prisma } = setup();
    prisma.tenantMember.findUnique.mockResolvedValue({ tenantId: "t1", userId: "u1", role: "OWNER" });
    prisma.tenantMember.count.mockResolvedValueOnce(1); // only one owner left
    await expect(svc.removeMember("t1", "u1")).rejects.toThrow();
  });

  it("deleteTenant soft-deletes (sets deletedAt)", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.update = jest.fn(async () => ({ id: "t1" }));
    await svc.deleteTenant("t1");
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { deletedAt: expect.any(Date) } });
  });

  describe("selfServeDelete", () => {
    it("soft-deletes the active tenant for an owner with the right password", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: "hash", deletedAt: null });
      prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t1", userId: "u1", role: "OWNER" });
      prisma.tenantMember.findFirst.mockResolvedValueOnce(null); // no other workspace
      const res = await svc.selfServeDelete("u1", "t1", "correct-password");
      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { deletedAt: expect.any(Date) } });
      expect(outbox.append).toHaveBeenCalled();
      expect(res).toEqual({ ok: true, nextTenantId: null });
    });

    it("returns another administered workspace to switch into (no sign-out)", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: "hash", deletedAt: null });
      prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t1", userId: "u1", role: "OWNER" });
      prisma.tenantMember.findFirst.mockResolvedValueOnce({ tenantId: "t2" });
      const res = await svc.selfServeDelete("u1", "t1", "correct-password");
      expect(res).toEqual({ ok: true, nextTenantId: "t2" });
      // The fallback only counts live workspaces the user administers (OWNER/ORGANISER).
      const where = prisma.tenantMember.findFirst.mock.calls.at(-1)[0].where;
      expect(where).toMatchObject({
        userId: "u1",
        tenantId: { not: "t1" },
        role: { in: ["OWNER", "ORGANISER"] },
        tenant: { deletedAt: null },
      });
    });

    it("refuses with no active workspace", async () => {
      const { svc, prisma } = setup();
      await expect(svc.selfServeDelete("u1", null, "correct-password")).rejects.toThrow(/No active workspace/);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it("rejects a wrong password before touching anything", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: "hash", deletedAt: null });
      await expect(svc.selfServeDelete("u1", "t1", "wrong")).rejects.toThrow(/Password is incorrect/);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it("forbids a non-owner of the active tenant, even with the right password", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: "hash", deletedAt: null });
      prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t1", userId: "u1", role: "ORGANISER" });
      await expect(svc.selfServeDelete("u1", "t1", "correct-password")).rejects.toThrow(/owner of this workspace/);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });
  });

  it("isSlugAvailable reports availability (normalised)", async () => {
    const { svc, prisma } = setup();
    await expect(svc.isSlugAvailable("NewCo")).resolves.toEqual({ slug: "newco", available: true });
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: "t9", slug: "taken" });
    await expect(svc.isSlugAvailable("taken")).resolves.toEqual({ slug: "taken", available: false });
  });

  it("createTenant rejects a malformed slug", async () => {
    const { svc } = setup();
    await expect(svc.createTenant({ slug: "Bad Slug!", name: "X" })).rejects.toThrow("invalid_slug");
  });

  it("updateTenant emits tenant.tenant.renamed when the name changes", async () => {
    const { svc, outbox } = setup();
    await svc.updateTenant("t1", { name: "Acme Renamed" });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.tenant.renamed", payload: { tenantId: "t1", name: "Acme Renamed" } }),
    );
  });

  it("updateTenant rejects a malformed slug", async () => {
    const { svc } = setup();
    await expect(svc.updateTenant("t1", { slug: "Bad Slug!" })).rejects.toThrow("invalid_slug");
  });

  it("deleteTenant soft-deletes + emits tenant.tenant.deleted", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.deleteTenant("t1");
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.tenant.deleted" }),
    );
  });

  it("revokeInvitation marks revoked + emits the event", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.revokeInvitation("t1", "inv1");
    expect(prisma.tenantInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { status: "revoked" },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.invitation.revoked" }),
    );
  });
});

describe("TenantsService brand payloads", () => {
  it("tenantBrandBySlug joins the OrgProfile logo, colours and custom CSS", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findFirst.mockResolvedValueOnce({ id: "t1", name: "Common Threads" });
    prisma.orgProfile.findFirst.mockResolvedValueOnce({
      logoLandscapeUrl: "https://b/land.png",
      logoBlockUrl: "https://b/block.png",
      primaryColour: "#123456",
      secondaryColour: null,
      customCss: ".x{color:red}",
    });
    const brand = await svc.tenantBrandBySlug("common-threads");
    expect(brand).toEqual({
      id: "t1",
      name: "Common Threads",
      logoLandscapeUrl: "https://b/land.png",
      logoBlockUrl: "https://b/block.png",
      primaryColour: "#123456",
      secondaryColour: null,
      customCss: ".x{color:red}",
    });
  });

  it("tenantBrandBySlug returns null brand fields when the org has no profile", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findFirst.mockResolvedValueOnce({ id: "t1", name: "No Brand" });
    prisma.orgProfile.findFirst.mockResolvedValueOnce(null);
    const brand = await svc.tenantBrandBySlug("no-brand");
    expect(brand).toMatchObject({ id: "t1", name: "No Brand", logoBlockUrl: null, primaryColour: null });
  });

  it("tenantBrandBySlug returns null for an unknown slug", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findFirst.mockResolvedValueOnce(null);
    expect(await svc.tenantBrandBySlug("nope")).toBeNull();
  });

  it("searchTenants batches each tenant's logo onto its row", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findMany.mockResolvedValueOnce([
      { id: "t1", slug: "a", name: "A", networkId: null },
      { id: "t2", slug: "b", name: "B", networkId: null },
    ]);
    prisma.orgProfile.findMany.mockResolvedValueOnce([
      { tenantId: "t1", logoLandscapeUrl: null, logoBlockUrl: "https://b/a.png" },
    ]);
    const rows = await svc.searchTenants();
    expect(rows[0]).toMatchObject({ id: "t1", logoBlockUrl: "https://b/a.png", logoLandscapeUrl: null });
    expect(rows[1]).toMatchObject({ id: "t2", logoBlockUrl: null, logoLandscapeUrl: null });
  });
});
