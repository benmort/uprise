import { TwilioService, toWhatsappAddress, type ResolvedSender } from "./twilio.service";

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

// A config whose get(key, fallback) reads from an explicit env map (nullish → fallback),
// matching the ConfigService seam the service actually calls.
const configFor = (env: Record<string, string>) =>
  ({ get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback) }) as any;

const resetMock = () => {
  clients.clear();
  constructorCalls.length = 0;
};

// The platform client the twilio mock hands the service constructor. Cast to any so
// tests can bolt on the SDK surfaces (messages.page/list, calls, content) the base
// fake omits — getClient() returns this same object reference.
const platformClient = () => clients.get(PLATFORM_SID)! as any;

describe("toWhatsappAddress", () => {
  it("prefixes bare numbers, trims, and passes already-prefixed addresses through", () => {
    expect(toWhatsappAddress("+61400000000")).toBe("whatsapp:+61400000000");
    expect(toWhatsappAddress("whatsapp:+61400000000")).toBe("whatsapp:+61400000000");
    expect(toWhatsappAddress("  +61400  ")).toBe("whatsapp:+61400");
    expect(toWhatsappAddress(null as any)).toBe("whatsapp:");
  });
});

describe("TwilioService credential resolution", () => {
  beforeEach(resetMock);

  it("throws ServiceUnavailable when the platform account is not configured", async () => {
    const service = new TwilioService(configFor({}));
    expect(platformClient()).toBeUndefined(); // no client constructed without creds
    await expect(service.sendMessage("+61400000000", "hi")).rejects.toThrow(
      /Twilio is not configured/,
    );
  });

  it("re-syncs per-account rate overrides onto an existing bucket on the next send", async () => {
    const service = new TwilioService(config);
    clients.set(SUB_SID, {
      messages: { create: jest.fn().mockResolvedValue(createdMessage("SMov")) },
    });
    const s = sender(SUB_SID, { ratePerSecond: 7, maxConcurrent: 9 });
    await service.sendMessage("+61400000000", "one", { sender: s });
    await service.sendMessage("+61400000000", "two", { sender: s });
    const bucket = (service as any).buckets.get(SUB_SID);
    expect(bucket.ratePerSecond).toBe(7);
    expect(bucket.maxConcurrent).toBe(9);
  });

  it("evicts LRU accounts (idle first) once the per-account cache is full", () => {
    const service = new TwilioService(config);
    const buckets = (service as any).buckets as Map<string, any>;
    const clientMap = (service as any).clients as Map<string, any>;
    for (let i = 0; i < 500; i += 1) {
      const key = "AC" + String(i).padStart(32, "0");
      buckets.set(key, {
        ratePerSecond: 1,
        maxConcurrent: 5,
        availableTokens: 1,
        tokenLastRefillAt: 0,
        inFlightSends: i % 7 === 0 ? 1 : 0, // mix of idle + in-flight buckets
        cooldownUntilMs: 0,
        lastUsedAt: i,
      });
      clientMap.set(key, {});
    }
    expect(buckets.size).toBe(500);
    (service as any).evictIdleAccounts();
    expect(buckets.size).toBe(450); // floor(500/10) evicted
    expect(clientMap.size).toBe(450);
  });
});

