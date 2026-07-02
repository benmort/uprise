import { EmailWebhookAuthService } from "./email-webhook-auth.service";

const config = {
  get: jest.fn((key: string, fallback?: string) =>
    key === "SENDGRID_WEBHOOK_VERIFICATION_KEY" ? "platform-key" : fallback,
  ),
} as any;

function build(rows?: { email?: any; emailBySgId?: any; account?: any }) {
  const prisma = {
    email: {
      findUnique: jest.fn().mockResolvedValue(rows?.email ?? null),
      findFirst: jest.fn().mockResolvedValue(rows?.emailBySgId ?? null),
    },
    emailAccount: {
      findUnique: jest.fn().mockResolvedValue(rows?.account ?? null),
    },
  } as any;
  return { svc: new EmailWebhookAuthService(prisma, config), prisma };
}

describe("EmailWebhookAuthService", () => {
  it("resolves the sending account's key via custom_args emailId", async () => {
    const { svc } = build({
      email: { emailAccountId: "acc_1" },
      account: { webhookPublicKey: "subuser-key" },
    });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("subuser-key");
  });

  it("falls back to sg_message_id lookup with the filter suffix stripped", async () => {
    const { svc, prisma } = build({
      emailBySgId: { emailAccountId: "acc_1" },
      account: { webhookPublicKey: "subuser-key" },
    });
    const key = await svc.resolveKey([
      { event: "delivered", sg_message_id: "SGID123.filter001.recv" },
    ]);
    expect(key).toBe("subuser-key");
    expect(prisma.email.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerMessageId: "SGID123" } }),
    );
  });

  it("platform sends (emailAccountId null) resolve to the platform key", async () => {
    const { svc, prisma } = build({ email: { emailAccountId: null } });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("platform-key");
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it("unresolvable batches fall back to the platform key", async () => {
    const { svc } = build();
    expect(await svc.resolveKey([{ event: "delivered" }])).toBe("platform-key");
    expect(await svc.resolveKey([])).toBe("platform-key");
  });

  it("an account without a stored key falls back to the platform key", async () => {
    const { svc } = build({
      email: { emailAccountId: "acc_1" },
      account: { webhookPublicKey: null },
    });
    expect(await svc.resolveKey([{ event: "delivered", emailId: "em1" }])).toBe("platform-key");
  });
});
