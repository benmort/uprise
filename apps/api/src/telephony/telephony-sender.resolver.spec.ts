import { TelephonySenderResolver } from "./telephony-sender.resolver";

const crypto = { decrypt: jest.fn((v: string) => `dec:${v}`) } as any;
const config = { get: jest.fn() } as any;

function build(overrides?: {
  flagEnabled?: boolean;
  numbers?: any[];
  account?: any;
}) {
  const prisma = {
    telephonyPhoneNumber: {
      findMany: jest.fn().mockResolvedValue(overrides?.numbers ?? []),
      findFirst: jest.fn().mockResolvedValue((overrides?.numbers ?? [])[0] ?? null),
    },
    telephonyAccount: {
      findFirst: jest.fn().mockResolvedValue(
        overrides?.account === undefined
          ? {
              id: "acc_1",
              accountSid: "ACsub",
              encryptedAuthToken: "tok",
              status: "ACTIVE",
              settings: null,
            }
          : overrides.account,
      ),
    },
  } as any;
  const flags = {
    isEnabled: jest.fn().mockResolvedValue(overrides?.flagEnabled ?? true),
  } as any;
  return { resolver: new TelephonySenderResolver(prisma, config, crypto, flags), prisma, flags };
}

const num = (partial: Partial<Record<string, unknown>>) => ({
  id: "num_1",
  tenantId: "t1",
  accountId: "acc_1",
  campaignId: null,
  phoneNumberE164: "+61485052501",
  purpose: "marketing",
  status: "ACTIVE",
  ...partial,
});

describe("TelephonySenderResolver", () => {
  it("returns undefined when the flag is off (env fallback)", async () => {
    const { resolver, prisma } = build({ flagEnabled: false, numbers: [num({})] });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
    expect(prisma.telephonyPhoneNumber.findMany).not.toHaveBeenCalled();
  });

  it("returns undefined for whatsapp (platform-level sender)", async () => {
    const { resolver, prisma } = build({ numbers: [num({})] });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "whatsapp" })).toBeUndefined();
    expect(prisma.telephonyPhoneNumber.findMany).not.toHaveBeenCalled();
  });

  it("returns undefined when the tenant has no active numbers", async () => {
    const { resolver } = build({ numbers: [] });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
  });

  it("prefers the campaign-scoped number over the tenant default", async () => {
    const { resolver } = build({
      numbers: [
        num({ id: "n_default", phoneNumberE164: "+61400000001" }),
        num({ id: "n_campaign", campaignId: "camp_1", phoneNumberE164: "+61400000002" }),
      ],
    });
    const sender = await resolver.resolve({ tenantId: "t1", campaignId: "camp_1", purpose: "marketing" });
    expect(sender?.from).toBe("+61400000002");
  });

  it("prefers a purpose-matched tenant default over the first default", async () => {
    const { resolver } = build({
      numbers: [
        num({ id: "n_marketing", purpose: "marketing", phoneNumberE164: "+61400000001" }),
        num({ id: "n_tx", purpose: "transactional", phoneNumberE164: "+61400000003" }),
      ],
    });
    const sender = await resolver.resolve({ tenantId: "t1", purpose: "transactional" });
    expect(sender?.from).toBe("+61400000003");
  });

  it("decrypts the account token and carries rate overrides from settings", async () => {
    const { resolver } = build({
      numbers: [num({})],
      account: {
        id: "acc_1",
        accountSid: "ACsub",
        encryptedAuthToken: "sealed",
        status: "ACTIVE",
        settings: { sendRatePerSecond: 3, maxConcurrent: 9 },
      },
    });
    const sender = await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(sender).toMatchObject({
      accountSid: "ACsub",
      authToken: "dec:sealed",
      from: "+61485052501",
      ratePerSecond: 3,
      maxConcurrent: 9,
    });
  });

  it("returns undefined when the owning account is not ACTIVE", async () => {
    const { resolver } = build({ numbers: [num({})], account: null });
    expect(await resolver.resolve({ tenantId: "t1", purpose: "marketing" })).toBeUndefined();
  });

  it("caches results and invalidate() clears the tenant's entries", async () => {
    const { resolver, prisma } = build({ numbers: [num({})] });
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(prisma.telephonyPhoneNumber.findMany).toHaveBeenCalledTimes(1);
    resolver.invalidate("t1");
    await resolver.resolve({ tenantId: "t1", purpose: "marketing" });
    expect(prisma.telephonyPhoneNumber.findMany).toHaveBeenCalledTimes(2);
  });

  it("resolveByNumber matches only ACTIVE tenant numbers", async () => {
    const { resolver, prisma } = build({ numbers: [num({})] });
    const sender = await resolver.resolveByNumber("t1", "+61485052501");
    expect(sender?.from).toBe("+61485052501");
    prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(null);
    expect(await resolver.resolveByNumber("t1", "+61499999999")).toBeUndefined();
  });

  it("resolveByNumberId resolves the chosen number's sender and caches it", async () => {
    const { resolver, prisma } = build({ numbers: [num({ id: "num_pick" })] });
    const sender = await resolver.resolveByNumberId("t1", "num_pick");
    expect(sender).toMatchObject({ accountSid: "ACsub", authToken: "dec:tok", from: "+61485052501" });
    // Second call served from cache — no extra DB read.
    await resolver.resolveByNumberId("t1", "num_pick");
    expect(prisma.telephonyPhoneNumber.findFirst).toHaveBeenCalledTimes(1);
  });

  it("resolveByNumberId returns undefined when the flag is off", async () => {
    const { resolver, prisma } = build({ flagEnabled: false, numbers: [num({})] });
    expect(await resolver.resolveByNumberId("t1", "num_1")).toBeUndefined();
    expect(prisma.telephonyPhoneNumber.findFirst).not.toHaveBeenCalled();
  });

  it("resolveByNumberId returns undefined when the id is not an ACTIVE tenant number", async () => {
    const { resolver, prisma } = build({ numbers: [] });
    prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(null);
    expect(await resolver.resolveByNumberId("t1", "missing")).toBeUndefined();
  });
});
