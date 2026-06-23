import type { ConfigService } from "@nestjs/config";
import type { EventEnvelope, Reaction } from "@yarns/events";
import type { PrismaService } from "../../prisma/prisma.service";
import type { EmailService } from "../../email/email.service";
import type { StripeService } from "../../payment/stripe.service";
import type { BillingService } from "../../payment/billing.service";
import type { DomainLogger } from "../logging/domain-logger.service";

/**
 * Cross-domain reactions (meld doc 12 / prog choreography). The outbox/reactions backbone
 * (doc 05) was built but empty; these port prog's 8 reactions. Each is idempotent (the
 * registry dedups per source+event), loop-safe (`emits` declares what it raises and must not
 * include its own trigger), and runs in the worker's domain-events consumer.
 *
 * Deliberately NOT moved to reactions: doc-14's inline magic-link/reset/2fa sends stay inline
 * (request-scoped). These wire only the genuinely event-driven cross-domain effects.
 */
export interface ReactionDeps {
  prisma: PrismaService;
  email: EmailService;
  stripe: StripeService;
  billing: BillingService;
  config: ConfigService;
  logger: DomainLogger;
}

export function buildDomainReactions(deps: ReactionDeps): Reaction[] {
  return [
    welcomeEmailReaction(deps),
    invitationEmailReaction(deps),
    networkCustomerReaction(deps),
    subscriptionTenantReaction(deps),
    paymentReceiptReaction(deps),
    paymentRefundReaction(deps),
  ];
}

/** cents → a "$X.XX"-style display string (currency-agnostic). */
function formatAmount(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

/**
 * Resolve a billing email for a tenant. A customer may be tenant-scoped (created
 * by EnsureCustomer at checkout) OR network-scoped (the network→customer
 * reaction sets networkId only), so fall back to the tenant's network customer.
 * Returns null when no email is on file (the reaction then skips).
 */
async function billingEmailFor(
  prisma: ReactionDeps["prisma"],
  tenantId: string,
): Promise<string | null> {
  const direct = await prisma.customer.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (direct?.email) return direct.email;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { networkId: true },
  });
  if (tenant?.networkId) {
    const networkCustomer = await prisma.customer.findFirst({
      where: { networkId: tenant.networkId },
      orderBy: { createdAt: "asc" },
    });
    if (networkCustomer?.email) return networkCustomer.email;
  }
  return null;
}

/** iam.user.created → welcome email. */
function welcomeEmailReaction({ email }: ReactionDeps): Reaction {
  return {
    trigger: "iam.user.created",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { userId: string; email: string; tenantId: string };
      if (!p?.email || !p.tenantId) return;
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress: p.email,
        templateKey: "welcome",
        vars: { name: p.email, appName: "Foment" },
        purpose: "welcome",
      });
    },
  };
}

/** tenant.invitation.sent → invitation email (loads the token off the invitation). */
function invitationEmailReaction({ prisma, email, config }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.invitation.sent",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { invitationId: string; tenantId: string; email: string };
      const invite = await prisma.tenantInvitation.findUnique({ where: { id: p.invitationId } });
      if (!invite?.token) return;
      const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
      const authAppUrl = config.get<string>("AUTH_APP_URL", "http://localhost:3002").replace(/\/+$/, "");
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress: invite.email,
        templateKey: "invitation",
        vars: { link: `${authAppUrl}/invite/${invite.token}`, tenant: tenant?.name ?? "" },
        purpose: "invitation",
      });
    },
  };
}

/** tenant.network.created → ensure a Stripe customer (the billing boundary). */
function networkCustomerReaction({ stripe, billing, logger }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.network.created",
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { networkId: string; name: string };
      if (!p?.networkId) return;
      if (!stripe.isConfigured()) {
        logger.debug("payment", "Stripe not configured — skipping network customer creation", {
          networkId: p.networkId,
        });
        return;
      }
      const customer = await stripe.createCustomer({ name: p.name, metadata: { networkId: p.networkId } });
      await billing.projectCustomer({ providerCustomerId: customer.id, networkId: p.networkId });
    },
  };
}

/** payment.payment.succeeded → email the billing contact a receipt. */
function paymentReceiptReaction({ prisma, email, logger }: ReactionDeps): Reaction {
  return {
    trigger: "payment.payment.succeeded",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { paymentId: string; tenantId: string; amountCents: number };
      if (!p?.tenantId) return;
      const toAddress = await billingEmailFor(prisma, p.tenantId);
      if (!toAddress) {
        logger.debug("payment", "No billing email on file — skipping receipt", {
          tenantId: p.tenantId,
          paymentId: p.paymentId,
        });
        return;
      }
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress,
        templateKey: "receipt",
        vars: { appName: "Foment", amount: formatAmount(p.amountCents) },
        purpose: "receipt",
      });
    },
  };
}

/** payment.payment.refunded → email the billing contact a refund notice. */
function paymentRefundReaction({ prisma, email, logger }: ReactionDeps): Reaction {
  return {
    trigger: "payment.payment.refunded",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { paymentId: string; tenantId: string; amountCents: number };
      if (!p?.tenantId) return;
      const toAddress = await billingEmailFor(prisma, p.tenantId);
      if (!toAddress) {
        logger.debug("payment", "No billing email on file — skipping refund notice", {
          tenantId: p.tenantId,
          paymentId: p.paymentId,
        });
        return;
      }
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress,
        templateKey: "refund",
        vars: { appName: "Foment", amount: formatAmount(p.amountCents) },
        purpose: "refund",
      });
    },
  };
}

/** payment.subscription.changed → reflect the status onto the tenant. */
function subscriptionTenantReaction({ prisma }: ReactionDeps): Reaction {
  return {
    trigger: "payment.subscription.changed",
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { tenantId: string | null; status: string };
      if (!p?.tenantId) return;
      const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
      if (!tenant) return;
      const settings =
        tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings)
          ? (tenant.settings as Record<string, unknown>)
          : {};
      await prisma.tenant.update({
        where: { id: p.tenantId },
        data: { settings: { ...settings, subscriptionStatus: p.status } },
      });
    },
  };
}