describe("TwilioService message reads", () => {
  beforeEach(resetMock);

  it("maps a page, clamps pageSize, forwards a pageToken, and parses page tokens", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.messages.page = jest.fn().mockResolvedValue({
      instances: [
        {
          sid: "SMa",
          body: "hi",
          from: "+1",
          to: "+2",
          dateCreated: new Date("2024-01-01T00:00:00Z"),
          dateSent: null,
          dateUpdated: new Date("2024-01-01T00:00:00Z"),
          direction: "outbound-api",
          status: "sent",
          numMedia: 2,
          numSegments: 3,
        },
        {
          sid: "SMb",
          body: null,
          from: "+3",
          to: "+4",
          dateCreated: "2024-02-02T00:00:00Z",
          dateSent: "2024-02-02T01:00:00Z",
          dateUpdated: "2024-02-02T02:00:00Z",
          direction: "inbound",
          status: "received",
        },
      ],
      nextPageUrl: "https://api.twilio.com/Messages?PageSize=50&PageToken=NEXTTOK",
      getPreviousPageUrl: () => "https://api.twilio.com/Messages?PageToken=PREVTOK",
    });

    const res = await service.getMessagesPage({ pageSize: 500, pageToken: "IN" });
    expect(c.messages.page).toHaveBeenCalledWith({ pageSize: 100, pageToken: "IN" });
    expect(res.messages).toHaveLength(2);
    expect(res.messages[0]).toMatchObject({
      sid: "SMa",
      dateSent: null,
      dateCreated: "2024-01-01T00:00:00.000Z",
      numMedia: "2",
      numSegments: "3",
    });
    expect(res.messages[1]).toMatchObject({
      sid: "SMb",
      body: null,
      dateCreated: "2024-02-02T00:00:00Z", // string passthrough (no toISOString)
      dateSent: "2024-02-02T01:00:00Z",
      numMedia: "0",
      numSegments: "0",
    });
    expect(res.nextPageToken).toBe("NEXTTOK");
    expect(res.previousPageToken).toBe("PREVTOK");
  });

  it("falls back to getNextPageUrl() and returns null tokens when no page urls exist", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.messages.page = jest.fn().mockResolvedValue({
      instances: [],
      getNextPageUrl: () => "https://api.twilio.com/Messages?PageToken=NX2",
    });
    const res = await service.getMessagesPage({ pageSize: 0 });
    expect(c.messages.page).toHaveBeenCalledWith({ pageSize: 20 }); // 0 || 20
    expect(res.messages).toEqual([]);
    expect(res.nextPageToken).toBe("NX2");
    expect(res.previousPageToken).toBeNull();
  });

  it("merges to/from history for a number, de-dupes by sid, and sorts ascending", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    const rowA = {
      sid: "A",
      body: "a",
      from: "+2",
      to: "+1",
      dateCreated: new Date("2024-01-03"),
      dateSent: new Date("2024-01-03"),
      dateUpdated: new Date(),
      direction: "outbound-api",
      status: "sent",
    };
    c.messages.list = jest.fn((args: any) =>
      args.to
        ? Promise.resolve([
            rowA,
            {
              sid: "B",
              body: "b",
              from: "+2",
              to: "+1",
              dateCreated: new Date("2024-01-01"),
              dateSent: null,
              dateUpdated: new Date(),
              direction: "inbound",
              status: "received",
            },
          ])
        : Promise.resolve([
            rowA, // duplicate sid — must be skipped by the seen-set
            {
              sid: "C",
              body: "c",
              from: "+1",
              to: "+9",
              dateCreated: new Date("2024-01-02"),
              dateSent: new Date("2024-01-02"),
              dateUpdated: new Date(),
              direction: "outbound-api",
              status: "sent",
            },
          ]),
    );

    const res = await service.getMessagesForPhoneNumber("+1", 999);
    expect(c.messages.list).toHaveBeenCalledWith({ to: "+1", limit: 200 }); // capped at 200
    expect(c.messages.list).toHaveBeenCalledWith({ from: "+1", limit: 200 });
    expect(res.messages.map((m) => m.sid)).toEqual(["B", "C", "A"]);
    expect(res.nextPageToken).toBeNull();
    expect(res.previousPageToken).toBeNull();
  });

  it("keys latest-by-contact on inbound-from / outbound-to and handles date shapes", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.messages.list = jest.fn().mockResolvedValue([
      {
        direction: "inbound",
        from: "+1",
        to: "+2",
        dateSent: new Date("2024-01-05T00:00:00Z"),
        body: "hi",
        status: "received",
      },
      {
        direction: "outbound-api",
        from: "+2",
        to: "+3",
        dateSent: null,
        dateCreated: new Date("2024-01-04T00:00:00Z"),
        body: "yo",
        status: "sent",
      },
      {
        direction: "inbound",
        from: "+4",
        to: "+2",
        dateSent: "2024-01-06T00:00:00Z", // already a string
        body: "s",
        status: "received",
      },
      { direction: "inbound", from: "+5", to: "+2", body: "nodate", status: "received" },
      { direction: undefined, from: "+2", to: "+6", dateSent: new Date("2024-01-07T00:00:00Z") },
      { direction: "inbound", from: "", to: "+2", dateSent: new Date(), body: "skip", status: "x" },
      {
        direction: "inbound",
        from: "+1",
        to: "+2",
        dateSent: new Date("2024-01-08T00:00:00Z"),
        body: "dup",
        status: "received",
      },
    ]);

    const map = await service.getLatestByContact(1000);
    expect(c.messages.list).toHaveBeenCalledWith({ limit: 200 }); // capped
    expect(Object.keys(map).sort()).toEqual(["+1", "+3", "+4", "+5", "+6"]);
    expect(map["+1"]).toEqual({
      direction: "inbound",
      date: "2024-01-05T00:00:00.000Z",
      body: "hi",
      status: "received",
    }); // first-write wins over the later dup
    expect(map["+3"].date).toBe("2024-01-04T00:00:00.000Z"); // falls back to dateCreated
    expect(map["+4"].date).toBe("2024-01-06T00:00:00Z"); // string passthrough
    expect(map["+5"].date).toBe(""); // no date at all
    expect(map["+6"]).toEqual({
      direction: "",
      date: "2024-01-07T00:00:00.000Z",
      body: "",
      status: "",
    }); // undefined direction → outbound → keyed on `to`; ?? "" fallbacks
  });
});

