import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageKind, TxSmsStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioService } from "../twilio/twilio.service";
import { TelephonySenderResolver } from "../telephony/telephony-sender.resolver";
import { OutboxService } from "../common/outbox/outbox.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { EmailService } from "../email/email.service";
import { assertValidTxSmsTransition } from "./tx-sms-state.machine";
import type {
  TransactionalDispatcher,
  TransactionalEmailInput,
  TransactionalSmsInput,
} from "./transactional-dispatcher";

/**
 * Transactional messaging (meld doc 06). This service DELIBERATELY does NOT
 * import or call ConsentService, ComplianceService, or the suppression list — a
 * transactional message (2FA, verification code, receipt) is legally exempt from
 * marketing consent and MUST send to a STOP'd/suppressed number, at any hour,
 * with no opt-out footer. Marketing sends keep going through BlastsService.
 */
@Injectable()
export class TransactionalMessagingService implements TransactionalDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
    private readonly senderResolver: TelephonySenderResolver,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    private readonly logger: DomainLogger,
    @Optional() private readonly email?: EmailService,
  ) {}

  private transactionalFrom(): string {
    return (
      this.config.get<string>("TWILIO_TRANSACTIONAL_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim() ||
      "(transactional)"
    );
  }

  private render(body: string, vars?: Record<string, string>): string {
    return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars?.[key] ?? "");
  }

  private async resolveBody(input: TransactionalSmsInput): Promise<string> {
    if (input.templateKey) {
      const template = await this.prisma.messageTemplate.findUnique({
        where: { tenantId_key: { tenantId: input.tenantId, key: input.templateKey } },
      });
      if (!template || !template.isActive) {
        throw new BadRequestException(`Unknown transactional template: ${input.templateKey}`);
      }
      return this.render(template.body, input.vars);
    }
    if (input.body && input.body.trim()) return input.body.trim();
    throw new BadRequestException("Transactional SMS requires a body or templateKey");
  }

  async sendSms(input: TransactionalSmsInput): Promise<void> {
    const body = await this.resolveBody(input);
    const sender = await this.senderResolver.resolve({
      tenantId: input.tenantId,
      purpose: "transactional",
    });
    const fromPhone = sender?.from ?? this.transactionalFrom();

    // 1. Ledger row (TRANSACTIONAL, PENDING) + outbox event, atomic. No
    //    consent/compliance/suppression — this path has none by design.
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.outboundMessage.create({
        data: {
          tenantId: input.tenantId,
          channel: "SMS",
          kind: MessageKind.TRANSACTIONAL,
          txStatus: TxSmsStatus.PENDING,
          purpose: input.purpose,
          toPhone: input.toPhone,
          fromPhone,
          body,
        },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: "messaging.tx-sms.requested",
        aggregateId: created.id,
        payload: { tenantId: input.tenantId, toPhone: input.toPhone, purpose: input.purpose },
      });
      return created;
    });

    // 2. Send via the transactional sender; record SENT or FAILED.
    assertValidTxSmsTransition(TxSmsStatus.PENDING, TxSmsStatus.QUEUED);
    try {
      const sent = await this.twilio.sendTransactional(input.toPhone, body, sender);
      assertValidTxSmsTransition(TxSmsStatus.QUEUED, TxSmsStatus.SENT);
      await this.prisma.outboundMessage.update({
        where: { id: message.id },
        data: { txStatus: TxSmsStatus.SENT, twilioMessageSid: sent.sid },
      });
    } catch (err) {
      await this.prisma.outboundMessage.update({
        where: { id: message.id },
        data: { txStatus: TxSmsStatus.FAILED, errorMessage: String(err) },
      });
      this.logger.error("messaging", "Transactional SMS send failed", undefined, {
        messageId: message.id,
        purpose: input.purpose,
        error: String(err),
      });
      throw err; // the caller (e.g. IAM 2FA) must learn the code didn't send
    }
  }

  async sendEmail(input: TransactionalEmailInput): Promise<void> {
    if (!this.email) {
      throw new BadRequestException("Transactional email dispatch is unavailable (email domain not loaded)");
    }
    await this.email.sendTransactional({
      tenantId: input.tenantId,
      toAddress: input.toAddress,
      templateKey: input.templateKey,
      vars: input.vars,
      purpose: input.purpose,
    });
  }
}
