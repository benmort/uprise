import type { ConfigService } from "@nestjs/config";
import type { EventEnvelope, Reaction } from "@uprise/events";
import type { PrismaService } from "../../prisma/prisma.service";
import type { EmailService } from "../../email/email.service";
import type { TransactionalDispatcher } from "../../messaging/transactional-dispatcher";
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
  sms: TransactionalDispatcher;
  stripe: StripeService;
  billing: BillingService;
  config: ConfigService;
  logger: DomainLogger;
}

export function buildDomainReactions(deps: ReactionDeps): Reaction[] {
  return [
    welcomeEmailReaction(deps),
    signupPendingReaction(deps),
    joinRequestSubmittedReaction(deps),
    joinRequestApprovedReaction(deps),
    joinRequestRejectedReaction(deps),
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
        vars: { name: p.email, appName: "Uprise" },
        purpose: "welcome",
      });
    },
  };
}

/**
 * tenant.signup.pending → SMS every super-admin (with a mobile on file) that a new workspace has
 * signed up and needs approval. Best-effort: a brand-new tenant has no provisioned number, so the
 * transactional dispatcher falls back to the platform sender; a bad number logs and is skipped.
 */
function signupPendingReaction({ prisma, sms, logger }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.signup.pending",
    emits: ["messaging.tx-sms.requested"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { tenantId: string; orgName: string; slug: string; email: string };
      if (!p?.tenantId) return;
      const admins = await prisma.user.findMany({
        where: { isSuperAdmin: true, deletedAt: null, mobile: { not: null } },
        select: { id: true, mobile: true },
      });
      if (admins.length === 0) {
        logger.warn("tenant", "New signup pending approval but no super-admin has a mobile to SMS", {
          tenantId: p.tenantId,
          slug: p.slug,
        });
        return;
      }
      const body =
        `Uprise: new workspace "${p.orgName}" (${p.slug}) signed up and needs approval. ` +
        `Approve it in Admin → Super Admin → Signups.`;
      for (const admin of admins) {
        if (!admin.mobile) continue;
        try {
          await sms.sendSms({ tenantId: p.tenantId, toPhone: admin.mobile, body, purpose: "signup_pending_admin" });
        } catch (err) {
          logger.warn("tenant", "Failed to SMS a super-admin about a pending signup", {
            tenantId: p.tenantId,
            error: String(err),
          });
        }
      }
    },
  };
}

/** tenant.join-request.submitted → notify the tenant's organisers (best-effort). */
function joinRequestSubmittedReaction({ prisma, email }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.join-request.submitted",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { tenantId: string; email: string; requestedRole: string };
      if (!p?.tenantId) return;
      const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
      const organisers = await prisma.tenantMember.findMany({
        where: { tenantId: p.tenantId, role: "ORGANISER" },
      });
      const addresses = (
        await prisma.user.findMany({ where: { id: { in: organisers.map((o) => o.userId) } } })
      )
        .map((u) => u.email)
        .filter((e): e is string => Boolean(e));
      for (const toAddress of addresses) {
        await email.sendTransactional({
          tenantId: p.tenantId,
          toAddress,
          templateKey: "join_request_submitted",
          vars: { tenant: tenant?.name ?? "", email: p.email, requestedRole: p.requestedRole },
          purpose: "join_request_submitted",
        });
      }
    },
  };
}

/** tenant.join-request.approved → tell the applicant they're in (welcome-equivalent). */
function joinRequestApprovedReaction({ prisma, email, config }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.join-request.approved",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { tenantId: string; userId: string };
      if (!p?.tenantId || !p.userId) return;
      const user = await prisma.user.findUnique({ where: { id: p.userId } });
      if (!user?.email) return;
      const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
      const authAppUrl = config.get<string>("AUTH_APP_URL", "http://localhost:3002").replace(/\/+$/, "");
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress: user.email,
        templateKey: "join_request_approved",
        vars: { tenant: tenant?.name ?? "", link: `${authAppUrl}/sign-in` },
        purpose: "join_request_approved",
      });
    },
  };
}

/** tenant.join-request.rejected → notify the applicant (best-effort). */
function joinRequestRejectedReaction({ prisma, email }: ReactionDeps): Reaction {
  return {
    trigger: "tenant.join-request.rejected",
    emits: ["email.email.queued"],
    async handle(event: EventEnvelope): Promise<void> {
      const p = event.payload as { requestId: string; tenantId: string; userId: string };
      if (!p?.tenantId || !p.userId) return;
      const user = await prisma.user.findUnique({ where: { id: p.userId } });
      if (!user?.email) return;
      const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
      await email.sendTransactional({
        tenantId: p.tenantId,
        toAddress: user.email,
        templateKey: "join_request_rejected",
        vars: { tenant: tenant?.name ?? "" },
        purpose: "join_request_rejected",
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
        vars: { appName: "Uprise", amount: formatAmount(p.amountCents) },
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
        vars: { appName: "Uprise", amount: formatAmount(p.amountCents) },
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
