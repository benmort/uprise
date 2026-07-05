import { BadRequestException, Injectable, type OnModuleInit } from "@nestjs/common";
import { EmailStatus, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { SendGridService } from "./sendgrid.service";
import { EmailSenderResolver, type EmailSendPurpose } from "./email-sender.resolver";
import { DEFAULT_EMAIL_TEMPLATES } from "./email-templates";
import { assertValidEmailTransition, canTransitionEmail } from "./email-state.machine";

export interface SendTransactionalEmailInput {
  tenantId: string;
  toAddress: string;
  templateKey: string;
  vars?: Record<string, string>;
  purpose: string;
  contactId?: string;
  /** Campaign-scoped sender identity resolution (per-tenant email identities). */
  campaignId?: string | null;
  /** Sender-resolution purpose; defaults to "transactional" (platform sender). */
  sendPurpose?: EmailSendPurpose;
}

export interface SendGridEvent {
  event: string; // delivered | bounce | dropped | open | click | ...
  sg_event_id?: string;
  sg_message_id?: string;
  reason?: string;
  emailId?: string; // our custom_arg, echoed back by SendGrid
  [key: string]: unknown;
}

/**
 * Transactional email (meld doc 07) — the email counterpart of TransactionalMessagingService
 * (transactional SMS, doc 06). Like that service, it DELIBERATELY takes no
 * consent/compliance/suppression dependency: a verification code, magic-link, or
 * receipt is legally service mail and must always send. Marketing/bulk email is a
 * separate future domain (the email analogue of blasts).
 */
@Injectable()
export class EmailService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendgrid: SendGridService,
    private readonly senderResolver: EmailSenderResolver,
    private readonly outbox: OutboxService,
    private readonly webhookEvents: WebhookEventService,
    private readonly logger: DomainLogger,
  ) {}

  /** Scream at boot if a deploy is missing transactional-email config, so a prod
   *  where magic links / resets / verification silently fail is visible in the
   *  startup logs rather than only when a user reports "no email". */
  onModuleInit(): void {
    const h = this.emailHealth();
    if (!h.ready) {
      this.logger.warn(
        "email",
        "Transactional email is NOT fully configured — magic links, password resets and verification emails will fail to send (via the platform sender). Set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL (and verify the sender in SendGrid).",
        { apiKeyConfigured: h.apiKeyConfigured, fromEmail: h.fromEmail },
      );
    }
  }

  /** Transactional-email health for ops (GET /email/health): is the platform
   *  SendGrid sender usable end-to-end? Never returns the API key. */
  emailHealth(): { ready: boolean; apiKeyConfigured: boolean; fromEmail: string | null } {
    const c = this.sendgrid.platformConfig();
    return { ready: c.apiKeyConfigured && Boolean(c.fromEmail), apiKeyConfigured: c.apiKeyConfigured, fromEmail: c.fromEmail || null };
  }

  private render(template: string, vars?: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars?.[key] ?? "");
  }

  private async resolveTemplate(tenantId: string, key: string): Promise<{ subject: string; body: string }> {
    const db = await this.prisma.emailTemplate.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (db && db.isActive) return { subject: db.subject, body: db.body };
    const def = DEFAULT_EMAIL_TEMPLATES[key];
    if (!def) throw new BadRequestException(`Unknown email template: ${key}`);
    return def;
  }

  /** Transactional email (verification, magic-link, receipts), sent inline. */
  async sendTransactional(input: SendTransactionalEmailInput): Promise<{ id: string }> {
    const template = await this.resolveTemplate(input.tenantId, input.templateKey);
    const subject = this.render(template.subject, input.vars);
    const body = this.render(template.body, input.vars);
    return this.runEmailSend(
      {
        tenantId: input.tenantId,
        toAddress: input.toAddress,
        subject,
        contactId: input.contactId,
        purpose: input.purpose,
        templateKey: input.templateKey,
        campaignId: input.campaignId,
        sendPurpose: input.sendPurpose,
      },
      (emailId, sender) =>
        this.sendgrid.send({ to: input.toAddress, subject, body, customArgs: { emailId } }, sender),
    );
  }

  /** Ad-hoc email with a caller-supplied subject + text and/or HTML body (no stored template). */
  async sendRaw(input: {
    tenantId: string;
    toAddress: string;
    subject: string;
    body?: string;
    html?: string;
    purpose: string;
    contactId?: string;
    campaignId?: string | null;
    sendPurpose?: EmailSendPurpose;
  }): Promise<{ id: string }> {
    if (!input.body && !input.html) {
      throw new BadRequestException("sendRaw requires a body or html");
    }
    return this.runEmailSend(
      {
        tenantId: input.tenantId,
        toAddress: input.toAddress,
        subject: input.subject,
        contactId: input.contactId,
        purpose: input.purpose,
        campaignId: input.campaignId,
        sendPurpose: input.sendPurpose,
      },
      (emailId, sender) =>
        this.sendgrid.send(
          {
            to: input.toAddress,
            subject: input.subject,
            body: input.body,
            html: input.html,
            customArgs: { emailId },
          },
          sender,
        ),
    );
  }

  /** Convenience: an HTML email (delegates to sendRaw). */
  async sendHtml(input: {
    tenantId: string;
    toAddress: string;
    subject: string;
    html: string;
    purpose: string;
    contactId?: string;
    campaignId?: string | null;
    sendPurpose?: EmailSendPurpose;
  }): Promise<{ id: string }> {
    return this.sendRaw(input);
  }

  /**
   * Shared lifecycle: QUEUED → SENDING → SENT|FAILED, each transition emitting its
   * durable event (doc 05/07). The `send` thunk performs the provider call.
   */
  private async runEmailSend(
    meta: {
      tenantId: string;
      toAddress: string;
      subject: string;
      contactId?: string | null;
      purpose: string;
      templateKey?: string | null;
      campaignId?: string | null;
      sendPurpose?: EmailSendPurpose;
    },
    send: (
      emailId: string,
      sender: Awaited<ReturnType<EmailSenderResolver["resolve"]>>,
    ) => Promise<{ providerMessageId: string }>,
  ): Promise<{ id: string }> {
    const { tenantId, toAddress } = meta;
    // Per-tenant sender identity (undefined ⇒ platform env sender). Provenance
    // is stamped on the row so webhook key resolution matches the account that
    // ACTUALLY sent this email.
    const sender = await this.senderResolver.resolve({
      tenantId,
      campaignId: meta.campaignId ?? null,
      purpose: meta.sendPurpose ?? "transactional",
    });
    const email = await this.prisma.$transaction(async (tx) => {
      const created = await tx.email.create({
        data: {
          tenantId,
          contactId: meta.contactId ?? null,
          toAddress,
          subject: meta.subject,
          status: EmailStatus.QUEUED,
          templateKey: meta.templateKey ?? null,
          purpose: meta.purpose,
          emailAccountId: sender?.accountId ?? null,
          senderIdentityId: sender?.identityId ?? null,
          fromEmail: sender?.fromEmail ?? null,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "email.email.queued",
        aggregateId: created.id,
        payload: { emailId: created.id, tenantId, toAddress },
      });
      return created;
    });

    assertValidEmailTransition(EmailStatus.QUEUED, EmailStatus.SENDING);
    await this.prisma.$transaction(async (tx) => {
      await tx.email.update({ where: { id: email.id }, data: { status: EmailStatus.SENDING } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "email.email.sending",
        aggregateId: email.id,
        payload: { emailId: email.id, tenantId, toAddress },
      });
    });
    try {
      const { providerMessageId } = await send(email.id, sender);
      assertValidEmailTransition(EmailStatus.SENDING, EmailStatus.SENT);
      await this.prisma.$transaction(async (tx) => {
        await tx.email.update({
          where: { id: email.id },
          data: { status: EmailStatus.SENT, providerMessageId: providerMessageId || null },
        });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "email.email.sent",
          aggregateId: email.id,
          payload: { emailId: email.id, tenantId, toAddress },
        });
      });
    } catch (err) {
      await this.prisma.$transaction(async (tx) => {
        await tx.email.update({
          where: { id: email.id },
          data: { status: EmailStatus.FAILED, errorMessage: String(err) },
        });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "email.email.failed",
          aggregateId: email.id,
          payload: { emailId: email.id, tenantId, toAddress, reason: String(err) },
        });
      });
      this.logger.error("email", "Transactional email send failed", undefined, {
        emailId: email.id,
        error: String(err),
      });
      throw err;
    }
    return { id: email.id };
  }

  // ── SendGrid webhook processing ─────────────────────────────────────
  /** Whether SendGrid signed-webhook verification is configured. */
  isWebhookVerificationConfigured(): boolean {
    return this.sendgrid.isWebhookVerificationConfigured();
  }

  /** Verify a SendGrid signed-event-webhook request (ECDSA over timestamp+payload). */
  verifyEventWebhookSignature(rawPayload: string, signature: string, timestamp: string): boolean {
    return this.sendgrid.verifyEventWebhookSignature(rawPayload, signature, timestamp);
  }

  /** SendGrid event timestamp (epoch seconds) → Date, else now (avoids retry-time skew). */
  private eventTime(event: SendGridEvent): Date {
    const ts = Number((event as { timestamp?: unknown }).timestamp);
    return Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date();
  }

  private stripFilter(sgMessageId: string): string {
    // SendGrid appends ".filterN.NNNN" to sg_message_id on some events.
    const dot = sgMessageId.indexOf(".");
    return dot >= 0 ? sgMessageId.slice(0, dot) : sgMessageId;
  }

  private async resolveEmail(event: SendGridEvent) {
    if (event.emailId) return this.prisma.email.findUnique({ where: { id: event.emailId } });
    if (event.sg_message_id) {
      return this.prisma.email.findFirst({
        where: { providerMessageId: this.stripFilter(event.sg_message_id) },
      });
    }
    return null;
  }

  /**
   * Apply a status transition inside the caller's transaction and report whether
   * it actually moved (an illegal/terminal move is a no-op → false). Returning the
   * applied flag lets the caller emit the lifecycle event ONLY when the state
   * truly changed, keeping the write + event atomic and never emitting a spurious
   * event for a rejected transition.
   */
  private async transitionTx(
    tx: Prisma.TransactionClient,
    emailId: string,
    from: EmailStatus,
    to: EmailStatus,
    extra: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (!canTransitionEmail(from, to)) return false;
    await tx.email.update({ where: { id: emailId }, data: { status: to, ...extra } });
    return true;
  }

  async processSendGridEvents(events: SendGridEvent[]): Promise<void> {
    for (const event of events) {
      const eventId = event.sg_event_id ?? "";
      if (eventId && !(await this.webhookEvents.claim("sendgrid", eventId))) continue; // duplicate
      try {
        await this.applySendGridEvent(event);
      } catch (err) {
        // Release the claim so SendGrid's retry reprocesses this event.
        await this.webhookEvents.release("sendgrid", eventId);
        throw err;
      }
    }
  }

  private async applySendGridEvent(event: SendGridEvent): Promise<void> {
    {
      const email = await this.resolveEmail(event);
      if (!email) return;
      switch (event.event) {
        case "delivered":
          await this.prisma.$transaction(async (tx) => {
            const applied = await this.transitionTx(tx, email.id, email.status, EmailStatus.DELIVERED);
            if (!applied) return; // illegal/terminal move — no state change, no event
            await this.outbox.append(tx, {
              tenantId: email.tenantId,
              eventType: "email.email.delivered",
              aggregateId: email.id,
              payload: { emailId: email.id, tenantId: email.tenantId, toAddress: email.toAddress },
            });
          });
          break;
        case "bounce":
          await this.prisma.$transaction(async (tx) => {
            const applied = await this.transitionTx(tx, email.id, email.status, EmailStatus.BOUNCED, {
              bounceReason: String(event.reason ?? ""),
            });
            if (!applied) return;
            await this.outbox.append(tx, {
              tenantId: email.tenantId,
              eventType: "email.email.bounced",
              aggregateId: email.id,
              payload: {
                emailId: email.id,
                tenantId: email.tenantId,
                toAddress: email.toAddress,
                reason: String(event.reason ?? ""),
              },
            });
          });
          break;
        case "dropped":
          await this.prisma.$transaction(async (tx) => {
            const applied = await this.transitionTx(tx, email.id, email.status, EmailStatus.FAILED, {
              errorMessage: String(event.reason ?? "dropped"),
            });
            if (!applied) return;
            await this.outbox.append(tx, {
              tenantId: email.tenantId,
              eventType: "email.email.failed",
              aggregateId: email.id,
              payload: {
                emailId: email.id,
                tenantId: email.tenantId,
                toAddress: email.toAddress,
                reason: String(event.reason ?? "dropped"),
              },
            });
          });
          break;
        case "open":
          if (!email.openedAt) {
            await this.prisma.$transaction(async (tx) => {
              await tx.email.update({ where: { id: email.id }, data: { openedAt: this.eventTime(event) } });
              await this.outbox.append(tx, {
                tenantId: email.tenantId,
                eventType: "email.email.opened",
                aggregateId: email.id,
                payload: { emailId: email.id, tenantId: email.tenantId, toAddress: email.toAddress },
              });
            });
          }
          break;
        case "click":
          if (!email.clickedAt) {
            await this.prisma.$transaction(async (tx) => {
              await tx.email.update({ where: { id: email.id }, data: { clickedAt: this.eventTime(event) } });
              await this.outbox.append(tx, {
                tenantId: email.tenantId,
                eventType: "email.email.clicked",
                aggregateId: email.id,
                payload: { emailId: email.id, tenantId: email.tenantId, toAddress: email.toAddress },
              });
            });
          }
          break;
        default:
          break;
      }
    }
  }

  // ── Reads + per-tenant template management (WS3) ──────────────────────
  async getEmail(tenantId: string, id: string) {
    const email = await this.prisma.email.findFirst({ where: { id, tenantId } });
    if (!email) throw new BadRequestException("Email not found");
    return email;
  }

  listTemplates(tenantId: string) {
    return this.prisma.emailTemplate.findMany({ where: { tenantId }, orderBy: { key: "asc" } });
  }

  getTemplate(tenantId: string, key: string) {
    return this.prisma.emailTemplate.findUnique({ where: { tenantId_key: { tenantId, key } } });
  }

  /** Create or update a per-tenant template override (replaces the built-in default for that key). */
  upsertTemplate(
    tenantId: string,
    input: { key: string; subject: string; body: string; isActive?: boolean },
  ) {
    return this.prisma.emailTemplate.upsert({
      where: { tenantId_key: { tenantId, key: input.key } },
      create: {
        tenantId,
        key: input.key,
        subject: input.subject,
        body: input.body,
        isActive: input.isActive ?? true,
      },
      update: { subject: input.subject, body: input.body, isActive: input.isActive ?? true },
    });
  }
}
