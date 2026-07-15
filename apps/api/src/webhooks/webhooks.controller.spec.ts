import { WebhooksController } from "./webhooks.controller";

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

describe("WebhooksController.inboundTextMessage — tenant fail-closed", () => {
  const inbox = { recordInbound: jest.fn().mockResolvedValue(undefined) } as any;
  const telephonyAuth = { resolveInbound: jest.fn() } as any;

  function makeController() {
    const c = new WebhooksController(
      {} as any, // config
      inbox,
      {} as any, // blasts
      {} as any, // email
      {} as any, // payment
      {} as any, // stripe
      {} as any, // calls
      telephonyAuth,
      {} as any, // telephonyProvisioning
      {} as any, // webhookEvents
      {} as any, // sendgridService
      {} as any, // emailWebhookAuth
    );
    // Signature validation is exercised by telephony-webhook-auth.service.spec;
    // bypass it here so these tests isolate the tenant-routing branch.
    (c as any).validateTwilioSignature = jest.fn();
    return c;
  }

  const req = { headers: {}, protocol: "https", get: () => "example.com", originalUrl: "/hook" } as any;

  beforeEach(() => jest.clearAllMocks());

  it("drops an inbound to an unprovisioned number: no recordInbound, empty TWIML", async () => {
    telephonyAuth.resolveInbound.mockResolvedValue({ authToken: "tok", tenantId: null, campaignId: null });

    const out = await makeController().inboundTextMessage(
      { From: "+61400000001", To: "+61400000000", Body: "hi", MessageSid: "SM1" },
      req,
    );

    expect(out).toBe(TWIML_EMPTY);
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("records an inbound to a provisioned number with its tenantId", async () => {
    telephonyAuth.resolveInbound.mockResolvedValue({ authToken: "tok", tenantId: "t1", campaignId: null });

    const out = await makeController().inboundTextMessage(
      { From: "+61400000001", To: "+61400000000", Body: "hi", MessageSid: "SM1" },
      req,
    );

    expect(out).toBe(TWIML_EMPTY);
    expect(inbox.recordInbound).toHaveBeenCalledTimes(1);
    expect(inbox.recordInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "+61400000001",
        to: "+61400000000",
        body: "hi",
        messageSid: "SM1",
        tenantId: "t1",
      }),
    );
  });
});

describe("WebhooksController.voiceOutbound", () => {
  const calls = {
    startBrowserCall: jest.fn().mockResolvedValue({ twiml: "<Response><Dial>+61400000999</Dial></Response>" }),
  } as any;
  const telephonyAuth = { tokenForAccountSid: jest.fn().mockResolvedValue("tok") } as any;
  const req = { headers: {}, protocol: "https", get: () => "example.com", originalUrl: "/hook" } as any;

  function makeController() {
    const c = new WebhooksController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      calls,
      telephonyAuth,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (c as any).validateTwilioSignature = jest.fn();
    return c;
  }

  beforeEach(() => jest.clearAllMocks());

  it("derives the tenant from the client identity and returns the dial TwiML", async () => {
    const out = await makeController().voiceOutbound(
      { To: "+61400000999", From: "client:uUSER1.tTEN1", AccountSid: "AC1", contactId: "ct1" },
      req,
    );
    expect(calls.startBrowserCall).toHaveBeenCalledWith({
      tenantId: "TEN1",
      toNumber: "+61400000999",
      contactId: "ct1",
      accountSid: "AC1",
    });
    expect(out).toContain("<Dial");
  });

  it("returns a spoken apology (no bridge) for an invalid To", async () => {
    const out = await makeController().voiceOutbound({ To: "not-a-number", From: "client:uU.tTEN1" }, req);
    expect(calls.startBrowserCall).not.toHaveBeenCalled();
    expect(out).toContain("could not place this call");
  });
});

describe("WebhooksController.voiceRecordingCallback", () => {
  const calls = { processRecordingCallback: jest.fn().mockResolvedValue(undefined) } as any;
  const telephonyAuth = { tokenForAccountSid: jest.fn().mockResolvedValue("tok") } as any;
  const req = { headers: {}, protocol: "https", get: () => "example.com", originalUrl: "/hook" } as any;

  function makeController() {
    const c = new WebhooksController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      calls,
      telephonyAuth,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (c as any).validateTwilioSignature = jest.fn();
    return c;
  }

  beforeEach(() => jest.clearAllMocks());

  it("validates the account-signed request and binds the recording URL", async () => {
    const out = await makeController().voiceRecordingCallback(
      { CallSid: "CA1", RecordingUrl: "https://rec/1", RecordingStatus: "completed", AccountSid: "AC1" },
      req,
    );

    expect(out).toBe(TWIML_EMPTY);
    expect(telephonyAuth.tokenForAccountSid).toHaveBeenCalledWith("AC1");
    expect(calls.processRecordingCallback).toHaveBeenCalledWith(
      { callSid: "CA1", recordingUrl: "https://rec/1" },
      undefined,
    );
  });
});
