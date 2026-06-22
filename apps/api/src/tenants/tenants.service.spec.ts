import { AppUserRole } from "@yarns/db";
import { TenantsService } from "./tenants.service";

function setup() {
  const prisma: any = {
    tenant: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => ({ id: "t1", slug: "acme", name: "Acme", deletedAt: null })),
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
      findMany: jest.fn(async () => []),
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
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const svc = new TenantsService(prisma, outbox);
  return { svc, prisma, outbox };
}

describe("TenantsService", () => {
  it("createTenant normalises the slug, adds the owner, and emits events", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.createTenant({ slug: "ACME", name: "Acme Inc", ownerUserId: "u1" });
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "acme", name: "Acme Inc" }) }),
    );
    expect(prisma.tenantMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", role: AppUserRole.ORGANISER }) }),
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

  it("createInvitation issues a token and emits tenant.invitation.sent", async () => {
    const { svc, outbox } = setup();
    const res = await svc.createInvitation("t1", { email: "New@X.Y", role: AppUserRole.CANVASSER });
    expect(res.token).toEqual(expect.any(String));
    expect(res.token.length).toBeGreaterThan(20);
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.invitation.sent" }),
    );
  });

  it("addMember resolves the user by email and upserts the membership", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.addMember("t1", { email: "a@b.c", role: AppUserRole.ORGANISER });
    expect(prisma.tenantMember.upsert).toHaveBeenCalled();
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.member.added" }),
    );
  });

  it("addMember throws when the user does not exist", async () => {
    const { svc, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(svc.addMember("t1", { email: "nope@x.y", role: AppUserRole.CANVASSER })).rejects.toThrow();
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
});