describe("TwilioService WhatsApp content templates", () => {
  beforeEach(resetMock);

  it("returns [] when the Content API surface is absent on the SDK", async () => {
    const service = new TwilioService(config);
    // platform client has no `.content` — defensive early return
    await expect(service.listWhatsappContentTemplates()).resolves.toEqual([]);
  });

  it("maps content-and-approvals rows across SDK shape variants", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.content = {
      v1: {
        contentAndApprovals: {
          list: jest.fn().mockResolvedValue([
            {
              sid: "HX1",
              friendlyName: "Welcome",
              language: "en",
              approvalRequests: { category: "utility", status: "APPROVED" },
              types: { "twilio/text": { body: "Hello {{1}}" } },
              variables: { "1": "name" },
            },
            {
              sid: "HX2",
              friendly_name: "Promo",
              approval_requests: {},
              types: { "whatsapp/card": { body: "Card body" } },
            },
            {
              sid: "HX3",
              types: { "other/kind": { noBody: true } },
              variables: "not-an-object",
            },
            { types: {} },
          ]),
        },
      },
    };

    const rows = await service.listWhatsappContentTemplates();
    expect(c.content.v1.contentAndApprovals.list).toHaveBeenCalledWith({ limit: 200 });
    expect(rows[0]).toEqual({
      contentSid: "HX1",
      friendlyName: "Welcome",
      language: "en",
      category: "UTILITY",
      status: "approved",
      variables: { "1": "name" },
      bodyPreview: "Hello {{1}}",
    });
    expect(rows[1]).toMatchObject({
      contentSid: "HX2",
      friendlyName: "Promo", // friendly_name fallback
      language: "en", // default
      category: "UTILITY", // default
      status: "pending", // default
      variables: null,
      bodyPreview: "Card body", // whatsapp/card fallback
    });
    expect(rows[2]).toMatchObject({
      contentSid: "HX3",
      friendlyName: "HX3", // falls back to sid
      variables: null, // non-object dropped
      bodyPreview: null, // textType has no body
    });
    expect(rows[3]).toMatchObject({
      contentSid: "", // no sid
      friendlyName: "",
      bodyPreview: null, // empty types → null
    });
  });
});

describe("TwilioService WhatsApp sends", () => {
  beforeEach(resetMock);

  it("builds a WhatsApp send from the env from-number with whatsapp: addresses", async () => {
    const service = new TwilioService(configFor({ ...ENV, TWILIO_WHATSAPP_FROM: "+61111" }));
    platformClient().messages.create.mockResolvedValue(createdMessage("WA1"));
    await service.sendMessage("+61400000000", "  hello  ", { channel: "WHATSAPP" });
    const params = platformClient().messages.create.mock.calls[0][0];
    expect(params.to).toBe("whatsapp:+61400000000");
    expect(params.from).toBe("whatsapp:+61111");
    expect(params.body).toBe("hello");
    expect(params.statusCallback).toBe("https://api.test/api/v1/twilio-status-callback");
  });

  it("uses a Content template (contentSid + variables) and media over a plain body", async () => {
    const service = new TwilioService(configFor({ ...ENV, TWILIO_WHATSAPP_FROM: "+61111" }));
    platformClient().messages.create.mockResolvedValue(createdMessage("WA2"));
    await service.sendMessage("+61400000000", "ignored", {
      channel: "WHATSAPP",
      contentSid: "HXtemplate",
      contentVariables: { "1": "Sam" },
      mediaUrl: ["https://media.test/a.jpg"],
    });
    const params = platformClient().messages.create.mock.calls[0][0];
    expect(params.contentSid).toBe("HXtemplate");
    expect(params.contentVariables).toBe(JSON.stringify({ "1": "Sam" }));
    expect(params.mediaUrl).toEqual(["https://media.test/a.jpg"]);
    expect(params.body).toBeUndefined();
  });

  it("addresses a WhatsApp send by messagingServiceSid when the sender provides one", async () => {
    const service = new TwilioService(config);
    clients.set(SUB_SID, {
      messages: { create: jest.fn().mockResolvedValue(createdMessage("WA3")) },
    });
    await service.sendMessage("+61400000000", "hi", {
      channel: "WHATSAPP",
      sender: sender(SUB_SID, { messagingServiceSid: "MGwa" }),
    });
    const params = (clients.get(SUB_SID)! as any).messages.create.mock.calls[0][0];
    expect(params.messagingServiceSid).toBe("MGwa");
    expect(params.from).toBeUndefined();
    expect(params.to).toBe("whatsapp:+61400000000");
  });

  it("throws when WhatsApp has neither a from-number nor a messaging service", async () => {
    const service = new TwilioService(configFor({ ...ENV }));
    await expect(
      service.sendMessage("+61400000000", "hi", { channel: "WHATSAPP" }),
    ).rejects.toThrow(/WhatsApp sender is not configured/);
  });
});

