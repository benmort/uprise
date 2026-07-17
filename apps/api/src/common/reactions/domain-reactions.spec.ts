import { assertReactionsLoopSafe, type EventEnvelope, type Reaction } from "@uprise/events";
import { buildDomainReactions, type ReactionDeps } from "./domain-reactions";

function setup() {
  const prisma: any = {
    tenantInvitation: { findUnique: jest.fn(async () => ({ id: "inv1", email: "new@x.y", token: "tok123" })) },
    tenant: {
      findUnique: jest.fn(async () => ({ id: "t1", name: "Acme", settings: { foo: 1 } })),
      update: jest.fn(async () => ({})),
    },
    customer: { findFirst: jest.fn(async () => ({ id: "c1", email: "billing@x.y" })) },
    tenantMember: { findMany: jest.fn(async () => [{ userId: "org1" }, { userId: "org2" }]) },
    user: {
      findMany: jest.fn(async () => [{ email: "org1@x.y" }, { email: "org2@x.y" }]),
      findUnique: jest.fn(async () => ({ id: "u9", email: "applicant@x.y" })),
    },
    tenantJoinRequest: { findUnique: jest.fn(async () => ({ id: "jr1", userId: "u9", tenantId: "t1" })) },
  };
  const email = { sendTransactional: jest.fn(async () => ({ id: "e1" })) } as any;
  const sms = { sendSms: jest.fn(async () => undefined), sendEmail: jest.fn(async () => undefined) } as any;
  const stripe = { isConfigured: jest.fn(() => true), createCustomer: jest.fn(async () => ({ id: "cus_1" })) } as any;
  const billing = { projectCustomer: jest.fn(async () => undefined) } as any;
  const config = { get: jest.fn((k: string, fb?: string) => (k === "AUTH_APP_URL" ? "https://auth.test" : fb ?? "")) } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const deps: ReactionDeps = { prisma, email, sms, stripe, billing, config, logger };
  const reactions = buildDomainReactions(deps);
  const byTrigger = (t: string) => reactions.find((r) => r.trigger === t) as Reaction;
  const ev = (payload: unknown): EventEnvelope => ({
    id: "evt1",
    eventType: "x",
    tenantId: "t1",
    aggregateId: "a1",
    payload,
    metadata: {},
    occurredAt: "2026-01-01T00:00:00.000Z",
  });
  return { reactions, byTrigger, ev, prisma, email, sms, stripe, billing };
}

