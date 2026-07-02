import { TwilioService, type ResolvedSender } from "./twilio.service";

// One fake client per accountSid so per-account isolation is observable.
const clients = new Map<string, { messages: { create: jest.Mock } }>();
const constructorCalls: string[] = [];

jest.mock("twilio", () => ({
  __esModule: true,
  default: jest.fn((sid: string) => {
    constructorCalls.push(sid);
    if (!clients.has(sid)) {
      clients.set(sid, { messages: { create: jest.fn() } });
    }
    return clients.get(sid);
  }),
}));

const PLATFORM_SID = "AC" + "p".repeat(32);
const SUB_SID = "AC" + "a".repeat(32);
const SUB_B_SID = "AC" + "b".repeat(32);

const ENV: Record<string, string> = {
  TWILIO_ACCOUNT_SID: PLATFORM_SID,
  TWILIO_AUTH_TOKEN: "platform-token",
  TWILIO_PHONE_NUMBER: "+61468000000",
  API_BASE_URL: "https://api.test",
};

const config = {
  get: jest.fn((key: string, fallback?: string) => ENV[key] ?? fallback),
} as any;

const sender = (sid: string, extra?: Partial<ResolvedSender>): ResolvedSender => ({
  accountSid: sid,
  authToken: "sub-token",
  from: "+61485052501",
  ...extra,
});

function createdMessage(sid = "SM1") {
  return { sid, body: "b", from: "+61485052501", to: "+61400000000", dateCreated: new Date(), dateUpdated: new Date(), direction: "outbound-api", status: "queued", numMedia: "0", numSegments: "1" };
}

describe("TwilioService multi-account", () => {
  let service: TwilioService;

  beforeEach(() => {
    clients.clear();
    constructorCalls.length = 0;
    service = new TwilioService(config);
  });

  it("sends via the platform client when no sender is given (env behaviour unchanged)", async () => {
    clients.get(PLATFORM_SID); // not yet constructed
    // platform client is constructed in the service constructor
    expect(constructorCalls).toEqual([PLATFORM_SID]);
    clients.get(PLATFORM_SID)!.messages.create.mockResolvedValue(createdMessage());
    await service.sendMessage("+61400000000", "hi");
    const params = clients.get(PLATFORM_SID)!.messages.create.mock.calls[0][0];
    expect(params.from).toBe("+61468000000");
    expect(params.statusCallback).toBe("https://api.test/api/v1/twilio-status-callback");
  });

  it("routes a resolved sender to its own cached subaccount client", async () => {
    const s = sender(SUB_SID);
    // pre-seed the fake client the mock will hand back
    clients.set(SUB_SID, { messages: { create: jest.fn().mockResolvedValue(createdMessage("SM2")) } });
    await service.sendMessage("+61400000000", "hi", { sender: s });
    await service.sendMessage("+61400000000", "hi again", { sender: s });
    expect(constructorCalls.filter((c) => c === SUB_SID)).toHaveLength(1); // cached
    const params = clients.get(SUB_SID)!.messages.create.mock.calls[0][0];
    expect(params.from).toBe("+61485052501");
    expect(clients.get(PLATFORM_SID)!.messages.create).not.toHaveBeenCalled();
  });

  it("keeps rate-limit cooldowns isolated per account", async () => {
    const rateErr = Object.assign(new Error("Too Many Requests"), { status: 429 });
    clients.set(SUB_SID, {
      messages: {
        create: jest
          .fn()
          .mockRejectedValueOnce(rateErr)
          .mockResolvedValue(createdMessage("SM3")),
      },
    });
    clients.set(SUB_B_SID, { messages: { create: jest.fn().mockResolvedValue(createdMessage("SM4")) } });

    await service.sendMessage("+61400000000", "hi", { sender: sender(SUB_SID) });

    const buckets = (service as any).buckets as Map<string, { cooldownUntilMs: number }>;
    expect(buckets.get(SUB_SID)!.cooldownUntilMs).toBeGreaterThan(Date.now());

    // account B is unaffected by A's cooldown and sends immediately
    const started = Date.now();
    await service.sendMessage("+61400000000", "hi", { sender: sender(SUB_B_SID) });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(buckets.get(SUB_B_SID)!.cooldownUntilMs).toBe(0);
  });

  it("a sender with a messagingServiceSid addresses by service, not from", async () => {
    clients.set(SUB_SID, { messages: { create: jest.fn().mockResolvedValue(createdMessage("SM5")) } });
    await service.sendTransactional(
      "+61400000000",
      "code 123456",
      sender(SUB_SID, { from: undefined, messagingServiceSid: "MG123" }),
    );
    const params = clients.get(SUB_SID)!.messages.create.mock.calls[0][0];
    expect(params.messagingServiceSid).toBe("MG123");
    expect(params.from).toBeUndefined();
  });

  it("transactional sender does NOT fall back to env from-numbers when a sender is supplied without addressing", async () => {
    clients.set(SUB_SID, { messages: { create: jest.fn() } });
    await expect(
      service.sendTransactional("+61400000000", "code", sender(SUB_SID, { from: undefined })),
    ).rejects.toThrow(/Transactional sender is not configured/);
  });
});
