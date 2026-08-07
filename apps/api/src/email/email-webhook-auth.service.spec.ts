import { EmailWebhookAuthService } from "./email-webhook-auth.service";

const config = {
  get: jest.fn((key: string, fallback?: string) =>
    key === "SENDGRID_WEBHOOK_VERIFICATION_KEY" ? "platform-key" : fallback,
  ),
} as any;

function build(rows?: { emailsById?: any[]; emailsBySgId?: any[]; account?: any }) {
  const prisma = {
    email: {
      // One batched read per lookup kind: `where.id` ⇒ the emailId pass, else the sg_message_id pass.
      findMany: jest.fn(async ({ where }: any) =>
        where.id ? rows?.emailsById ?? [] : rows?.emailsBySgId ?? [],
      ),
    },
    emailAccount: {
      findUnique: jest.fn().mockResolvedValue(rows?.account ?? null),
    },
  } as any;
  return { svc: new EmailWebhookAuthService(prisma, config), prisma };
}

describe("EmailWebhookAuthService", () => {
  it("resolves the sending account's key via custom_args emailId", async () => {
    const { svc, prisma } = build({
      emailsById: [{ id: "em1", emailAccountId: "acc_1" }],
      account: { webhookPublicKey: "subuser-key" },
    });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("subuser-key");
    expect(prisma.email.findMany).toHaveBeenCalledTimes(1); // the sg pass never runs
  });

  it("falls back to sg_message_id lookup with the filter suffix stripped", async () => {
    const { svc, prisma } = build({
      emailsBySgId: [{ providerMessageId: "SGID123", emailAccountId: "acc_1" }],
      account: { webhookPublicKey: "subuser-key" },
    });
    const key = await svc.resolveKey([
      { event: "delivered", sg_message_id: "SGID123.filter001.recv" },
    ]);
    expect(key).toBe("subuser-key");
    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerMessageId: { in: ["SGID123"] } } }),
    );
  });

  it("platform sends (emailAccountId null) resolve to the platform key", async () => {
    const { svc, prisma } = build({ emailsById: [{ id: "em1", emailAccountId: null }] });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("platform-key");
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it("unresolvable batches fall back to the platform key without a read", async () => {
    const { svc, prisma } = build();
    expect(await svc.resolveKey([{ event: "delivered" }])).toBe("platform-key");
    expect(await svc.resolveKey([])).toBe("platform-key");
    expect(prisma.email.findMany).not.toHaveBeenCalled(); // no ids collected – no queries at all
  });

  it("an account without a stored key falls back to the platform key", async () => {
    const { svc } = build({
      emailsById: [{ id: "em1", emailAccountId: "acc_1" }],
      account: { webhookPublicKey: null },
    });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("platform-key");
  });

  it("batches every emailId into ONE read regardless of batch size", async () => {
    const { svc, prisma } = build({
      emailsById: [{ id: "em2", emailAccountId: "acc_1" }],
      account: { webhookPublicKey: "subuser-key" },
    });
    const key = await svc.resolveKey([
      { event: "processed", emailId: "em1" },
      { event: "delivered", emailId: "em2" },
      { event: "open", emailId: "em3" },
    ]);
    expect(key).toBe("subuser-key");
    expect(prisma.email.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["em1", "em2", "em3"] } } }),
    );
  });

  it("an emailId match wins over an earlier event's sg_message_id match", async () => {
    const { svc, prisma } = build({
      emailsById: [{ id: "emA", emailAccountId: "acc_id" }],
      emailsBySgId: [{ providerMessageId: "SG1", emailAccountId: "acc_sg" }],
      account: { webhookPublicKey: "key" },
    });
    await svc.resolveKey([
      { event: "delivered", sg_message_id: "SG1.filter" },
      { event: "delivered", emailId: "emA" },
    ]);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc_id" } }),
    );
    expect(prisma.email.findMany).toHaveBeenCalledTimes(1); // sg pass skipped once an id matched
  });

  it("among emailId matches, the earliest event in batch order wins", async () => {
    const { svc, prisma } = build({
      emailsById: [
        { id: "em1", emailAccountId: "acc_1" }, // DB row order ≠ batch order
        { id: "em2", emailAccountId: "acc_2" },
      ],
      account: { webhookPublicKey: "key" },
    });
    await svc.resolveKey([
      { event: "delivered", emailId: "em2" },
      { event: "delivered", emailId: "em1" },
    ]);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc_2" } }),
    );
  });

  it("falls through to the sg pass only when no emailId matched", async () => {
    const { svc, prisma } = build({
      emailsById: [],
      emailsBySgId: [{ providerMessageId: "SG1", emailAccountId: "acc_sg" }],
      account: { webhookPublicKey: "subuser-key" },
    });
    const key = await svc.resolveKey([
      { event: "delivered", emailId: "ghost" },
      { event: "delivered", sg_message_id: "SG1.f0" },
    ]);
    expect(key).toBe("subuser-key");
    expect(prisma.email.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc_sg" } }),
    );
  });
});
