import { TransactionalMessagingService } from "./transactional-messaging.service";

function setup() {
  const prisma: any = {
    outboundMessage: {
      create: jest.fn(async ({ data }: any) => ({ id: "om1", ...data })),
      update: jest.fn(async () => ({})),
    },
    messageTemplate: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const twilio = { sendTransactional: jest.fn(async () => ({ sid: "SM1" })) } as any;
  const outbox = { append: jest.fn() } as any;
  const config = {
    get: (key: string, dflt?: string) =>
      key === "TWILIO_TRANSACTIONAL_FROM" ? "+15550000000" : dflt ?? undefined,
  } as any;
  const logger = { error: jest.fn() } as any;
  const svc = new TransactionalMessagingService(prisma, twilio, outbox, config, logger);
  return { svc, prisma, twilio, outbox };
}

describe("TransactionalMessagingService", () => {
  it("sends a transactional SMS unconditionally — no consent/compliance/suppression check", async () => {
    const { svc, prisma, twilio, outbox } = setup();
    // Note: there is NO consent state, opt-in, or suppression setup — and none is
    // consulted. A 2FA code must reach any number.
    await svc.sendSms({
      tenantId: "t1",
      toPhone: "+15551234567",
      body: "Your code is 123",
      purpose: "verification_code",
    });

    const created = prisma.outboundMessage.create.mock.calls[0][0].data;
    expect(created.kind).toBe("TRANSACTIONAL");
    expect(created.txStatus).toBe("PENDING");
    expect(created.purpose).toBe("verification_code");
    expect(created.blastId).toBeUndefined(); // transactional rows are not blast-linked
    expect(created.fromPhone).toBe("+15550000000"); // the TRANSACTIONAL sender, not the marketing number

    expect(twilio.sendTransactional).toHaveBeenCalledWith("+15551234567", "Your code is 123");
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "messaging.tx-sms.requested", aggregateId: "om1" }),
    );
    expect(prisma.outboundMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "om1" },
        data: expect.objectContaining({ txStatus: "SENT", twilioMessageSid: "SM1" }),
      }),
    );
  });

  it("the service takes no consent/compliance dependency (constructor arity)", () => {
    // 5 deps: prisma, twilio, outbox, config, logger — and nothing else.
    expect(TransactionalMessagingService.length).toBe(5);
  });

  it("resolves + renders a template body with vars", async () => {
    const { svc, prisma, twilio } = setup();
    prisma.messageTemplate.findUnique.mockResolvedValue({ body: "Code: {{code}}", isActive: true });
    await svc.sendSms({ tenantId: "t1", toPhone: "+1555", templateKey: "verification_code", vars: { code: "999" }, purpose: "2fa" });
    expect(twilio.sendTransactional).toHaveBeenCalledWith("+1555", "Code: 999");
  });

  it("rejects an unknown/inactive template", async () => {
    const { svc, prisma } = setup();
    prisma.messageTemplate.findUnique.mockResolvedValue(null);
    await expect(
      svc.sendSms({ tenantId: "t1", toPhone: "+1555", templateKey: "nope", purpose: "x" }),
    ).rejects.toThrow();
  });

  it("requires a body or templateKey", async () => {
    const { svc } = setup();
    await expect(svc.sendSms({ tenantId: "t1", toPhone: "+1555", purpose: "x" })).rejects.toThrow();
  });

  it("records FAILED and rethrows when the provider send fails", async () => {
    const { svc, prisma, twilio } = setup();
    twilio.sendTransactional.mockRejectedValue(new Error("twilio down"));
    await expect(
      svc.sendSms({ tenantId: "t1", toPhone: "+1555", body: "hi", purpose: "x" }),
    ).rejects.toThrow("twilio down");
    expect(prisma.outboundMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ txStatus: "FAILED" }) }),
    );
  });

  it("rejects transactional email until the email domain lands (doc 07)", async () => {
    const { svc } = setup();
    await expect(
      svc.sendEmail({ tenantId: "t1", toAddress: "a@b.c", templateKey: "verification", purpose: "x" }),
    ).rejects.toThrow();
  });
});
