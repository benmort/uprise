import { UnauthorizedException } from "@nestjs/common";
import { TelephonyWebhookAuthService } from "./telephony-webhook-auth.service";

const PLATFORM_SID = "AC" + "p".repeat(32);
const SUB_SID = "AC" + "a".repeat(32);

const config = {
  get: jest.fn((key: string, fallback?: string) => {
    if (key === "TWILIO_AUTH_TOKEN") return "platform-token";
    if (key === "TWILIO_ACCOUNT_SID") return PLATFORM_SID;
    return fallback;
  }),
} as any;
const crypto = { decrypt: jest.fn((v: string) => `dec:${v}`) } as any;

function build(rows?: { number?: any; account?: any; run?: any }) {
  const prisma = {
    telephonyPhoneNumber: { findUnique: jest.fn().mockResolvedValue(rows?.number ?? null) },
    telephonyAccount: {
      findFirst: jest.fn().mockResolvedValue(rows?.account ?? null),
      findUnique: jest.fn().mockResolvedValue(rows?.account ?? null),
    },
    telephonyProvisioningRun: { findUnique: jest.fn().mockResolvedValue(rows?.run ?? null) },
  } as any;
  return { svc: new TelephonyWebhookAuthService(prisma, config, crypto), prisma };
}

const accountRow = { id: "acc_1", accountSid: SUB_SID, encryptedAuthToken: "sealed" };
const numberRow = { id: "num_1", tenantId: "t1", campaignId: "camp_1", accountId: "acc_1", phoneNumberE164: "+61485052501" };

describe("TelephonyWebhookAuthService", () => {
  it("inbound to an unknown number falls back to the platform token, no tenant", async () => {
    const { svc } = build();
    expect(await svc.resolveInbound("+61400000000")).toEqual({
      authToken: "platform-token",
      tenantId: null,
      campaignId: null,
    });
  });

  it("inbound to a provisioned number resolves the subaccount token + tenant routing", async () => {
    const { svc } = build({ number: numberRow, account: accountRow });
    expect(await svc.resolveInbound("+61485052501")).toEqual({
      authToken: "dec:sealed",
      tenantId: "t1",
      campaignId: "camp_1",
    });
  });

  it("status callback resolves by AccountSid; platform sid uses env token", async () => {
    const { svc } = build({ account: accountRow });
    expect(await svc.tokenForAccountSid(SUB_SID)).toBe("dec:sealed");
    expect(await svc.tokenForAccountSid(PLATFORM_SID)).toBe("platform-token");
    expect(await svc.tokenForAccountSid(undefined)).toBe("platform-token");
  });

  it("unknown AccountSid falls back to the platform token", async () => {
    const { svc } = build({ account: null });
    expect(await svc.tokenForAccountSid(SUB_SID)).toBe("platform-token");
  });

  it("bundle callback resolves via the run's account", async () => {
    const { svc } = build({ run: { id: "run_1", accountId: "acc_1" }, account: accountRow });
    expect(await svc.tokenForBundleSid("BU123")).toBe("dec:sealed");
  });

  it("unknown bundle falls back to the platform token", async () => {
    const { svc } = build();
    expect(await svc.tokenForBundleSid("BUnope")).toBe("platform-token");
  });

  it("throws when no platform token is configured and nothing resolves", async () => {
    const bare = {
      get: jest.fn(() => ""),
    } as any;
    const { prisma } = build();
    const svc = new TelephonyWebhookAuthService(prisma, bare, crypto);
    await expect(svc.resolveInbound("+61400000000")).rejects.toThrow(UnauthorizedException);
  });
});
