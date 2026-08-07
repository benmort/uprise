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

  it("resolve() forces a host tenant the user is a member of (over the pinned tenant)", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: "t1", // pinned
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([
      { tenantId: "t1", role: "ORGANISER" },
      { tenantId: "t2", role: "VOLUNTEER" },
    ]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t", undefined, { forcedTenantId: "t2" })).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "t2",
      role: "VOLUNTEER",
      isSuperAdmin: false,
    });
  });

  it("resolve() denies the host tenant for a non-member (session stays valid)", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: "t1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findMany.mockResolvedValue([{ tenantId: "t1", role: "ORGANISER" }]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t", undefined, { forcedTenantId: "other" })).resolves.toMatchObject({
      tenantId: null,
      hostTenantDenied: true,
    });
  });

  it("resolve() lets a super-admin act-as a host tenant they don't belong to", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      tenantId: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", isSuperAdmin: true });
    prisma.tenantMember.findMany.mockResolvedValue([]);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t", undefined, { forcedTenantId: "cust" })).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "cust",
      role: "OWNER",
      isSuperAdmin: true,
    });
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

// ── resolveLight + the principal cache (added after a tile burst drained the pool) ──
describe("SessionService — cheap resolve + cache", () => {
  const future = () => new Date(Date.now() + 60_000);
  const past = () => new Date(Date.now() - 60_000);

  /** A prisma stub whose resolve() path succeeds, counting how often each table is hit. */
  function resolvable() {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      token: "t1",
      expiresAt: future(),
      tenantId: null,
      userAgent: null,
      ipAddress: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.org", isSuperAdmin: false });
    prisma.tenantMember.findMany.mockResolvedValue([{ tenantId: "t-1", role: "ORGANISER" }]);
    return prisma;
  }

  describe("resolveLight", () => {
    it("answers from ONE indexed lookup — no user, no memberships, no last-seen write", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      expect(await svc.resolveLight("t1")).toEqual({ userId: "u1" });
      expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.tenantMember.findMany).not.toHaveBeenCalled();
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    // It must not be able to satisfy a @Roles or @RequirePermission gate.
    it("carries no role and no tenant", async () => {
      const svc = new SessionService(resolvable());
      const light = await svc.resolveLight("t1");
      expect(light).not.toHaveProperty("role");
      expect(light).not.toHaveProperty("tenantId");
    });

    it("refuses an expired or unknown token", async () => {
      const prisma = resolvable();
      prisma.session.findUnique.mockResolvedValueOnce({ userId: "u1", expiresAt: past() });
      const svc = new SessionService(prisma);
      expect(await svc.resolveLight("t1")).toBeNull();
      prisma.session.findUnique.mockResolvedValueOnce(null);
      expect(await svc.resolveLight("t1")).toBeNull();
      expect(await svc.resolveLight("")).toBeNull();
    });
  });

  describe("resolve cache", () => {
    // The whole point: a burst of parallel requests costs one principal build, not twenty.
    // The case this exists for. A result cache alone does NOT fix it: twenty tile requests arrive
    // together, so all twenty start before any finishes and every one misses. Sharing the
    // in-flight promise is what collapses them onto one build.
    it("collapses a CONCURRENT burst to a single principal build", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      const all = await Promise.all(Array.from({ length: 20 }, () => svc.resolve("t1")));
      expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.tenantMember.findMany).toHaveBeenCalledTimes(1);
      // Every caller still gets the principal.
      expect(all.every((r) => r?.userId === "u1")).toBe(true);
    });

    it("serves the requests that follow the burst from the result cache", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      await svc.resolve("t1");
      await svc.resolve("t1");
      await svc.resolve("t1");
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it("returns the same principal it would have built", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      const first = await svc.resolve("t1");
      const cached = await svc.resolve("t1");
      expect(cached).toEqual(first);
    });

    // Signing out is the revocation people actually perform — it must not wait for the TTL.
    it("revoke() evicts immediately, so the next resolve hits the database", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      await svc.resolve("t1");
      const before = prisma.session.findUnique.mock.calls.length;
      await svc.revoke("t1");
      prisma.session.findUnique.mockResolvedValue(null);
      expect(await svc.resolve("t1")).toBeNull();
      expect(prisma.session.findUnique.mock.calls.length).toBeGreaterThan(before);
    });

    it("revokeAllForUser / revokeById / revokeOthers clear the cache too", async () => {
      for (const revoke of [
        (s: SessionService) => s.revokeAllForUser("u1"),
        (s: SessionService) => s.revokeById("u1", "s1"),
        (s: SessionService) => s.revokeOthers("u1", "other"),
      ]) {
        const prisma = resolvable();
        const svc = new SessionService(prisma);
        await svc.resolve("t1");
        await revoke(svc);
        prisma.session.findUnique.mockResolvedValue(null);
        expect(await svc.resolve("t1")).toBeNull();
      }
    });

    // A failed resolve must not be remembered, or a just-signed-in user stays locked out.
    it("never caches a null", async () => {
      const prisma = resolvable();
      prisma.session.findUnique.mockResolvedValue(null);
      const svc = new SessionService(prisma);
      await svc.resolve("t1");
      await svc.resolve("t1");
      expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
    });

    // A forced tenant changes what the principal resolves to; reading a cached unforced one
    // would hand someone the wrong workspace.
    it("bypasses the cache for a host-forced tenant", async () => {
      const prisma = resolvable();
      const svc = new SessionService(prisma);
      await svc.resolve("t1");
      const before = prisma.user.findUnique.mock.calls.length;
      await svc.resolve("t1", undefined, { forcedTenantId: "t-9" });
      expect(prisma.user.findUnique.mock.calls.length).toBeGreaterThan(before);
    });

    it("can be switched off entirely with OPS_SESSION_CACHE_MS=0", async () => {
      const prev = process.env.OPS_SESSION_CACHE_MS;
      process.env.OPS_SESSION_CACHE_MS = "0";
      try {
        const prisma = resolvable();
        const svc = new SessionService(prisma);
        await svc.resolve("t1");
        await svc.resolve("t1");
        expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      } finally {
        if (prev === undefined) delete process.env.OPS_SESSION_CACHE_MS;
        else process.env.OPS_SESSION_CACHE_MS = prev;
      }
    });
  });
});
