import { EmailSenderResolver } from "./email-sender.resolver";

const crypto = { decrypt: jest.fn((v: string) => `dec:${v}`) } as any;

function build(overrides?: { flagEnabled?: boolean; identities?: any[]; account?: any }) {
  const prisma = {
    emailSenderIdentity: {
      findMany: jest.fn().mockResolvedValue(overrides?.identities ?? []),
    },
    emailAccount: {
      findFirst: jest.fn().mockResolvedValue(
        overrides?.account === undefined
          ? {
              id: "acc_1",
              mode: "SUBUSER",
              subuserUsername: "uprise-demo",
              encryptedApiKey: "sealed",
              status: "ACTIVE",
            }
          : overrides.account,
      ),
    },
  } as any;
  const flags = { isEnabled: jest.fn().mockResolvedValue(overrides?.flagEnabled ?? true) } as any;
  return { resolver: new EmailSenderResolver(prisma, crypto, flags), prisma, flags };
}

const identity = (partial: Partial<Record<string, unknown>>) => ({
  id: "id_1",
  tenantId: "t1",
  accountId: "acc_1",
  campaignId: null,
  kind: "UPRISE_SUBDOMAIN",
  domain: "demo.mail.uprise.org.au",
  fromEmail: "hello@demo.mail.uprise.org.au",
  fromName: "Demo Org",
  purpose: "marketing",
  status: "ACTIVE",
  ...partial,
});

describe("EmailSenderResolver", () => {
  it("returns undefined when the flag is off (platform env sender)", async () => {
    const { resolver, prisma } = build({ flagEnabled: false, identities: [identity({})] });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
    expect(prisma.emailSenderIdentity.findMany).not.toHaveBeenCalled();
  });

  it("returns undefined when the tenant has no active identities", async () => {
    const { resolver } = build({ identities: [] });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
  });

  it("transactional NEVER falls through to a marketing identity", async () => {
    const { resolver } = build({ identities: [identity({})] }); // marketing-only tenant
    expect(await resolver.resolve({ tenantId: "t1", purpose: "transactional" })).toBeUndefined();
  });

  it("transactional resolves only an explicitly transactional-purposed identity", async () => {
    const { resolver } = build({
      identities: [
        identity({ id: "id_mkt", fromEmail: "news@demo.mail.uprise.org.au" }),
        identity({ id: "id_tx", purpose: "transactional", fromEmail: "auth@demo.mail.uprise.org.au" }),
      ],
    });
    const sender = await resolver.resolve({ tenantId: "t1", purpose: "transactional" });
    expect(sender?.fromEmail).toBe("auth@demo.mail.uprise.org.au");
  });

  it("prefers the campaign-scoped identity over the tenant default", async () => {
    const { resolver } = build({
      identities: [
        identity({ id: "id_default", fromEmail: "hello@demo.mail.uprise.org.au" }),
        identity({ id: "id_camp", campaignId: "camp_1", fromEmail: "vote@demo.mail.uprise.org.au" }),
      ],
    });
    const sender = await resolver.resolve({ tenantId: "t1", campaignId: "camp_1", purpose: "marketing" });
    expect(sender?.fromEmail).toBe("vote@demo.mail.uprise.org.au");
  });

  it("decrypts the account key and carries provenance ids + subuser", async () => {
    const { resolver } = build({ identities: [identity({})] });
    const sender = await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(sender).toMatchObject({
      apiKey: "dec:sealed",
      fromEmail: "hello@demo.mail.uprise.org.au",
      fromName: "Demo Org",
      subuserUsername: "uprise-demo",
      accountId: "acc_1",
      identityId: "id_1",
    });
  });

  it("PLATFORM-mode accounts resolve with no apiKey (env key used)", async () => {
    const { resolver } = build({
      identities: [identity({})],
      account: { id: "acc_1", mode: "PLATFORM", encryptedApiKey: "x", status: "ACTIVE", subuserUsername: null },
    });
    const sender = await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(sender?.apiKey).toBeUndefined();
    expect(sender?.fromEmail).toBe("hello@demo.mail.uprise.org.au");
  });

  it("returns undefined when the owning account is not ACTIVE", async () => {
    const { resolver } = build({ identities: [identity({})], account: null });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
  });

  it("caches results and invalidate() clears the tenant's entries", async () => {
    const { resolver, prisma } = build({ identities: [identity({})] });
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(prisma.emailSenderIdentity.findMany).toHaveBeenCalledTimes(1);
    resolver.invalidate("t1");
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(prisma.emailSenderIdentity.findMany).toHaveBeenCalledTimes(2);
  });
});
