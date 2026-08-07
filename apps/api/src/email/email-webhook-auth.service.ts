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
 * 1. Earliest event (batch order) whose custom_arg `emailId` matches an Email row → emailAccountId.
 * 2. Only if no emailId matched: earliest sg_message_id (filter suffix stripped) → providerMessageId.
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
    // One pass, then at most two batched reads: N is attacker-controlled (any
    // batch shape can be POSTed), so resolution never issues a query per event.
    const emailIds: string[] = [];
    const sgIds: string[] = [];
    for (const event of events) {
      if (typeof event.emailId === "string" && event.emailId) emailIds.push(event.emailId);
      if (typeof event.sg_message_id === "string" && event.sg_message_id) {
        sgIds.push(this.stripFilter(event.sg_message_id));
      }
    }
    const email = (await this.firstMatchById(emailIds)) ?? (await this.firstMatchBySgId(sgIds));
    if (!email) return this.platformKey();
    if (!email.emailAccountId) return this.platformKey(); // platform send
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: email.emailAccountId },
      select: { webhookPublicKey: true },
    });
    return account?.webhookPublicKey?.trim() || this.platformKey();
  }

  /** The Email of the earliest event (batch order) whose emailId custom_arg matches a row. */
  private async firstMatchById(emailIds: string[]): Promise<{ emailAccountId: string | null } | null> {
    if (!emailIds.length) return null;
    const rows = await this.prisma.email.findMany({
      where: { id: { in: [...new Set(emailIds)] } },
      select: { id: true, emailAccountId: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of emailIds) {
      const row = byId.get(id);
      if (row) return row;
    }
    return null;
  }

  /** Fallback when no emailId matched: earliest stripped sg_message_id that matches a row. */
  private async firstMatchBySgId(sgIds: string[]): Promise<{ emailAccountId: string | null } | null> {
    if (!sgIds.length) return null;
    const rows = await this.prisma.email.findMany({
      where: { providerMessageId: { in: [...new Set(sgIds)] } },
      select: { providerMessageId: true, emailAccountId: true },
    });
    const bySgId = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (row.providerMessageId && !bySgId.has(row.providerMessageId)) bySgId.set(row.providerMessageId, row);
    }
    for (const sgId of sgIds) {
      const row = bySgId.get(sgId);
      if (row) return row;
    }
    return null;
  }
}
