import { SessionService } from "./session.service";

function makePrisma() {
  return {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(async () => ({})),
    },
    user: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
    tenantMember: { findMany: jest.fn() },
  } as any;
}

describe("SessionService", () => {
  it("create() issues a random token + future expiry and persists it (no tenant pinned)", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    const { token, expiresAt } = await svc.create("u1");
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(20);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { userId: "u1", token, expiresAt, tenantId: null },
    });
  });

  it("create() pins the active tenant when given", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.create("u1", { tenantId: "t2" });
    expect(prisma.session.create.mock.calls[0][0].data.tenantId).toBe("t2");
  });

  it("resolve() returns the earliest membership when no tenant is pinned", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([
      { tenantId: "t1", role: "ORGANISER" },
      { tenantId: "t2", role: "VOLUNTEER" },
    ]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "t1",
      role: "ORGANISER",
      isSuperAdmin: false,
    });
  });

  it("resolve() honours a pinned tenant that is still a valid membership", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: "t2",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([
      { tenantId: "t1", role: "ORGANISER" },
      { tenantId: "t2", role: "VOLUNTEER" },
    ]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "t2",
      role: "VOLUNTEER",
      isSuperAdmin: false,
    });
  });

  it("resolve() falls back to first membership if the pinned tenant is no longer valid", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: "gone",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([{ tenantId: "t1", role: "ORGANISER" }]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toMatchObject({ tenantId: "t1" });
  });

  it("resolve() returns null for an expired session", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      expiresAt: new Date(Date.now() - 1),
    });
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolve() returns null when the user has no membership", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toBeNull();
  });

  it("resolve() lets a super-admin through with no membership (effective OWNER)", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: "any-tenant",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", isSuperAdmin: true });
    prisma.tenantMember.findMany.mockResolvedValue([]);
    const svc = new SessionService(prisma);
    // Not null (a normal user would be); pins the session's tenant; effective OWNER role.
    await expect(svc.resolve("t")).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "any-tenant",
      role: "OWNER",
      isSuperAdmin: true,
    });
  });

  it("resolve() returns null for an unknown token", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue(null);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("nope")).resolves.toBeNull();
  });

  it("setTenant() pins the tenant on the session", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.setTenant("t", "t2");
    expect(prisma.session.updateMany).toHaveBeenCalledWith({ where: { token: "t" }, data: { tenantId: "t2" } });
  });

  it("revoke() deletes the session by token", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.revoke("t");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: "t" } });
  });

  it("revokeAllForUser() deletes every session for the user", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.revokeAllForUser("u1");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("listForUser() returns active sessions and flags the current one", async () => {
    const prisma = makePrisma();
    prisma.session.findMany.mockResolvedValue([
      { id: "s1", token: "cur", userAgent: "Chrome", ipAddress: "1.2.3.4", lastSeenAt: null, createdAt: new Date(), expiresAt: new Date() },
      { id: "s2", token: "other", userAgent: "Safari", ipAddress: null, lastSeenAt: null, createdAt: new Date(), expiresAt: new Date() },
    ]);
    const svc = new SessionService(prisma);
    const rows = await svc.listForUser("u1", "cur");
    expect(rows.find((r) => r.id === "s1")?.current).toBe(true);
    expect(rows.find((r) => r.id === "s2")?.current).toBe(false);
    expect(rows[0]).not.toHaveProperty("token"); // never leak the token
  });

  it("revokeById() is scoped to the owner", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.revokeById("u1", "s9");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: "s9", userId: "u1" } });
  });

  it("revokeOthers() keeps the current session", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.revokeOthers("u1", "cur");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", token: { not: "cur" } } });
  });

  it("resolve() returns null for a soft-deleted user", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: "s1", userId: "u1", token: "t", tenantId: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", deletedAt: new Date() });
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toBeNull();
  });
});
