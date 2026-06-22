import { RegistrationService } from "./registration.service";

function setup() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: "u1", ...data })),
    },
    tenant: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: "t1", ...data })),
    },
    tenantMember: { create: jest.fn(async ({ data }: any) => ({ id: "m1", ...data })) },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const sessions = {
    create: jest.fn(async () => ({ token: "sess", expiresAt: new Date(Date.now() + 3600_000) })),
  } as any;
  const svc = new RegistrationService(prisma, outbox, sessions);
  return { svc, prisma, outbox, sessions };
}

describe("RegistrationService", () => {
  const valid = { email: "Ada@Example.org", password: "longenoughpw", orgName: "Acme", slug: "ACME" };

  it("creates user + tenant + owner membership, emits events, and issues a tenant-pinned session", async () => {
    const { svc, prisma, outbox, sessions } = setup();
    const grant = await svc.register(valid);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "ada@example.org" }) }),
    );
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "acme", name: "Acme" }) }),
    );
    expect(prisma.tenantMember.create).toHaveBeenCalled();
    const events = outbox.append.mock.calls.map((c: any) => c[1].eventType);
    expect(events).toEqual(["iam.user.created", "tenant.tenant.created", "tenant.member.added"]);
    expect(sessions.create).toHaveBeenCalledWith("u1", { tenantId: "t1" });
    expect(grant).toMatchObject({ userId: "u1", tenantId: "t1", token: "sess" });
    expect(grant.memberships).toHaveLength(1);
  });

  it("rejects a short password", async () => {
    const { svc } = setup();
    await expect(svc.register({ ...valid, password: "short" })).rejects.toThrow();
  });

  it("rejects a duplicate email", async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id: "existing", email: "ada@example.org" });
    await expect(svc.register(valid)).rejects.toThrow();
  });

  it("rejects a taken slug", async () => {
    const { svc, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: "t9", slug: "acme" });
    await expect(svc.register(valid)).rejects.toThrow();
  });
});
