import { assertReactionsLoopSafe, type EventEnvelope, type Reaction } from "@yarns/events";
import { buildDomainReactions, type ReactionDeps } from "./domain-reactions";

function setup() {
  const prisma: any = {
    tenantInvitation: { findUnique: jest.fn(async () => ({ id: "inv1", email: "new@x.y", token: "tok123" })) },
    tenant: {
      findUnique: jest.fn(async () => ({ id: "t1", name: "Acme", settings: { foo: 1 } })),
      update: jest.fn(async () => ({})),
    },
  };
  const email = { sendTransactional: jest.fn(async () => ({ id: "e1" })) } as any;
  const stripe = { isConfigured: jest.fn(() => true), createCustomer: jest.fn(async () => ({ id: "cus_1" })) } as any;
  const billing = { projectCustomer: jest.fn(async () => undefined) } as any;
  const config = { get: jest.fn((k: string, fb?: string) => (k === "AUTH_APP_URL" ? "https://auth.test" : fb ?? "")) } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const deps: ReactionDeps = { prisma, email, stripe, billing, config, logger };
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
  return { reactions, byTrigger, ev, prisma, email, stripe, billing };
}

describe("domain reactions", () => {
  it("are loop-safe (no reaction emits its own trigger)", () => {
    const { reactions } = setup();
    expect(reactions).toHaveLength(4);
    expect(() => assertReactionsLoopSafe(reactions)).not.toThrow();
  });

  it("iam.user.created → welcome email", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("iam.user.created").handle(ev({ userId: "u1", email: "a@b.c", tenantId: "t1" }));
    expect(email.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({ toAddress: "a@b.c", templateKey: "welcome", tenantId: "t1" }),
    );
  });

  it("tenant.invitation.sent → invitation email with the token link", async () => {
    const { byTrigger, ev, email } = setup();
    await byTrigger("tenant.invitation.sent").handle(ev({ invitationId: "inv1", tenantId: "t1", email: "new@x.y" }));
    const call = email.sendTransactional.mock.calls[0][0];
    expect(call.templateKey).toBe("invitation");
    expect(call.vars.link).toBe("https://auth.test/invite/tok123");
  });

  it("invitation reaction no-ops when the invite has no token", async () => {
    const { byTrigger, ev, email, prisma } = setup();
    prisma.tenantInvitation.findUnique.mockResolvedValueOnce({ id: "inv1", email: "x@y.z", token: null });
    await byTrigger("tenant.invitation.sent").handle(ev({ invitationId: "inv1", tenantId: "t1", email: "x@y.z" }));
    expect(email.sendTransactional).not.toHaveBeenCalled();
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
