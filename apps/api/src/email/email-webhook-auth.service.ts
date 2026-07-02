import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { SendGridEvent } from "./email.service";

/**
 * Resolves which signed-webhook public key a SendGrid event batch was signed
 * with. Per-subuser webhooks each sign with their own key; a batch belongs to
 * exactly one (sub)account. Resolution is deterministic — the account that
 * ACTUALLY sent the email (stamped as Email.emailAccountId at send time), never
 * the tenant's current account, and never try-both-and-accept:
 *
 * 1. First event carrying our custom_arg `emailId` → Email row → emailAccountId.
 * 2. Fallback: sg_message_id (filter suffix stripped) → providerMessageId.
 * 3. emailAccountId null (platform sends) or nothing resolvable → platform env key.
 *
 * Parsing the raw body BEFORE verification is safe: the ECDSA signature covers
 * timestamp + rawPayload, so nothing is trusted until it verifies with the
 * resolved key. NOT flag-gated — once an account row exists, its webhooks must
 * verify regardless of the outbound-resolution flag.
 */
@Injectable()
export class EmailWebhookAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private platformKey(): string {
    return this.config.get<string>("SENDGRID_WEBHOOK_VERIFICATION_KEY", "").trim();
  }

  private stripFilter(sgMessageId: string): string {
    const dot = sgMessageId.indexOf(".");
    return dot >= 0 ? sgMessageId.slice(0, dot) : sgMessageId;
  }

  /** The verification public key for this event batch (platform key when unresolvable). */
  async resolveKey(events: SendGridEvent[]): Promise<string> {
    for (const event of events) {
      const emailId = typeof event.emailId === "string" ? event.emailId : "";
      const bySgId = typeof event.sg_message_id === "string" ? this.stripFilter(event.sg_message_id) : "";
      const email = emailId
        ? await this.prisma.email.findUnique({ where: { id: emailId }, select: { emailAccountId: true } })
        : bySgId
          ? await this.prisma.email.findFirst({
              where: { providerMessageId: bySgId },
              select: { emailAccountId: true },
            })
          : null;
      if (!email) continue;
      if (!email.emailAccountId) return this.platformKey(); // platform send
      const account = await this.prisma.emailAccount.findUnique({
        where: { id: email.emailAccountId },
        select: { webhookPublicKey: true },
      });
      return account?.webhookPublicKey?.trim() || this.platformKey();
    }
    return this.platformKey();
  }
}
