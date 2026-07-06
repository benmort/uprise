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
