import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { InboxRepository } from "./inbox.repository";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twilio: TwilioService,
    private readonly events: RealtimeEventsService,
    private readonly repo: InboxRepository,
    private readonly ai: AiSuggestionsService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  async recordInbound(payload: {
    from: string;
    to: string;
    body: string;
    messageSid?: string;
  }) {
    const org = await this.ensureOrganization();
    const fromPhone = normalizePhoneE164(payload.from);
    const toPhone = normalizePhoneE164(payload.to);
    const latestOutbound = await this.prisma.outboundMessage.findFirst({
      where: { organizationId: org.id, toPhone: fromPhone },
      orderBy: { sentAt: "desc" },
    });

    const inbound = await this.prisma.inboundMessage.create({
      data: {
        organizationId: org.id,
        blastId: latestOutbound?.blastId || null,
        fromPhone,
        toPhone,
        body: payload.body || "",
        twilioMessageSid: payload.messageSid || null,
        threadKey: fromPhone,
      },
    });

    await this.prisma.conversationState.upsert({
      where: {
        organizationId_contactPhone: {
          organizationId: org.id,
          contactPhone: fromPhone,
        },
      },
      update: {
        unreadCount: { increment: 1 },
        resolved: false,
        lastMessageAt: inbound.receivedAt,
      },
      create: {
        organizationId: org.id,
        contactPhone: fromPhone,
        unreadCount: 1,
        resolved: false,
        lastMessageAt: inbound.receivedAt,
      },
    });

    if (latestOutbound?.recipientId) {
      await this.prisma.blastRecipient.updateMany({
        where: { id: latestOutbound.recipientId },
        data: {
          status: BlastRecipientStatus.RESPONDED,
          respondedAt: inbound.receivedAt,
        },
      });
      await this.prisma.analyticsSnapshot.create({
        data: {
          organizationId: org.id,
          blastId: latestOutbound.blastId || null,
          metricName: "responded",
          metricValue: 1,
          bucketAt: new Date(
            Date.UTC(
              inbound.receivedAt.getUTCFullYear(),
              inbound.receivedAt.getUTCMonth(),
              inbound.receivedAt.getUTCDate(),
              inbound.receivedAt.getUTCHours(),
              inbound.receivedAt.getUTCMinutes(),
              0,
              0,
            ),
          ),
        },
      });
    }

    this.events.emit("inbox.inbound", {
      contactPhone: fromPhone,
      blastId: latestOutbound?.blastId || null,
      body: payload.body || "",
    });

    return inbound;
  }

  async listConversations(input?: {
    query?: string;
    blastId?: string;
    audienceId?: string;
  }) {
    const org = await this.ensureOrganization();
    const [rows, contactsFromMessages, twilioContacts, blastPhones, audiencePhones] = await Promise.all([
      this.repo.listConversations(org.id),
      this.repo.listRecentMessageContacts(org.id),
      this.twilio.getLatestByContact(500).catch(
        () => ({} as Record<string, { direction: string; date: string; body: string; status: string }>),
      ),
      input?.blastId ? this.repo.listContactPhonesForBlast(org.id, input.blastId) : Promise.resolve([]),
      input?.audienceId
        ? this.repo.listContactPhonesForAudience(org.id, input.audienceId)
        : Promise.resolve([]),
    ]);

    type ConversationRow = {
      contactPhone: string;
      unreadCount: number;
      resolved: boolean;
      lastMessageAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    };

    const merged = new Map<string, ConversationRow>();
    for (const row of rows) {
      const phone = normalizePhoneE164(row.contactPhone);
      merged.set(phone, {
        contactPhone: phone,
        unreadCount: row.unreadCount,
        resolved: row.resolved,
        lastMessageAt: row.lastMessageAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }

    for (const row of contactsFromMessages) {
      const phone = normalizePhoneE164(row.contactPhone);
      const existing = merged.get(phone);
      if (!existing) {
        merged.set(phone, {
          contactPhone: phone,
          unreadCount: 0,
          resolved: false,
          lastMessageAt: row.lastMessageAt,
        });
        continue;
      }
      const existingAt = existing.lastMessageAt ? new Date(existing.lastMessageAt) : null;
      if (!existingAt || row.lastMessageAt > existingAt) {
        existing.lastMessageAt = row.lastMessageAt;
      }
    }

    for (const [rawPhone, summary] of Object.entries(twilioContacts || {})) {
      const phone = normalizePhoneE164(rawPhone);
      const parsedAt = summary?.date ? new Date(summary.date) : null;
      const lastMessageAt =
        parsedAt && Number.isFinite(parsedAt.getTime()) ? parsedAt : null;
      const existing = merged.get(phone);
      if (!existing) {
        merged.set(phone, {
          contactPhone: phone,
          unreadCount: 0,
          resolved: false,
          lastMessageAt,
        });
        continue;
      }
      const existingAt = existing.lastMessageAt ? new Date(existing.lastMessageAt) : null;
      if (lastMessageAt && (!existingAt || lastMessageAt > existingAt)) {
        existing.lastMessageAt = lastMessageAt;
      }
    }

    let sortedRows = Array.from(merged.values()).sort((a, b) => {
      const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return right - left;
    });

    if (input?.blastId) {
      const allowed = new Set(blastPhones.map((phone) => normalizePhoneE164(phone)));
      sortedRows = sortedRows.filter((row) => allowed.has(row.contactPhone));
    }
    if (input?.audienceId) {
      const allowed = new Set(audiencePhones.map((phone) => normalizePhoneE164(phone)));
      sortedRows = sortedRows.filter((row) => allowed.has(row.contactPhone));
    }

    const contactNames = await this.repo.listContactNamesByPhones(
      org.id,
      sortedRows.map((row) => row.contactPhone),
    );
    const contactNameByPhone = new Map<string, string>();
    for (const contact of contactNames) {
      if (!contact.fullName) continue;
      const phone = normalizePhoneE164(contact.phoneE164);
      const fullName = contact.fullName.trim();
      if (!fullName || contactNameByPhone.has(phone)) continue;
      contactNameByPhone.set(phone, fullName);
    }

    const withNames = sortedRows.map((row) => ({
      ...row,
      contactName: contactNameByPhone.get(row.contactPhone) || null,
    }));

    if (!input?.query?.trim()) return withNames;
    const q = input.query.trim().toLowerCase();
    return withNames.filter((row) => {
      if (row.contactPhone.toLowerCase().includes(q)) return true;
      return (row.contactName || "").toLowerCase().includes(q);
    });
  }

  async getThread(contactPhone: string) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    const [[inboundRows, outboundRows], twilioMessages] = await Promise.all([
      this.repo.getThread(org.id, phone),
      this.twilio
        .getMessagesForPhoneNumber(phone, 200)
        .then((payload) => payload.messages)
        .catch(() => []),
    ]);

    const messages = [
      ...inboundRows.map((row) => ({
        id: row.id,
        sid: row.twilioMessageSid || undefined,
        type: "inbound" as const,
        at: row.receivedAt.toISOString(),
        body: row.body,
        from: row.fromPhone,
        to: row.toPhone,
        blastId: row.blastId,
      })),
      ...outboundRows.map((row) => ({
        id: row.id,
        sid: row.twilioMessageSid || undefined,
        type: "outbound" as const,
        at: row.sentAt.toISOString(),
        body: row.body,
        from: row.fromPhone,
        to: row.toPhone,
        blastId: row.blastId,
      })),
      ...twilioMessages.map((row) => ({
        id: row.sid,
        sid: row.sid,
        type: String(row.direction || "").toLowerCase().startsWith("inbound")
          ? ("inbound" as const)
          : ("outbound" as const),
        at: String(row.dateSent || row.dateCreated),
        body: String(row.body || ""),
        from: String(row.from || ""),
        to: String(row.to || ""),
        blastId: null,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const deduped: typeof messages = [];
    const seen = new Set<string>();
    for (const message of messages) {
      const key = message.sid
        ? `sid:${message.sid}`
        : `${message.type}:${message.id}:${message.at}:${message.body}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(message);
    }

    const blastIds = Array.from(
      new Set(
        [...deduped]
          .reverse()
          .map((msg) => msg.blastId)
          .filter((blastId): blastId is string => Boolean(blastId)),
      ),
    );
    const [blasts, contactNames] = await Promise.all([
      blastIds.length > 0
        ? this.prisma.blast.findMany({
            where: { id: { in: blastIds } },
            select: {
              id: true,
              title: true,
              status: true,
              audienceId: true,
              completedAt: true,
              startedAt: true,
            },
          })
        : Promise.resolve([]),
      this.repo.listContactNamesByPhones(org.id, [phone]),
    ]);
    const blastById = new Map(blasts.map((blast) => [blast.id, blast]));
    const blastHistory = blastIds
      .map((blastId) => {
        const blast = blastById.get(blastId);
        if (!blast) return null;
        return {
          blastId: blast.id,
          title: blast.title,
          status: blast.status,
          audienceId: blast.audienceId,
          sentAt: blast.completedAt || blast.startedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const blastContext = blastHistory[0] || null;
    const contactName =
      contactNames[0]?.fullName && contactNames[0].fullName.trim()
        ? contactNames[0].fullName.trim()
        : null;

    return {
      contactPhone: phone,
      contactName,
      blastContext,
      blastHistory,
      messages: deduped,
    };
  }

  async reply(contactPhone: string, body: string) {
    const org = await this.ensureOrganization();
    const to = normalizePhoneE164(contactPhone);
    const sent = await this.twilio.sendMessage(to, body);
    const row = await this.prisma.outboundMessage.create({
      data: {
        organizationId: org.id,
        toPhone: sent.to,
        fromPhone: sent.from,
        body: sent.body || body,
        status: BlastRecipientStatus.SENT,
        twilioMessageSid: sent.sid,
        sentAt: new Date(sent.dateSent || sent.dateCreated),
      },
    });
    await this.prisma.conversationState.upsert({
      where: {
        organizationId_contactPhone: {
          organizationId: org.id,
          contactPhone: to,
        },
      },
      update: {
        lastMessageAt: row.sentAt,
      },
      create: {
        organizationId: org.id,
        contactPhone: to,
        unreadCount: 0,
        resolved: false,
        lastMessageAt: row.sentAt,
      },
    });
    this.events.emit("inbox.reply", { contactPhone: to });
    return row;
  }

  async markConversation(contactPhone: string, resolved: boolean) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    return this.prisma.conversationState.upsert({
      where: {
        organizationId_contactPhone: {
          organizationId: org.id,
          contactPhone: phone,
        },
      },
      update: {
        unreadCount: 0,
        resolved,
      },
      create: {
        organizationId: org.id,
        contactPhone: phone,
        unreadCount: 0,
        resolved,
      },
    });
  }

  suggest(message: string) {
    return { suggestions: this.ai.suggestReplies(message) };
  }
}