describe("TwilioService status-callback resolution", () => {
  beforeEach(resetMock);

  it("prefers an explicit TWILIO_STATUS_CALLBACK_URL", async () => {
    const service = new TwilioService(
      configFor({ ...ENV, TWILIO_STATUS_CALLBACK_URL: "https://cb.test/explicit" }),
    );
    platformClient().messages.create.mockResolvedValue(createdMessage());
    await service.sendMessage("+61400000000", "hi");
    expect(platformClient().messages.create.mock.calls[0][0].statusCallback).toBe(
      "https://cb.test/explicit",
    );
  });

  it("omits the status callback entirely when no base url is configured", async () => {
    const service = new TwilioService(
      configFor({
        TWILIO_ACCOUNT_SID: PLATFORM_SID,
        TWILIO_AUTH_TOKEN: "t",
        TWILIO_PHONE_NUMBER: "+61468000000",
      }),
    );
    platformClient().messages.create.mockResolvedValue(createdMessage());
    await service.sendMessage("+61400000000", "hi");
    expect(platformClient().messages.create.mock.calls[0][0].statusCallback).toBeUndefined();
  });
});

describe("TwilioService transactional env fallbacks", () => {
  beforeEach(resetMock);

  it("uses TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID with no sender", async () => {
    const service = new TwilioService(
      configFor({ ...ENV, TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID: "MGtx" }),
    );
    platformClient().messages.create.mockResolvedValue(createdMessage());
    await service.sendTransactional("+61400000000", "code");
    const params = platformClient().messages.create.mock.calls[0][0];
    expect(params.messagingServiceSid).toBe("MGtx");
    expect(params.from).toBeUndefined();
  });

  it("uses TWILIO_TRANSACTIONAL_FROM with no sender", async () => {
    const service = new TwilioService(
      configFor({ ...ENV, TWILIO_TRANSACTIONAL_FROM: "+61999" }),
    );
    platformClient().messages.create.mockResolvedValue(createdMessage());
    await service.sendTransactional("+61400000000", "code");
    const params = platformClient().messages.create.mock.calls[0][0];
    expect(params.from).toBe("+61999");
    expect(params.messagingServiceSid).toBeUndefined();
  });

  it("falls back to TWILIO_PHONE_NUMBER when no transactional sender is set", async () => {
    const service = new TwilioService(config);
    platformClient().messages.create.mockResolvedValue(createdMessage());
    await service.sendTransactional("+61400000000", "code");
    expect(platformClient().messages.create.mock.calls[0][0].from).toBe("+61468000000");
  });

  it("throws when nothing addresses a transactional send", async () => {
    const service = new TwilioService(
      configFor({ TWILIO_ACCOUNT_SID: PLATFORM_SID, TWILIO_AUTH_TOKEN: "t" }),
    );
    await expect(service.sendTransactional("+61400000000", "code")).rejects.toThrow(
      /Transactional sender is not configured/,
    );
  });
});

