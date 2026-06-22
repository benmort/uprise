import { BadRequestException, Injectable } from "@nestjs/common";
import { EmailStatus } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { SendGridService } from "./sendgrid.service";
import { DEFAULT_EMAIL_TEMPLATES } from "./email-templates";
import { assertValidEmailTransition, canTransitionEmail } from "./email-state.machine";

export interface SendTransactionalEmailInput {
  tenantId: string;
  toAddress: string;
  templateKey: string;
  vars?: Record<string, string>;
  purpose: string;
  contactId?: string;
}

export interface SendGridEvent {
  event: string; // delivered | bounce | dropped | open | click | ...
  sg_event_id?: string;
  sg_message_id?: string;
  reason?: string;
  emailId?: string; // our custom_arg, echoed back by SendGrid
  [key: string]: unknown;
}

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendgrid: SendGridService,
    private readonly outbox: OutboxService,
    private readonly webhookEvents: WebhookEventService,
    private readonly logger: DomainLogger,
  ) {}

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

    const email = await this.prisma.$transaction(async (tx) => {
      const created = await tx.email.create({
        data: {
          tenantId: input.tenantId,
          contactId: input.contactId ?? null,
          toAddress: input.toAddress,
          subject,
          status: EmailStatus.QUEUED,
          templateKey: input.templateKey,
          purpose: input.purpose,
        },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: "email.email.queued",
        aggregateId: created.id,
        payload: { emailId: created.id, tenantId: input.tenantId, toAddress: input.toAddress },
      });
      return created;
    });

    assertValidEmailTransition(EmailStatus.QUEUED, EmailStatus.SENDING);
    await this.prisma.email.update({ where: { id: email.id }, data: { status: EmailStatus.SENDING } });
    try {
      const { providerMessageId } = await this.sendgrid.send({
        to: input.toAddress,
        subject,
        body,
        customArgs: { emailId: email.id },
      });
      assertValidEmailTransition(EmailStatus.SENDING, EmailStatus.SENT);
      await this.prisma.email.update({
        where: { id: email.id },
        data: { status: EmailStatus.SENT, providerMessageId: providerMessageId || null },
      });
    } catch (err) {
      await this.prisma.email.update({
        where: { id: email.id },
        data: { status: EmailStatus.FAILED, errorMessage: String(err) },
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

  private async transition(
    emailId: string,
    from: EmailStatus,
    to: EmailStatus,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!canTransitionEmail(from, to)) return; // already terminal / illegal → idempotent no-op
    await this.prisma.email.update({ where: { id: emailId }, data: { status: to, ...extra } });
  }

  async processSendGridEvents(events: SendGridEvent[]): Promise<void> {
    for (const event of events) {
      const eventId = event.sg_event_id ?? "";
      if (eventId && !(await this.webhookEvents.claim("sendgrid", eventId))) continue; // duplicate
      const email = await this.resolveEmail(event);
      if (!email) continue;
      switch (event.event) {
        case "delivered":
          await this.transition(email.id, email.status, EmailStatus.DELIVERED);
          break;
        case "bounce":
          await this.transition(email.id, email.status, EmailStatus.BOUNCED, {
            bounceReason: String(event.reason ?? ""),
          });
          break;
        case "dropped":
          await this.transition(email.id, email.status, EmailStatus.FAILED, {
            errorMessage: String(event.reason ?? "dropped"),
          });
          break;
        case "open":
          if (!email.openedAt) {
            await this.prisma.email.update({ where: { id: email.id }, data: { openedAt: new Date() } });
          }
          break;
        case "click":
          if (!email.clickedAt) {
            await this.prisma.email.update({ where: { id: email.id }, data: { clickedAt: new Date() } });
          }
          break;
        default:
          break;
      }
    }
  }
}
