import { EmailService, type SendGridEvent } from "./email.service";

function setup() {
  const prisma: any = {
    emailTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    orgProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    email: {
      create: jest.fn(async ({ data }: any) => ({ id: "em1", openedAt: null, clickedAt: null, ...data })),
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const sendgrid = { send: jest.fn(async () => ({ providerMessageId: "sg1" })) } as any;
  const senderResolver = {
    resolve: jest.fn(async () => undefined),
    invalidate: jest.fn(),
  } as any;
  const outbox = { append: jest.fn() } as any;
  const webhookEvents = { claim: jest.fn(async () => true) } as any;
  const logger = { error: jest.fn() } as any;
  const svc = new EmailService(prisma, sendgrid, senderResolver, outbox, webhookEvents, logger);
  return { svc, prisma, sendgrid, senderResolver, outbox, webhookEvents };
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
    // Second arg = the resolved per-tenant sender; undefined ⇒ platform env sender.
    expect(sendgrid.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.c",
        subject: "Verify your email",
        body: "Your verification code is 123.",
        customArgs: { emailId: "em1" },
      }),
      undefined,
    );
    // SENDING then SENT
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENDING" }) }),
    );
    expect(prisma.email.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: "sg1" }) }),
    );
  });

  it("renders a template's layout into a branded HTML body with a CTA button", async () => {
    const { svc, sendgrid } = setup();
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "invitee@b.c",
      templateKey: "invitation",
      vars: { link: "https://auth.example/invite/tok", tenant: "Common Threads", roleSuffix: " as a Volunteer", expiryNote: "Expires Friday." },
      purpose: "invitation",
    });
    const arg = sendgrid.send.mock.calls[0][0];
    expect(arg.subject).toBe("You've been invited to Common Threads");
    // Branded HTML: framed card, the org wordmark, the CTA button + the link behind it.
    expect(arg.html).toContain("<!doctype html>");
    expect(arg.html).toContain("You're invited to Common Threads");
    expect(arg.html).toContain("Accept invitation");
    expect(arg.html).toContain('href="https://auth.example/invite/tok"');
    expect(arg.html).toContain("Common Threads"); // brand = the tenant var
    expect(arg.html).toContain("Expires Friday.");
    // The plain-text alternative still carries the link for text-only clients.
    expect(arg.body).toContain("https://auth.example/invite/tok");
  });

  it("frames a layout-less template's plain body in the same branded shell", async () => {
    const { svc, sendgrid } = setup();
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "a@b.c",
      templateKey: "receipt",
      vars: { appName: "Uprise", amount: "$40.00" },
      purpose: "receipt",
    });
    const arg = sendgrid.send.mock.calls[0][0];
    expect(arg.html).toContain("<!doctype html>");
    expect(arg.html).toContain("We received your payment of $40.00");
    expect(arg.html).not.toContain("paste this link into your browser"); // no CTA
  });

  it("frames a tenant's DB override (subject/body only) in the branded shell", async () => {
    const { svc, prisma, sendgrid } = setup();
    prisma.emailTemplate.findUnique.mockResolvedValue({
      subject: "Custom subject",
      body: "Custom body line.",
      isActive: true,
    });
    await svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "invitation", vars: {}, purpose: "invitation" });
    const arg = sendgrid.send.mock.calls[0][0];
    expect(arg.subject).toBe("Custom subject");
    expect(arg.html).toContain("Custom body line.");
    expect(arg.html).toContain("<!doctype html>");
  });

  it("styles the email with the sending tenant's brand (name, logo, accent colour)", async () => {
    const { svc, prisma, sendgrid } = setup();
    prisma.orgProfile.findFirst.mockResolvedValue({
      name: "Common Threads",
      logoLandscapeUrl: "https://blob.example/ct-landscape.png",
      logoBlockUrl: "https://blob.example/ct-block.png",
      primaryColour: "#16A34A",
    });
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "invitee@b.c",
      templateKey: "invitation",
      vars: { link: "https://auth.example/invite/tok", tenant: "ignored-by-profile-name" },
      purpose: "invitation",
    });
    const arg = sendgrid.send.mock.calls[0][0];
    expect(arg.html).toContain('<img src="https://blob.example/ct-landscape.png"'); // landscape preferred
    expect(arg.html).toContain('alt="Common Threads"'); // OrgProfile.name wins over vars.tenant
    expect(arg.html).toContain("background:#16A34A"); // brand colour on the button
  });

  it("falls back to the Uprise default frame when the tenant has no OrgProfile", async () => {
    const { svc, sendgrid } = setup(); // orgProfile.findFirst → null by default
    await svc.sendTransactional({
      tenantId: "t1",
      toAddress: "a@b.c",
      templateKey: "invitation",
      vars: { link: "https://auth.example/invite/tok", tenant: "Common Threads" },
      purpose: "invitation",
    });
    const arg = sendgrid.send.mock.calls[0][0];
    expect(arg.html).not.toContain("<img"); // no logo
    expect(arg.html).toContain("background:#2f5bd6"); // default accent
    expect(arg.html).toContain("Common Threads"); // brand = vars.tenant fallback
  });

  it("drops an invalid brand colour and does not fail when the brand lookup throws", async () => {
    const { svc, prisma, sendgrid } = setup();
    prisma.orgProfile.findFirst
      .mockResolvedValueOnce({ name: "T", logoLandscapeUrl: null, logoBlockUrl: null, primaryColour: "not-a-hex" })
      .mockRejectedValueOnce(new Error("db down"));
    // 1) invalid hex → default accent, still sends
    await svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "invitation", vars: { link: "https://x/y" }, purpose: "invitation" });
    expect(sendgrid.send.mock.calls[0][0].html).toContain("background:#2f5bd6");
    // 2) lookup throws → swallowed, send still succeeds on the Uprise fallback
    await expect(
      svc.sendTransactional({ tenantId: "t1", toAddress: "a@b.c", templateKey: "invitation", vars: { link: "https://x/y", tenant: "Fallback Org" }, purpose: "invitation" }),
    ).resolves.toEqual({ id: "em1" });
    expect(sendgrid.send.mock.calls[1][0].html).toContain("Fallback Org");
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
      undefined,
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
