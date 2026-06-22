import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus, PaymentType, Prisma } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { BillingService } from "./billing.service";
import { assertValidPaymentTransition } from "./payment-state.machine";

export interface RecordPaymentInput {
  tenantId: string;
  amountCents: number;
  currency: string;
  type: PaymentType;
  customerRef?: string;
  networkId?: string;
  providerPaymentId?: string;
  subscriptionId?: string;
  invoiceId?: string;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly webhookEvents: WebhookEventService,
    private readonly billing: BillingService,
    private readonly logger: DomainLogger,
  ) {}

  async recordPayment(input: RecordPaymentInput) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException("amountCents must be a positive integer");
    }
    const currency = input.currency.trim().toUpperCase();
    if (currency.length !== 3) throw new BadRequestException("currency must be a 3-letter code");
    return this.prisma.payment.create({
      data: {
        tenantId: input.tenantId,
        networkId: input.networkId ?? null,
        amountCents: input.amountCents,
        currency,
        type: input.type,
        customerRef: input.customerRef ?? null,
        providerPaymentId: input.providerPaymentId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        invoiceId: input.invoiceId ?? null,
        status: PaymentStatus.RECORDED,
      },
    });
  }

  private async load(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async markProcessing(paymentId: string): Promise<void> {
    const payment = await this.load(paymentId);
    assertValidPaymentTransition(payment.status, PaymentStatus.PROCESSING);
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.PROCESSING } });
  }

  async markSucceeded(paymentId: string): Promise<void> {
    const payment = await this.load(paymentId);
    assertValidPaymentTransition(payment.status, PaymentStatus.SUCCEEDED);
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.SUCCEEDED } });
      await this.outbox.append(tx, {
        tenantId: payment.tenantId,
        eventType: "payment.payment.succeeded",
        aggregateId: paymentId,
        payload: { paymentId, tenantId: payment.tenantId, amountCents: payment.amountCents },
      });
    });
  }

  async markFailed(paymentId: string, reason?: string): Promise<void> {
    const payment = await this.load(paymentId);
    assertValidPaymentTransition(payment.status, PaymentStatus.FAILED);
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.FAILED, failureReason: reason ?? null },
    });
  }

  /**
   * Refund up to the outstanding amount. Faithful port of prog's refund guard:
   * partial → PARTIALLY_REFUNDED, completing → REFUNDED; over-refund is rejected.
   */
  async refund(
    paymentId: string,
    amountCents: number,
    opts: { processorRefundId?: string; reason?: string } = {},
  ): Promise<void> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException("refund amountCents must be a positive integer");
    }
    const payment = await this.load(paymentId);
    const outstanding = payment.amountCents - payment.refundedCents;
    if (amountCents > outstanding) {
      throw new BadRequestException("Refund exceeds the outstanding amount");
    }
    const nextStatus =
      payment.refundedCents + amountCents === payment.amountCents
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    assertValidPaymentTransition(payment.status, nextStatus);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: nextStatus, refundedCents: { increment: amountCents } },
        });
        await tx.refund.create({
          data: {
            paymentId,
            amountCents,
            status: "succeeded",
            processorRefundId: opts.processorRefundId ?? null,
            reason: opts.reason ?? null,
          },
        });
        await this.outbox.append(tx, {
          tenantId: payment.tenantId,
          eventType: "payment.payment.refunded",
          aggregateId: paymentId,
          payload: { paymentId, tenantId: payment.tenantId, amountCents },
        });
      });
    } catch (err) {
      // Duplicate (paymentId, processorRefundId) → this refund is already
      // recorded; the transaction rolled back, so it's an idempotent no-op.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
      throw err;
    }
  }

  // ── Stripe webhook processing ───────────────────────────────────────
  private async resolveByProvider(providerPaymentId: string) {
    return this.prisma.payment.findUnique({ where: { providerPaymentId } });
  }

  async processStripeEvent(event: StripeEvent): Promise<void> {
    if (!(await this.webhookEvents.claim("stripe", event.id))) return; // duplicate
    try {
      await this.dispatchStripeEvent(event);
    } catch (err) {
      // Release the claim so the provider's retry reprocesses — otherwise a
      // transient/ordering error (e.g. charge.refunded before the succeeded
      // event) would silently lose the event. Critical for money.
      await this.webhookEvents.release("stripe", event.id);
      throw err;
    }
  }

  /** Resolve the owning tenant: explicit metadata, else via the Customer projection. */
  private async resolveTenantId(object: Record<string, any>): Promise<string | null> {
    if (object.metadata?.tenantId) return String(object.metadata.tenantId);
    if (object.customer) {
      const customer = await this.prisma.customer.findUnique({
        where: { providerCustomerId: String(object.customer) },
      });
      if (customer?.tenantId) return customer.tenantId;
    }
    return null;
  }

  private async dispatchStripeEvent(event: StripeEvent): Promise<void> {
    const object = event.data?.object ?? {};
    switch (event.type) {
      case "payment_intent.processing": {
        const payment = object.id ? await this.resolveByProvider(object.id) : null;
        if (payment) await this.markProcessing(payment.id);
        break;
      }
      case "payment_intent.succeeded": {
        let payment = object.id ? await this.resolveByProvider(object.id) : null;
        if (!payment) {
          const tenantId = await this.resolveTenantId(object);
          if (!tenantId) {
            // Don't silently drop a real payment — make it auditable.
            this.logger.error("payment", "payment_intent.succeeded with no resolvable tenant — NOT recorded", undefined, {
              eventId: event.id,
              providerPaymentId: object.id,
            });
            return;
          }
          payment = await this.recordPayment({
            tenantId,
            amountCents: Number(object.amount_received ?? object.amount ?? 0),
            currency: String(object.currency ?? "AUD"),
            type: PaymentType.ONE_TIME,
            providerPaymentId: String(object.id),
            customerRef: object.customer ? String(object.customer) : undefined,
          });
        }
        await this.markSucceeded(payment.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const payment = object.id ? await this.resolveByProvider(object.id) : null;
        if (payment) await this.markFailed(payment.id, object.last_payment_error?.message);
        break;
      }
      case "charge.refunded": {
        const piId = object.payment_intent ? String(object.payment_intent) : null;
        const payment = piId ? await this.resolveByProvider(piId) : null;
        if (payment) {
          const refundedTotal = Number(object.amount_refunded ?? 0);
          const delta = refundedTotal - payment.refundedCents;
          if (delta > 0) {
            await this.refund(payment.id, delta, {
              processorRefundId: object.id ? String(object.id) : undefined,
            });
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const tenantId = await this.resolveTenantId(object);
        if (tenantId && object.id) {
          await this.billing.projectSubscription({
            tenantId,
            providerSubscriptionId: String(object.id),
            status: String(object.status ?? "unknown"),
            planName: object.items?.data?.[0]?.price?.nickname ?? null,
            currentPeriodEnd: object.current_period_end ? new Date(Number(object.current_period_end) * 1000) : null,
          });
        } else {
          this.logger.error("payment", "subscription event with no resolvable tenant — skipped", undefined, { eventId: event.id });
        }
        break;
      }
      case "invoice.paid": {
        const tenantId = await this.resolveTenantId(object);
        if (tenantId && object.id) {
          await this.billing.projectInvoice({
            tenantId,
            providerInvoiceId: String(object.id),
            status: String(object.status ?? "paid"),
            amountCents: Number(object.amount_paid ?? object.total ?? 0),
            currency: String(object.currency ?? "AUD"),
          });
        } else {
          this.logger.error("payment", "invoice.paid with no resolvable tenant — skipped", undefined, { eventId: event.id });
        }
        break;
      }
      case "customer.created":
      case "customer.updated":
        if (object.id) {
          await this.billing.projectCustomer({
            providerCustomerId: String(object.id),
            tenantId: object.metadata?.tenantId ? String(object.metadata.tenantId) : null,
            email: object.email ?? null,
          });
        }
        break;
      default:
        this.logger.debug?.("payment", `Unhandled Stripe event ${event.type}`, { eventId: event.id });
        break;
    }
  }
}
