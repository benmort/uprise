import { EmailService, type SendGridEvent } from "./email.service";

function setup() {
  const prisma: any = {
    emailTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    email: {
      create: jest.fn(async ({ data }: any) => ({ id: "em1", openedAt: null, clickedAt: null, ...data })),
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const sendgrid = { send: jest.fn(async () => ({ providerMessageId: "sg1" })) } as any;
  const outbox = { append: jest.fn() } as any;
  const webhookEvents = { claim: jest.fn(async () => true) } as any;
  const logger = { error: jest.fn() } as any;
  const svc = new EmailService(prisma, sendgrid, outbox, webhookEvents, logger);
  return { svc, prisma, sendgrid, outbox, webhookEvents };
}

describe("EmailService", () => {
  it("sends a transactional email inline using the built-in template + vars", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "a@b.c",
      templateKey: "verification",
      vars: { code: "123" },
      purpose: "2fa",
    });
    const created = prisma.email.create.mock.calls[0][0].data;
    expect(created.status).toBe("QUEUED");
    expect(created.templateKey).toBe("verification");
    expect(created.purpose).toBe("2fa");
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.queued", aggregateId: "em1" }),
    );
    expect(sendgrid.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.c",
        subject: "Verify your email",
        body: "Your verification code is 123.",
        customArgs: { emailId: "em1" },
      }),
    );
    // SENDING then SENT
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENDING" }) }),
    );
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: "sg1" }) }),
    );
  });

  it("emits sending + sent lifecycle events on a successful send", async () => {
    const { svc, outbox } = setup();
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "a@b.c",
      templateKey: "verification",
      vars: { code: "123" },
      purpose: "2fa",
    });
    const eventTypes = outbox.append.mock.calls.map((c: any[]) => c[1].eventType);
    expect(eventTypes).toEqual(["email.email.queued", "email.email.sending", "email.email.sent"]);
  });

  it("emits email.email.failed on a provider error", async () => {
    const { svc, sendgrid, outbox } = setup();
    sendgrid.send.mockRejectedValue(new Error("sendgrid down"));
    await expect(
      svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "verification", purpose: "x" }),
    ).rejects.toThrow("sendgrid down");
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.failed" }),
    );
  });

  it("sendRaw sends an HTML body and emits the sent event", async () => {
    const { svc, sendgrid, outbox } = setup();
    await svc.sendRaw({
      tenantId: "t1",
      toAddress: "a@b.c",
      subject: "Hello",
      html: "<p>Hi</p>",
      purpose: "receipt",
    });
    expect(sendgrid.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.c", subject: "Hello", html: "<p>Hi</p>" }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.sent" }),
    );
  });

  it("sendRaw requires a body or html", async () => {
    const { svc } = setup();
    await expect(
      svc.sendRaw({ tenantId: "t1", toAddress: "a@b.c", subject: "x", purpose: "y" }),
    ).rejects.toThrow();
  });

  it("webhook: open emits email.email.opened (first write)", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.email.findUnique.mockResolvedValue({
      id: "em1",
      tenantId: "t1",
      toAddress: "a@b.c",
      status: "SENT",
      openedAt: null,
      clickedAt: null,
    });
    await svc.processSendGridEvents([{ event: "open", sg_event_id: "eo", emailId: "em1" }]);
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.opened" }),
    );
  });

  it("webhook: click emits email.email.clicked (first write)", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.email.findUnique.mockResolvedValue({
      id: "em1",
      tenantId: "t1",
      toAddress: "a@b.c",
      status: "DELIVERED",
      openedAt: new Date(),
      clickedAt: null,
    });
    await svc.processSendGridEvents([{ event: "click", sg_event_id: "ec", emailId: "em1" }]);
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.clicked" }),
    );
  });

  it("webhook: delivered emits the event atomically only when the transition applied", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.email.findUnique.mockResolvedValue({
      id: "em1",
      tenantId: "t1",
      toAddress: "a@b.c",
      status: "SENT",
      openedAt: null,
      clickedAt: null,
    });
    await svc.processSendGridEvents([{ event: "delivered", sg_event_id: "ed", emailId: "em1" }]);
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DELIVERED" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.delivered" }),
    );
  });

  it("webhook: a replayed delivered on a terminal email emits no event (no spurious append)", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.email.findUnique.mockResolvedValue({
      id: "em1",
      tenantId: "t1",
      toAddress: "a@b.c",
      status: "BOUNCED", // terminal — DELIVERED transition is illegal
      openedAt: null,
      clickedAt: null,
    });
    await svc.processSendGridEvents([{ event: "delivered", sg_event_id: "ed2", emailId: "em1" }]);
    expect(prisma.email.update).not.toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.email.delivered" }),
    );
  });

  it("rejects an unknown template", async () => {
    const { svc } = setup();
    await expect(
      svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "nope", purpose: "x" }),
    ).rejects.toThrow();
  });

  it("marks FAILED and rethrows on a provider error", async () => {
    const { svc, prisma, sendgrid } = setup();
    sendgrid.send.mockRejectedValue(new Error("sendgrid down"));
    await expect(
      svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "verification", purpose: "x" }),
    ).rejects.toThrow("sendgrid down");
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("webhook: delivered transitions a SENT email to DELIVERED", async () => {
    const { svc, prisma } = setup();
    prisma.email.findUnique.mockResolvedValue({ id: "em1", status: "SENT", openedAt: null, clickedAt: null });
    await svc.processSendGridEvents([{ event: "delivered", sg_event_id: "e1", emailId: "em1" }]);
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "em1" }, data: expect.objectContaining({ status: "DELIVERED" }) }),
    );
  });

  it("webhook: a duplicate (claim=false) is skipped", async () => {
    const { svc, prisma, webhookEvents } = setup();
    webhookEvents.claim.mockResolvedValue(false);
    await svc.processSendGridEvents([{ event: "delivered", sg_event_id: "e1", emailId: "em1" }]);
    expect(prisma.email.findUnique).not.toHaveBeenCalled();
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it("webhook: open is first-write-wins (skips when already opened)", async () => {
    const { svc, prisma } = setup();
    prisma.email.findUnique.mockResolvedValue({ id: "em1", status: "SENT", openedAt: new Date(), clickedAt: null });
    await svc.processSendGridEvents([{ event: "open", sg_event_id: "e2", emailId: "em1" }]);
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it("webhook: a replayed delivered on an already-DELIVERED email is a no-op", async () => {
    const { svc, prisma } = setup();
    prisma.email.findUnique.mockResolvedValue({ id: "em1", status: "DELIVERED", openedAt: null, clickedAt: null });
    await svc.processSendGridEvents([{ event: "delivered", sg_event_id: "e3", emailId: "em1" } as SendGridEvent]);
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it("webhook: resolves by sg_message_id with the .filterN suffix stripped", async () => {
    const { svc, prisma } = setup();
    prisma.email.findFirst.mockResolvedValue({ id: "em9", status: "SENT", openedAt: null, clickedAt: null });
    await svc.processSendGridEvents([{ event: "bounce", sg_event_id: "e4", sg_message_id: "abc.filter0001.16", reason: "bad" }]);
    expect(prisma.email.findFirst).toHaveBeenCalledWith({ where: { providerMessageId: "abc" } });
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "BOUNCED", bounceReason: "bad" }) }),
    );
  });
});