describe("TwilioService placeCall", () => {
  beforeEach(resetMock);

  it("places a call with a url and subscribes to voice status callbacks", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.calls = { create: jest.fn().mockResolvedValue({ sid: "CA1", status: "ringing" }) };
    const res = await service.placeCall({ to: "+61400000000", url: "https://twiml.test/x" });
    const params = c.calls.create.mock.calls[0][0];
    expect(params).toMatchObject({
      to: "+61400000000",
      from: "+61468000000", // falls back to TWILIO_PHONE_NUMBER
      url: "https://twiml.test/x",
      statusCallback: "https://api.test/api/v1/voice-status-callback",
      statusCallbackMethod: "POST",
    });
    expect(params.statusCallbackEvent).toEqual(["initiated", "ringing", "answered", "completed"]);
    expect(params.twiml).toBeUndefined();
    expect(res).toEqual({ sid: "CA1", status: "ringing" });
  });

  it("places a call with inline twiml and defaults status to queued", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.calls = { create: jest.fn().mockResolvedValue({ sid: "CA2" }) };
    const res = await service.placeCall({
      to: "+61400000000",
      from: "+61470000000",
      twiml: "<Response/>",
    });
    const params = c.calls.create.mock.calls[0][0];
    expect(params.from).toBe("+61470000000");
    expect(params.twiml).toBe("<Response/>");
    expect(params.url).toBeUndefined();
    expect(res).toEqual({ sid: "CA2", status: "queued" });
  });

  it("falls back to TWILIO_VOICE_TWIML_URL when no url/twiml is passed", async () => {
    const service = new TwilioService(
      configFor({ ...ENV, TWILIO_VOICE_TWIML_URL: "https://voice.twiml/env" }),
    );
    const c = platformClient();
    c.calls = { create: jest.fn().mockResolvedValue({ sid: "CA3", status: "queued" }) };
    await service.placeCall({ to: "+61400000000" });
    expect(c.calls.create.mock.calls[0][0].url).toBe("https://voice.twiml/env");
  });

  it("prefers an explicit voice status-callback url", async () => {
    const service = new TwilioService(
      configFor({ ...ENV, TWILIO_VOICE_STATUS_CALLBACK_URL: "https://voice.cb/explicit" }),
    );
    const c = platformClient();
    c.calls = { create: jest.fn().mockResolvedValue({ sid: "CA4", status: "queued" }) };
    await service.placeCall({ to: "+61400000000", url: "https://x" });
    expect(c.calls.create.mock.calls[0][0].statusCallback).toBe("https://voice.cb/explicit");
  });

  it("omits the voice status callback when no base url is configured", async () => {
    const service = new TwilioService(
      configFor({
        TWILIO_ACCOUNT_SID: PLATFORM_SID,
        TWILIO_AUTH_TOKEN: "t",
        TWILIO_PHONE_NUMBER: "+61468000000",
      }),
    );
    const c = platformClient();
    c.calls = { create: jest.fn().mockResolvedValue({ sid: "CA5", status: "queued" }) };
    await service.placeCall({ to: "+61400000000", url: "https://x" });
    expect(c.calls.create.mock.calls[0][0].statusCallback).toBeUndefined();
  });

  it("throws when no voice from-number resolves", async () => {
    const service = new TwilioService(
      configFor({ TWILIO_ACCOUNT_SID: PLATFORM_SID, TWILIO_AUTH_TOKEN: "t" }),
    );
    await expect(
      service.placeCall({ to: "+61400000000", url: "https://x" }),
    ).rejects.toThrow(/Voice sender is not configured/);
  });

  it("throws when neither url, twiml, nor TWILIO_VOICE_TWIML_URL is available", async () => {
    const service = new TwilioService(config);
    await expect(
      service.placeCall({ to: "+61400000000", from: "+61470000000" }),
    ).rejects.toThrow(/A voice call requires/);
  });
});

