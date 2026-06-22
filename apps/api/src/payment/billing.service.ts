import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Read-model projections (meld doc 08). Stripe is the source of truth for
 * customers/subscriptions/invoices/payment-methods; these tables are projections
 * kept current from webhook events, upserted by their provider id (idempotent).
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async projectCustomer(input: {
    providerCustomerId: string;
    tenantId?: string | null;
    networkId?: string | null;
    email?: string | null;
  }): Promise<void> {
    await this.prisma.customer.upsert({
      where: { providerCustomerId: input.providerCustomerId },
      create: {
        providerCustomerId: input.providerCustomerId,
        tenantId: input.tenantId ?? null,
        networkId: input.networkId ?? null,
        email: input.email ?? null,
      },
      update: { tenantId: input.tenantId ?? undefined, networkId: input.networkId ?? undefined, email: input.email ?? undefined },
    });
  }

  async projectSubscription(input: {
    tenantId: string;
    providerSubscriptionId: string;
    status: string;
    planName?: string | null;
    currentPeriodEnd?: Date | null;
  }): Promise<void> {
    await this.prisma.subscription.upsert({
      where: { providerSubscriptionId: input.providerSubscriptionId },
      create: {
        tenantId: input.tenantId,
        providerSubscriptionId: input.providerSubscriptionId,
        status: input.status,
        planName: input.planName ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
      },
      update: { status: input.status, planName: input.planName ?? undefined, currentPeriodEnd: input.currentPeriodEnd ?? undefined },
    });
  }

  async projectInvoice(input: {
    tenantId: string;
    providerInvoiceId: string;
    status: string;
    amountCents: number;
    currency: string;
  }): Promise<void> {
    await this.prisma.invoice.upsert({
      where: { providerInvoiceId: input.providerInvoiceId },
      create: {
        tenantId: input.tenantId,
        providerInvoiceId: input.providerInvoiceId,
        status: input.status,
        amountCents: input.amountCents,
        currency: input.currency,
      },
      update: { status: input.status, amountCents: input.amountCents, currency: input.currency },
    });
  }

  async projectPaymentMethod(input: {
    customerId: string;
    providerMethodId: string;
    brand?: string | null;
    last4?: string | null;
    isDefault?: boolean;
  }): Promise<void> {
    await this.prisma.paymentMethod.upsert({
      where: { providerMethodId: input.providerMethodId },
      create: {
        customerId: input.customerId,
        providerMethodId: input.providerMethodId,
        brand: input.brand ?? null,
        last4: input.last4 ?? null,
        isDefault: input.isDefault ?? false,
      },
      update: { brand: input.brand ?? undefined, last4: input.last4 ?? undefined, isDefault: input.isDefault },
    });
  }
}
