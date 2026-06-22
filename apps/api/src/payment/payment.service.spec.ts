import { PaymentType } from "@yarns/db";
import { PaymentService } from "./payment.service";

function setup(paymentRow?: any) {
  const prisma: any = {
    payment: {
      create: jest.fn(async ({ data }: any) => ({ id: "p1", refundedCents: 0, ...data })),
      findUnique: jest.fn(async () => paymentRow ?? null),
      update: jest.fn(async () => ({})),
    },
    refund: { create: jest.fn() },
    customer: { findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const webhookEvents = { claim: jest.fn(async () => true), release: jest.fn() } as any;
  const billing = { projectSubscription: jest.fn(), projectInvoice: jest.fn(), projectCustomer: jest.fn() } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const svc = new PaymentService(prisma, outbox, webhookEvents, billing, logger);
  return { svc, prisma, outbox, webhookEvents, billing };
}

describe("PaymentService", () => {
  it("recordPayment validates amount + currency and creates a RECORDED payment", async () => {
    const { svc, prisma } = setup();
    await svc.recordPayment({ tenantId: "t1", amountCents: 5000, currency: "aud", type: PaymentType.ONE_TIME });
    const data = prisma.payment.create.mock.calls[0][0].data;
    expect(data.status).toBe("RECORDED");
    expect(data.currency).toBe("AUD");
    await expect(
      svc.recordPayment({ tenantId: "t1", amountCents: 0, currency: "AUD", type: PaymentType.ONE_TIME }),
    ).rejects.toThrow();
    await expect(
      svc.recordPayment({ tenantId: "t1", amountCents: 100, currency: "AUDD", type: PaymentType.ONE_TIME }),
    ).rejects.toThrow();
  });

  it("markSucceeded transitions RECORDED→SUCCEEDED and emits the outbox event", async () => {
    const { svc, prisma, outbox } = setup({ id: "p1", status: "RECORDED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    await svc.markSucceeded("p1");
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "payment.payment.succeeded", aggregateId: "p1" }),
    );
  });

  it("rejects an illegal transition (FAILED→SUCCEEDED)", async () => {
    const { svc } = setup({ id: "p1", status: "FAILED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    await expect(svc.markSucceeded("p1")).rejects.toThrow();
  });

  it("full refund → REFUNDED + Refund row + outbox", async () => {
    const { svc, prisma, outbox } = setup({ id: "p1", status: "SUCCEEDED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    await svc.refund("p1", 1000, { processorRefundId: "re_1" });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED", refundedCents: { increment: 1000 } }) }),
    );
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentId: "p1", amountCents: 1000, status: "succeeded" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "payment.payment.refunded" }),
    );
  });

  it("partial refund → PARTIALLY_REFUNDED", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "SUCCEEDED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    await svc.refund("p1", 400);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_REFUNDED" }) }),
    );
  });

  it("rejects a refund that exceeds the outstanding amount", async () => {
    const { svc } = setup({ id: "p1", status: "SUCCEEDED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    await expect(svc.refund("p1", 1200)).rejects.toThrow();
  });

  it("a completing refund from PARTIALLY_REFUNDED → REFUNDED works", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "PARTIALLY_REFUNDED", amountCents: 1000, refundedCents: 400, tenantId: "t1" });
    await svc.refund("p1", 600);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) }),
    );
  });

  it("a second NON-completing partial refund is allowed (Stripe supports unlimited partials)", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "PARTIALLY_REFUNDED", amountCents: 1000, refundedCents: 400, tenantId: "t1" });
    await svc.refund("p1", 300);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_REFUNDED" }) }),
    );
  });

  it("refund is idempotent on a duplicate (P2002) — no double-count, no throw", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "SUCCEEDED", amountCents: 1000, refundedCents: 0, tenantId: "t1" });
    const { Prisma } = require("@yarns/db");
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6.19.3" }),
    );
    await expect(svc.refund("p1", 500, { processorRefundId: "re_dup" })).resolves.toBeUndefined();
  });

  it("processStripeEvent releases the claim when a handler throws (so the retry reprocesses)", async () => {
    const { svc, prisma, webhookEvents } = setup({ id: "p1", status: "PROCESSING", amountCents: 1000, refundedCents: 0, tenantId: "t1", providerPaymentId: "pi_1" });
    webhookEvents.release = jest.fn();
    // charge.refunded on a PROCESSING payment → refund() FSM-throws → claim released + rethrown.
    await expect(
      svc.processStripeEvent({ id: "evt_x", type: "charge.refunded", data: { object: { id: "ch", payment_intent: "pi_1", amount_refunded: 500 } } }),
    ).rejects.toThrow();
    expect(webhookEvents.release).toHaveBeenCalledWith("stripe", "evt_x");
  });

  it("processStripeEvent does NOT record a payment with no resolvable tenant (logs instead)", async () => {
    const { svc, prisma } = setup(null); // resolveByProvider → null; no metadata.tenantId, no customer
    await svc.processStripeEvent({ id: "evt_y", type: "payment_intent.succeeded", data: { object: { id: "pi_x", amount: 1000, currency: "aud" } } });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("processStripeEvent skips a duplicate (claim=false)", async () => {
    const { svc, prisma, webhookEvents } = setup();
    webhookEvents.claim.mockResolvedValue(false);
    await svc.processStripeEvent({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("processStripeEvent payment_intent.succeeded marks an existing payment SUCCEEDED", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "RECORDED", amountCents: 1000, refundedCents: 0, tenantId: "t1", providerPaymentId: "pi_1" });
    await svc.processStripeEvent({ id: "evt_2", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
  });

  it("processStripeEvent charge.refunded refunds the delta", async () => {
    const { svc, prisma } = setup({ id: "p1", status: "SUCCEEDED", amountCents: 1000, refundedCents: 0, tenantId: "t1", providerPaymentId: "pi_1" });
    await svc.processStripeEvent({
      id: "evt_3",
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 1000 } },
    });
    expect(prisma.refund.create).toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) }),
    );
  });
});