describe("TwilioService error mapping + retry", () => {
  beforeEach(resetMock);

  it("does not retry a non-retryable 4xx (statusCode) and does not arm a cooldown", async () => {
    const service = new TwilioService(config);
    const c = platformClient();
    c.messages.create.mockRejectedValue(Object.assign(new Error("bad"), { statusCode: 400 }));
    await expect(service.sendMessage("+61400000000", "hi")).rejects.toThrow("bad");
    expect(c.messages.create).toHaveBeenCalledTimes(1);
    expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(0);
  });

  it("retries a 5xx without arming the rate-limit cooldown", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      c.messages.create
        .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }))
        .mockResolvedValue(createdMessage("SM5xx"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await expect(p).resolves.toMatchObject({ sid: "SM5xx" });
      expect(c.messages.create).toHaveBeenCalledTimes(2);
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("retries a 408 timeout", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      c.messages.create
        .mockRejectedValueOnce(Object.assign(new Error("t/o"), { status: 408 }))
        .mockResolvedValue(createdMessage("SM408"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await expect(p).resolves.toMatchObject({ sid: "SM408" });
      expect(c.messages.create).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("retries an error with no discernible status (treated as retryable)", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      c.messages.create
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValue(createdMessage("SMnet"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await expect(p).resolves.toMatchObject({ sid: "SMnet" });
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("arms the cooldown from a retry-after header on a 429", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(
          Object.assign(new Error("slow down"), { status: 429, headers: { "retry-after": "3" } }),
        )
        .mockResolvedValue(createdMessage("SMhdr"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 3000);
      expect(c.messages.create).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("parses retry-after out of the error message when no header is present", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(
          Object.assign(new Error("please retry after 5 seconds"), { status: 429 }),
        )
        .mockResolvedValue(createdMessage("SMmsg"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 5000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats Twilio error code 20429 as a rate limit and uses the default cooldown", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(Object.assign(new Error("nope"), { code: 20429 }))
        .mockResolvedValue(createdMessage("SMc1"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 114000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats Twilio error code 14107 as a rate limit", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(Object.assign(new Error("carrier throttle"), { code: 14107 }))
        .mockResolvedValue(createdMessage("SMc2"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 114000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats a rate-limit message (no status/code) as a rate limit", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(new Error("Rate limit exceeded, slow down"))
        .mockResolvedValue(createdMessage("SMtxt"));
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 114000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("arms the transactional cooldown on a rate-limited transactional send", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.messages.create
        .mockRejectedValueOnce(Object.assign(new Error("429"), { status: 429 }))
        .mockResolvedValue(createdMessage("SMtx"));
      const p = service.sendTransactional("+61400000000", "code 123");
      await jest.advanceTimersByTimeAsync(1000);
      await p;
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 114000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("arms the cooldown when a voice call is rate limited", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      const t0 = Date.now();
      c.calls = {
        create: jest
          .fn()
          .mockRejectedValueOnce(Object.assign(new Error("429"), { status: 429 }))
          .mockResolvedValue({ sid: "CAr", status: "queued" }),
      };
      const p = service.placeCall({ to: "+61400000000", url: "https://x" });
      await jest.advanceTimersByTimeAsync(1000);
      await expect(p).resolves.toEqual({ sid: "CAr", status: "queued" });
      expect((service as any).buckets.get(PLATFORM_SID).cooldownUntilMs).toBe(t0 + 114000);
      expect(c.calls.create).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("waits out an already-active cooldown before sending", async () => {
    jest.useFakeTimers();
    try {
      const service = new TwilioService(config);
      const c = platformClient();
      c.messages.create.mockResolvedValue(createdMessage("SMcd"));
      (service as any).bucketFor(); // materialise the platform bucket
      (service as any).buckets.get(PLATFORM_SID).cooldownUntilMs = Date.now() + 200;
      const p = service.sendMessage("+61400000000", "hi");
      await jest.advanceTimersByTimeAsync(500);
      await expect(p).resolves.toMatchObject({ sid: "SMcd" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("TwilioService SMS addressing guards", () => {
  beforeEach(resetMock);

  it("addresses an SMS by messagingServiceSid when the sender provides one", async () => {
    const service = new TwilioService(config);
    clients.set(SUB_SID, {
      messages: { create: jest.fn().mockResolvedValue(createdMessage("SMms")) },
    });
    await service.sendMessage("+61400000000", "hi", {
      sender: sender(SUB_SID, { from: undefined, messagingServiceSid: "MGsms" }),
    });
    const params = (clients.get(SUB_SID)! as any).messages.create.mock.calls[0][0];
    expect(params.messagingServiceSid).toBe("MGsms");
    expect(params.from).toBeUndefined();
    expect(params.to).toBe("+61400000000");
  });

  it("throws when an SMS has no from-number and no TWILIO_PHONE_NUMBER", async () => {
    const service = new TwilioService(
      configFor({
        TWILIO_ACCOUNT_SID: PLATFORM_SID,
        TWILIO_AUTH_TOKEN: "t",
        API_BASE_URL: "https://api.test",
      }),
    );
    await expect(service.sendMessage("+61400000000", "hi")).rejects.toThrow(
      /TWILIO_PHONE_NUMBER is not set/,
    );
  });
});
