import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentStatus, PaymentType, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { BillingService } from "./billing.service";
import { StripeService } from "./stripe.service";
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
    private readonly config: ConfigService,
    private readonly stripe: StripeService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({ where: { slug }, create: { slug, name: "Default Organization" }, update: {} });
  }

  /** Emit payment.status.changed (recorded/processing/failed — succeeded/refunded have their own). */
  private async emitStatus(tx: Prisma.TransactionClient, paymentId: string, tenantId: string, status: PaymentStatus) {
    await this.outbox.append(tx, {
      tenantId,
      eventType: "payment.status.changed",
      aggregateId: paymentId,
      payload: { paymentId, tenantId, status },
    });
  }

  async recordPayment(input: RecordPaymentInput) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException("amountCents must be a positive integer");
    }
    const currency = input.currency.trim().toUpperCase();
    if (currency.length !== 3) throw new BadRequestException("currency must be a 3-letter code");
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
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
      await this.emitStatus(tx, payment.id, payment.tenantId, PaymentStatus.RECORDED);
      return payment;
    });
  }

  /**
   * Lock + load a payment row inside a transaction (`SELECT … FOR UPDATE`), so a
   * concurrent webhook + manual transition can't both pass the stale-status guard
   * and double-apply (TOCTOU, doc 08). Callers run the guard on the locked row.
   */
  private async lockAndLoad(tx: Prisma.TransactionClient, paymentId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM payment."Payment" WHERE id = ${paymentId} FOR UPDATE`,
    );
    if (locked.length === 0) throw new NotFoundException("Payment not found");
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async markProcessing(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockAndLoad(tx, paymentId);
      assertValidPaymentTransition(payment.status, PaymentStatus.PROCESSING);
      await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.PROCESSING } });
      await this.emitStatus(tx, paymentId, payment.tenantId, PaymentStatus.PROCESSING);
    });
  }

  async markSucceeded(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockAndLoad(tx, paymentId);
      assertValidPaymentTransition(payment.status, PaymentStatus.SUCCEEDED);
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
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockAndLoad(tx, paymentId);
      assertValidPaymentTransition(payment.status, PaymentStatus.FAILED);
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.FAILED, failureReason: reason ?? null },
      });
      await this.emitStatus(tx, paymentId, payment.tenantId, PaymentStatus.FAILED);
    });
  }

  // ── Read queries (prog GetPayment/GetPayments/ListRefunds/GetInvoices/...) ──
  async listPayments(limit = 50) {
    const org = await this.ensureOrganization();
    return this.prisma.payment.findMany({
      where: { tenantId: org.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 200),
    });
  }

  async getPayment(id: string) {
    const org = await this.ensureOrganization();
    const payment = await this.prisma.payment.findFirst({ where: { id, tenantId: org.id } });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async listRefunds(paymentId: string) {
    await this.getPayment(paymentId); // tenant-scopes + 404s
    return this.prisma.refund.findMany({ where: { paymentId }, orderBy: { createdAt: "desc" } });
  }

  async listInvoices() {
    const org = await this.ensureOrganization();
    return this.prisma.invoice.findMany({ where: { tenantId: org.id }, orderBy: { createdAt: "desc" } });
  }

  async listSubscriptions() {
    const org = await this.ensureOrganization();
    return this.prisma.subscription.findMany({ where: { tenantId: org.id }, orderBy: { createdAt: "desc" } });
  }

  async listPaymentMethods() {
    const org = await this.ensureOrganization();
    const customers = await this.prisma.customer.findMany({ where: { tenantId: org.id }, select: { id: true } });
    return this.prisma.paymentMethod.findMany({
      where: { customerId: { in: customers.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Resolve the tenant's Stripe customer, creating + projecting one when absent
   * (EnsureCustomer at checkout, doc 08). Returns undefined when Stripe is
   * unconfigured so checkout can proceed customer-less.
   */
  async ensureCustomer(): Promise<string | undefined> {
    if (!this.stripe.isConfigured()) return undefined;
    const org = await this.ensureOrganization();
    const existing = await this.prisma.customer.findFirst({
      where: { tenantId: org.id },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing.providerCustomerId;
    const created = await this.stripe.createCustomer({
      name: org.name ?? undefined,
      metadata: { tenantId: org.id },
    });
    await this.billing.projectCustomer({ providerCustomerId: created.id, tenantId: org.id });
    return created.id;
  }

  /** The tenant's billing customer, or a 400 when none exists yet. */
  private async requireCustomer() {
    const org = await this.ensureOrganization();
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: org.id },
      orderBy: { createdAt: "asc" },
    });
    if (!customer) throw new BadRequestException("No billing customer for this tenant");
    return customer;
  }

  /** A payment method scoped to the current tenant, or a 404. */
  private async requireTenantPaymentMethod(providerMethodId: string) {
    const org = await this.ensureOrganization();
    const method = await this.prisma.paymentMethod.findUnique({ where: { providerMethodId } });
    if (!method) throw new NotFoundException("Payment method not found");
    const customer = await this.prisma.customer.findFirst({
      where: { id: method.customerId, tenantId: org.id },
    });
    if (!customer) throw new NotFoundException("Payment method not found");
    return { method, customer };
  }

  /** Attach a payment method to the tenant's customer + project it. */
  async attachPaymentMethod(providerMethodId: string): Promise<void> {
    const customer = await this.requireCustomer();
    const res = await this.stripe.attachPaymentMethod({
      paymentMethodId: providerMethodId,
      customerId: customer.providerCustomerId,
    });
    await this.billing.projectPaymentMethod({
      customerId: customer.id,
      providerMethodId: res.id,
      brand: res.brand,
      last4: res.last4,
    });
  }

  /** Detach a payment method from the tenant's customer + drop the projection. */
  async detachPaymentMethod(providerMethodId: string): Promise<void> {
    await this.requireTenantPaymentMethod(providerMethodId);
    await this.stripe.detachPaymentMethod(providerMethodId);
    await this.prisma.paymentMethod.deleteMany({ where: { providerMethodId } });
  }

  /** Set the tenant's default payment method, enforcing one-default-per-customer. */
  async setDefaultPaymentMethod(providerMethodId: string): Promise<void> {
    const { method, customer } = await this.requireTenantPaymentMethod(providerMethodId);
    await this.stripe.setDefaultPaymentMethod({
      customerId: customer.providerCustomerId,
      paymentMethodId: providerMethodId,
    });
    await this.prisma.$transaction([
      this.prisma.paymentMethod.updateMany({
        where: { customerId: method.customerId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.paymentMethod.update({
        where: { providerMethodId },
        data: { isDefault: true },
      }),
    ]);
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
    try {
      await this.prisma.$transaction(async (tx) => {
        const payment = await this.lockAndLoad(tx, paymentId);
        const outstanding = payment.amountCents - payment.refundedCents;
        if (amountCents > outstanding) {
          throw new BadRequestException("Refund exceeds the outstanding amount");
        }
        const nextStatus =
          payment.refundedCents + amountCents === payment.amountCents
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED;
        assertValidPaymentTransition(payment.status, nextStatus);
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
          // Emit for the subscription→tenant reaction (WS2): the projection is the read
          // model; the event is the cross-domain choreography (doc 05).
          await this.prisma.$transaction((tx) =>
            this.outbox.append(tx, {
              tenantId,
              eventType: "payment.subscription.changed",
              aggregateId: String(object.id),
              payload: {
                tenantId,
                networkId: null,
                subscriptionId: String(object.id),
                status: String(object.status ?? "unknown"),
              },
            }),
          );
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
