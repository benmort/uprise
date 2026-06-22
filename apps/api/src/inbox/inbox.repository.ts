import { Injectable } from "@nestjs/common";
import { MessageChannel } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  listConversations(organizationId: string) {
    return this.prisma.conversationState.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 400,
    });
  }

  getThread(organizationId: string, contactPhone: string, channel: MessageChannel) {
    return Promise.all([
      this.prisma.inboundMessage.findMany({
        where: {
          organizationId,
          channel,
          OR: [{ fromPhone: contactPhone }, { toPhone: contactPhone }],
        },
        orderBy: { receivedAt: "asc" },
        take: 200,
      }),
      this.prisma.outboundMessage.findMany({
        where: {
          organizationId,
          channel,
          OR: [{ toPhone: contactPhone }, { fromPhone: contactPhone }],
        },
        orderBy: { sentAt: "asc" },
        take: 200,
      }),
    ]);
  }

  async listRecentMessageContacts(organizationId: string, limit = 500) {
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.groupBy({
        by: ["fromPhone", "channel"],
        where: { organizationId },
        _max: { receivedAt: true },
        orderBy: { _max: { receivedAt: "desc" } },
        take: Math.min(Math.max(1, limit), 2000),
      }),
      this.prisma.outboundMessage.groupBy({
        by: ["toPhone", "channel"],
        where: { organizationId },
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

  async listContactPhonesForBlast(organizationId: string, blastId: string) {
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.findMany({
        where: { organizationId, blastId },
        select: { fromPhone: true },
        distinct: ["fromPhone"],
      }),
      this.prisma.outboundMessage.findMany({
        where: { organizationId, blastId },
        select: { toPhone: true },
        distinct: ["toPhone"],
      }),
    ]);
    return [
      ...inbound.map((row) => row.fromPhone),
      ...outbound.map((row) => row.toPhone),
    ];
  }

  async listContactPhonesForAudience(organizationId: string, audienceId: string) {
    const blasts = await this.prisma.blast.findMany({
      where: { organizationId, audienceId },
      select: { id: true },
    });
    const blastIds = blasts.map((blast) => blast.id);
    if (blastIds.length === 0) return [];
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.findMany({
        where: { organizationId, blastId: { in: blastIds } },
        select: { fromPhone: true },
        distinct: ["fromPhone"],
      }),
      this.prisma.outboundMessage.findMany({
        where: { organizationId, blastId: { in: blastIds } },
        select: { toPhone: true },
        distinct: ["toPhone"],
      }),
    ]);
    return [
      ...inbound.map((row) => row.fromPhone),
      ...outbound.map((row) => row.toPhone),
    ];
  }

  listContactNamesByPhones(organizationId: string, phones: string[]) {
    if (phones.length === 0) return Promise.resolve([]);
    return this.prisma.audienceContact.findMany({
      where: {
        organizationId,
        phoneE164: { in: phones },
        NOT: [{ fullName: null }, { fullName: "" }],
      },
      select: {
        phoneE164: true,
        fullName: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}
