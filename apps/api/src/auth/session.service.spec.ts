import { SessionService } from "./session.service";

function makePrisma() {
  return {
    session: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
    user: { findUnique: jest.fn() },
    tenantMember: { findFirst: jest.fn() },
  } as any;
}

describe("SessionService", () => {
  it("create() issues a random token + future expiry and persists it", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    const { token, expiresAt } = await svc.create("u1");
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(20);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { userId: "u1", token, expiresAt },
    });
  });

  it("resolve() returns the actor for a live session with a membership", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      userId: "u1",
      token: "t",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "t1", role: "ORGANISER" });
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toEqual({
      userId: "u1",
      email: "a@b.c",
      tenantId: "t1",
      role: "ORGANISER",
    });
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
    prisma.tenantMember.findFirst.mockResolvedValue(null);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("t")).resolves.toBeNull();
  });

  it("resolve() returns null for an unknown token", async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue(null);
    const svc = new SessionService(prisma);
    await expect(svc.resolve("nope")).resolves.toBeNull();
  });

  it("revoke() deletes the session by token", async () => {
    const prisma = makePrisma();
    const svc = new SessionService(prisma);
    await svc.revoke("t");
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: "t" } });
  });
});
