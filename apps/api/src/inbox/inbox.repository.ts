import { Injectable } from "@nestjs/common";
import { MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";

/** How far back the recent-contact aggregation looks – bounds the inbox groupBy scans. */
export const INBOX_RECENT_CONTACT_WINDOW_DAYS = 90;

@Injectable()
export class InboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  listConversations(tenantId: string) {
    return this.prisma.conversationState.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      take: 400,
    });
  }

  getThread(tenantId: string, contactPhone: string, channel: MessageChannel) {
    return Promise.all([
      this.prisma.inboundMessage.findMany({
        where: {
          tenantId,
          channel,
          OR: [{ fromPhone: contactPhone }, { toPhone: contactPhone }],
        },
        orderBy: { receivedAt: "asc" },
        take: 200,
      }),
      // Outbound rows always carry the tenant's sender number in fromPhone (never a
      // contact's), so matching by toPhone alone is complete – and rides
      // (tenantId, toPhone, sentAt) outright.
      this.prisma.outboundMessage.findMany({
        where: {
          tenantId,
          channel,
          toPhone: contactPhone,
        },
        orderBy: { sentAt: "asc" },
        take: 200,
      }),
    ]);
  }

  async listRecentMessageContacts(tenantId: string, limit = 500) {
    // The window keeps the aggregation off the tenant's full message history – it rides
    // (tenantId, receivedAt) / (tenantId, sentAt) instead of scanning every row.
    const cutoff = new Date(Date.now() - INBOX_RECENT_CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.groupBy({
        by: ["fromPhone", "channel"],
        where: { tenantId, receivedAt: { gte: cutoff } },
        _max: { receivedAt: true },
        orderBy: { _max: { receivedAt: "desc" } },
        take: Math.min(Math.max(1, limit), 2000),
      }),
      this.prisma.outboundMessage.groupBy({
        by: ["toPhone", "channel"],
        where: { tenantId, sentAt: { gte: cutoff } },
        _max: { sentAt: true },
        orderBy: { _max: { sentAt: "desc" } },
        take: Math.min(Math.max(1, limit), 2000),
      }),
    ]);

    const byKey = new Map<string, { contactPhone: string; channel: MessageChannel; at: Date }>();
    const consider = (contactPhone: string, channel: MessageChannel, at: Date | null) => {
      if (!at) return;
      const key = `${contactPhone}|${channel}`;
      const current = byKey.get(key);
      if (!current || at > current.at) byKey.set(key, { contactPhone, channel, at });
    };
    for (const row of inbound) consider(row.fromPhone, row.channel, row._max.receivedAt);
    for (const row of outbound) consider(row.toPhone, row.channel, row._max.sentAt);

    return Array.from(byKey.values()).map(({ contactPhone, channel, at }) => ({
      contactPhone,
      channel,
      lastMessageAt: at,
    }));
  }

  async listContactPhonesForBlast(tenantId: string, blastId: string) {
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.findMany({
        where: { tenantId, blastId },
        select: { fromPhone: true },
        distinct: ["fromPhone"],
      }),
      this.prisma.outboundMessage.findMany({
        where: { tenantId, blastId },
        select: { toPhone: true },
        distinct: ["toPhone"],
      }),
    ]);
    return [
      ...inbound.map((row) => row.fromPhone),
      ...outbound.map((row) => row.toPhone),
    ];
  }

  /**
   * Membership-test a bounded page of phones against an audience. The inverse of the old
   * message-table sweep: instead of deriving an allow-list from every message of every
   * blast, the (already bounded) conversation-page phones are checked against
   * AudienceContact – served exactly by @@unique([audienceId, phoneE164]).
   */
  async listAudienceMemberPhones(tenantId: string, audienceId: string, phones: string[]) {
    if (phones.length === 0) return [];
    const rows = await this.prisma.audienceContact.findMany({
      where: { tenantId, audienceId, phoneE164: { in: phones } },
      select: { phoneE164: true },
    });
    return rows.map((row) => row.phoneE164);
  }

  listContactNamesByPhones(tenantId: string, phones: string[]) {
    if (phones.length === 0) return Promise.resolve([]);
    return this.prisma.audienceContact.findMany({
      where: {
        tenantId,
        phoneE164: { in: phones },
        NOT: [{ fullName: null }, { fullName: "" }],
      },
      select: {
        phoneE164: true,
        fullName: true,
        updatedAt: true,
      },
      // One row per phone, most recently updated first – most-recent-wins without
      // materialising every historical row for a phone.
      distinct: ["phoneE164"],
      orderBy: [{ phoneE164: "asc" }, { updatedAt: "desc" }],
    });
  }
}
