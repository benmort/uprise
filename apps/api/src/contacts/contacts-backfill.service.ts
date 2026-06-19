import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "./contacts.service";

export type BackfillBatchResult = {
  stage: "audience_contacts" | "inbound" | "outbound" | "conversations" | "done";
  processed: number;
  remaining: number;
};

/**
 * One-shot, idempotent, resumable backfill of the Contact spine from the
 * pre-existing phone-keyed rows. Safe to run repeatedly: every step only touches
 * rows whose contactId is still null, and getOrCreateByPhone is idempotent.
 *
 * Ordering matters — AudienceContact first (richest seed: fullName/metadata),
 * then message/conversation phones that never appeared in an audience, so a
 * Contact already exists before those rows link to it.
 *
 * Designed to be driven in batches (mirrors the audience-import cursor pattern):
 * a runner enqueues `backfillBatch` repeatedly until `stage === "done"`.
 */
@Injectable()
export class ContactsBackfillService {
  private readonly logger = new Logger(ContactsBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
  ) {}

  async backfillBatch(batchSize = 500): Promise<BackfillBatchResult> {
    const limit = Math.min(Math.max(1, Math.trunc(batchSize)), 2000);

    const audience = await this.backfillAudienceContacts(limit);
    if (audience.processed > 0 || audience.remaining > 0) return audience;

    const inbound = await this.linkMessages("inbound", limit);
    if (inbound.processed > 0 || inbound.remaining > 0) return inbound;

    const outbound = await this.linkMessages("outbound", limit);
    if (outbound.processed > 0 || outbound.remaining > 0) return outbound;

    const conversations = await this.linkConversations(limit);
    if (conversations.processed > 0 || conversations.remaining > 0) return conversations;

    return { stage: "done", processed: 0, remaining: 0 };
  }

  async backfillAll(batchSize = 500): Promise<{ totalProcessed: number; batches: number }> {
    let totalProcessed = 0;
    let batches = 0;
    // Hard cap on iterations as a runaway guard.
    for (let i = 0; i < 100_000; i += 1) {
      const result = await this.backfillBatch(batchSize);
      batches += 1;
      totalProcessed += result.processed;
      if (result.stage === "done") break;
    }
    this.logger.log(`Contact backfill complete: ${totalProcessed} rows over ${batches} batches`);
    return { totalProcessed, batches };
  }

  private async backfillAudienceContacts(limit: number): Promise<BackfillBatchResult> {
    const rows = await this.prisma.audienceContact.findMany({
      where: { contactId: null },
      orderBy: { id: "asc" },
      take: limit,
      select: { id: true, organizationId: true, phoneE164: true, fullName: true },
    });
    for (const row of rows) {
      const contact = await this.contacts.getOrCreateByPhone(row.organizationId, row.phoneE164, {
        fullName: row.fullName,
      });
      await this.prisma.audienceContact.update({
        where: { id: row.id },
        data: { contactId: contact.id },
      });
    }
    const remaining = await this.prisma.audienceContact.count({ where: { contactId: null } });
    return { stage: "audience_contacts", processed: rows.length, remaining };
  }

  private async linkMessages(
    kind: "inbound" | "outbound",
    limit: number,
  ): Promise<BackfillBatchResult> {
    if (kind === "inbound") {
      const rows = await this.prisma.inboundMessage.findMany({
        where: { contactId: null },
        orderBy: { id: "asc" },
        take: limit,
        select: { id: true, organizationId: true, fromPhone: true },
      });
      for (const row of rows) {
        const contact = await this.contacts.getOrCreateByPhone(row.organizationId, row.fromPhone);
        await this.prisma.inboundMessage.update({
          where: { id: row.id },
          data: { contactId: contact.id },
        });
      }
      const remaining = await this.prisma.inboundMessage.count({ where: { contactId: null } });
      return { stage: "inbound", processed: rows.length, remaining };
    }

    const rows = await this.prisma.outboundMessage.findMany({
      where: { contactId: null },
      orderBy: { id: "asc" },
      take: limit,
      select: { id: true, organizationId: true, toPhone: true },
    });
    for (const row of rows) {
      const contact = await this.contacts.getOrCreateByPhone(row.organizationId, row.toPhone);
      await this.prisma.outboundMessage.update({
        where: { id: row.id },
        data: { contactId: contact.id },
      });
    }
    const remaining = await this.prisma.outboundMessage.count({ where: { contactId: null } });
    return { stage: "outbound", processed: rows.length, remaining };
  }

  private async linkConversations(limit: number): Promise<BackfillBatchResult> {
    const rows = await this.prisma.conversationState.findMany({
      where: { contactId: null },
      orderBy: { id: "asc" },
      take: limit,
      select: { id: true, organizationId: true, contactPhone: true },
    });
    for (const row of rows) {
      const contact = await this.contacts.getOrCreateByPhone(row.organizationId, row.contactPhone);
      await this.prisma.conversationState.update({
        where: { id: row.id },
        data: { contactId: contact.id },
      });
    }
    const remaining = await this.prisma.conversationState.count({ where: { contactId: null } });
    return { stage: "conversations", processed: rows.length, remaining };
  }
}