describe("domain reactions", () => {
  it("are loop-safe (no reaction emits its own trigger)", () => {
    const { reactions } = setup();
    expect(reactions).toHaveLength(9);
    expect(() => assertReactionsLoopSafe(reactions)).not.toThrow();
  });

  it("tenant.join-request.submitted → emails every organiser", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("tenant.join-request.submitted").handle(
      ev({ tenantId: "t1", email: "prospect@x.y", requestedRole: "volunteer" }),
    );
    expect(email.sendTransactional).toHaveBeenCalledTimes(2);
    expect(email.sendTransactional.mock.calls[0][0].templateKey).toBe("join_request_submitted");
  });

  it("tenant.join-request.approved → emails the applicant with a sign-in link", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("tenant.join-request.approved").handle(ev({ tenantId: "t1", userId: "u9", role: "VOLUNTEER" }));
    const call = email.sendTransactional.mock.calls[0][0];
    expect(call.toAddress).toBe("applicant@x.y");
    expect(call.templateKey).toBe("join_request_approved");
    expect(call.vars.link).toContain("/sign-in");
  });

  it("tenant.join-request.rejected → emails the applicant", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("tenant.join-request.rejected").handle(ev({ requestId: "jr1", tenantId: "t1", userId: "u9" }));
    expect(email.sendTransactional.mock.calls[0][0].templateKey).toBe("join_request_rejected");
  });

  it("payment.payment.succeeded → receipt email to the billing contact", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("payment.payment.succeeded").handle(
      ev({ paymentId: "p1", tenantId: "t1", amountCents: 5000 }),
    );
    expect(email.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: "billing@x.y",
        templateKey: "receipt",
        vars: expect.objectContaining({ amount: "$50.00" }),
      }),
    );
  });

  it("receipt reaction no-ops when no billing email is on file", async () => {
    const { byTrigger, ev, email, prisma } = setup();
    prisma.customer.findFirst.mockResolvedValueOnce(null); // no tenant customer
    prisma.tenant.findUnique.mockResolvedValueOnce({ networkId: null }); // no network either
    await byTrigger("payment.payment.succeeded").handle(
      ev({ paymentId: "p1", tenantId: "t1", amountCents: 5000 }),
    );
    expect(email.sendTransactional).not.toHaveBeenCalled();
  });

  it("receipt reaction falls back to the network-scoped customer email", async () => {
    const { byTrigger, ev, email, prisma } = setup();
    // No tenant-scoped customer, but the tenant's network has one (network→customer reaction).
    prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "cn", email: "network-billing@x.y" });
    prisma.tenant.findUnique.mockResolvedValueOnce({ networkId: "n1" });
    await byTrigger("payment.payment.succeeded").handle(
      ev({ paymentId: "p1", tenantId: "t1", amountCents: 5000 }),
    );
    expect(prisma.customer.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { networkId: "n1" } }),
    );
    expect(email.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({ toAddress: "network-billing@x.y", templateKey: "receipt" }),
    );
  });

  it("payment.payment.refunded → refund email to the billing contact", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("payment.payment.refunded").handle(
      ev({ paymentId: "p1", tenantId: "t1", amountCents: 1500 }),
    );
    expect(email.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: "refund", vars: expect.objectContaining({ amount: "$15.00" }) }),
    );
  });

  it("tenant.signup.pending → SMS every super-admin with a mobile", async () => {
    const { byTrigger, ev, sms, prisma } = setup();
    prisma.user.findMany.mockResolvedValueOnce([
      { id: "sa1", mobile: "+61400000001" },
      { id: "sa2", mobile: "+61400000002" },
    ]);
    await byTrigger("tenant.signup.pending").handle(
      ev({ tenantId: "t1", userId: "u1", email: "owner@x.y", orgName: "Acme", slug: "acme" }),
    );
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
    expect(sms.sendSms.mock.calls[0][0]).toMatchObject({
      tenantId: "t1",
      toPhone: "+61400000001",
      purpose: "signup_pending_admin",
    });
    expect(sms.sendSms.mock.calls[0][0].body).toContain("Acme");
  });

  it("signup-pending reaction no-ops when no super-admin has a mobile", async () => {
    const { byTrigger, ev, sms, prisma } = setup();
    prisma.user.findMany.mockResolvedValueOnce([]);
    await byTrigger("tenant.signup.pending").handle(
      ev({ tenantId: "t1", userId: "u1", email: "owner@x.y", orgName: "Acme", slug: "acme" }),
    );
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("iam.user.created → welcome email", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("iam.user.created").handle(ev({ userId: "u1", email: "a@b.c", tenantId: "t1" }));
    expect(email.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({ toAddress: "a@b.c", templateKey: "welcome", tenantId: "t1" }),
    );
  });

  it("tenant.network.created → Stripe customer + projection (when configured)", async () => {
    const { byTrigger, ev, stripe, billing } = setup();
    await byTrigger("tenant.network.created").handle(ev({ networkId: "n1", name: "Net" }));
    expect(stripe.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Net", metadata: { networkId: "n1" } }),
    );
    expect(billing.projectCustomer).toHaveBeenCalledWith({ providerCustomerId: "cus_1", networkId: "n1" });
  });

  it("network reaction no-ops when Stripe is not configured", async () => {
    const { byTrigger, ev, stripe, billing } = setup();
    stripe.isConfigured.mockReturnValueOnce(false);
    await byTrigger("tenant.network.created").handle(ev({ networkId: "n1", name: "Net" }));
    expect(stripe.createCustomer).not.toHaveBeenCalled();
    expect(billing.projectCustomer).not.toHaveBeenCalled();
  });

  it("payment.subscription.changed → merges status onto tenant settings", async () => {
    const { byTrigger, ev, prisma } = setup();
    await byTrigger("payment.subscription.changed").handle(
      ev({ tenantId: "t1", networkId: null, subscriptionId: "sub_1", status: "active" }),
    );
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { settings: { foo: 1, subscriptionStatus: "active" } },
    });
  });

  it("subscription reaction no-ops with no tenantId", async () => {
    const { byTrigger, ev, prisma } = setup();
    await byTrigger("payment.subscription.changed").handle(ev({ tenantId: null, status: "active" }));
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
