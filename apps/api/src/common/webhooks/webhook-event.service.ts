import { Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Provider-webhook idempotency (meld doc 12). claim-before-act: the first call
 * for a (provider, eventId) wins; a replayed event returns false and is skipped.
 * Shared by SendGrid / Stripe / Twilio webhook handlers.
 */
@Injectable()
export class WebhookEventService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(provider: string, eventId: string): Promise<boolean> {
    if (!eventId) return true; // no id to dedup on — let it through
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  }

  /**
   * Release a claim so a failed event is reprocessed on the provider's retry.
   * Call this if processing throws AFTER a successful claim — otherwise the event
   * is marked processed but never applied (a silent loss, critical for payments).
   */
  async release(provider: string, eventId: string): Promise<void> {
    if (!eventId) return;
    await this.prisma.webhookEvent.deleteMany({ where: { provider, eventId } });
  }
}
