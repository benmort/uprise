import { RegistrationService } from "./registration.service";

function setup(approvalRequired = false) {
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
    tenantJoinRequest: { create: jest.fn(async ({ data }: any) => ({ id: "jr1", ...data })) },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const sessions = {
    create: jest.fn(async () => ({ token: "sess", expiresAt: new Date(Date.now() + 3600_000) })),
  } as any;
  const config = {
    get: jest.fn((k: string) => (k === "SIGNUP_APPROVAL_REQUIRED" ? approvalRequired : undefined)),
  } as any;
  const svc = new RegistrationService(prisma, outbox, sessions, config);
  return { svc, prisma, outbox, sessions, config };
}

describe("RegistrationService", () => {
  const valid = { email: "Ada@Example.org", password: "longenoughpw", orgName: "Acme", slug: "ACME" };

  it("creates user + tenant + owner membership, emits events, and issues a tenant-pinned session", async () => {
    const { svc, prisma, outbox, sessions } = setup();
    const result = await svc.register(valid);
    if ("pending" in result) throw new Error("expected a session grant, not pending");

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "ada@example.org" }) }),
    );
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "acme", name: "Acme" }) }),
    );
    expect(prisma.tenantMember.create).toHaveBeenCalled();
    const events = outbox.append.mock.calls.map((c: any) => c[1].eventType);
    expect(events).toEqual([
      "iam.user.created",
      "tenant.tenant.created",
      "tenant.member.added",
      "iam.user.signed-in",
    ]);
    expect(sessions.create).toHaveBeenCalledWith("u1", { tenantId: "t1" });
    expect(result).toMatchObject({ userId: "u1", tenantId: "t1", token: "sess" });
    expect(result.memberships).toHaveLength(1);
  });

  it("when approval is required: creates a pending OWNER join request, no membership, no session", async () => {
    const { svc, prisma, outbox, sessions } = setup(true);
    const result = await svc.register(valid);

    expect(result).toEqual({ pending: true });
    expect(prisma.tenant.create).toHaveBeenCalled(); // slug reserved
    expect(prisma.tenantMember.create).not.toHaveBeenCalled();
    expect(prisma.tenantJoinRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestedRole: "OWNER", status: "pending", email: "ada@example.org" }),
      }),
    );
    const events = outbox.append.mock.calls.map((c: any) => c[1].eventType);
    expect(events).toEqual(["iam.user.created", "tenant.tenant.created", "tenant.signup.pending"]);
    expect(sessions.create).not.toHaveBeenCalled();
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
