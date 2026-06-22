import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BlastRecipientStatus,
  ConsentState,
  JourneyTriggerType,
  MessageChannel,
} from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ContactsService } from "../contacts/contacts.service";
import { ConsentService, classifyConsentKeyword } from "../messaging/consent.service";
import { SessionWindowService } from "../messaging/session-window.service";
import { coerceChannel } from "../messaging/message-channel.util";
import {
  JOURNEY_TRIGGER_PORT,
  JourneyTriggerPort,
} from "../journeys/journey-trigger.port";
import { InboxRepository } from "./inbox.repository";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twilio: TwilioService,
    private readonly events: RealtimeEventsService,
    private readonly contacts: ContactsService,
    private readonly repo: InboxRepository,
    private readonly ai: AiSuggestionsService,
    private readonly consent: ConsentService,
    private readonly sessionWindow: SessionWindowService,
    @Optional() @Inject(JOURNEY_TRIGGER_PORT) private readonly journeys?: JourneyTriggerPort,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
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
    channel?: MessageChannel;
    mediaUrl?: string | null;
    mediaContentType?: string | null;
  }) {
    const org = await this.ensureOrganization();
    const fromPhone = normalizePhoneE164(payload.from);
    const toPhone = normalizePhoneE164(payload.to);
    const channel = payload.channel ?? MessageChannel.SMS;
    const contact = await this.contacts.getOrCreateByPhone(org.id, fromPhone);
    const attributedOutbound = await this.prisma.outboundMessage.findFirst({
      where: {
        tenantId: org.id,
        toPhone: fromPhone,
        channel,
        OR: [{ blastId: { not: null } }, { recipientId: { not: null } }],
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    });

    const inbound = await this.prisma.inboundMessage.create({
      data: {
        tenantId: org.id,
        blastId: attributedOutbound?.blastId || null,
        contactId: contact.id,
        channel,
        fromPhone,
        toPhone,
        body: payload.body || "",
        mediaUrl: payload.mediaUrl ?? null,
        mediaContentType: payload.mediaContentType ?? null,
        twilioMessageSid: payload.messageSid || null,
        threadKey: channel === MessageChannel.WHATSAPP ? `whatsapp:${fromPhone}` : fromPhone,
      },
    });

    // An inbound message implies opt-in (and opens the WhatsApp window); STOP/START
    // keywords override. STOP records opt-out across both channels for this contact.
    const keyword = classifyConsentKeyword(payload.body || "");
    if (keyword === ConsentState.OPTED_OUT) {
      for (const ch of [MessageChannel.SMS, MessageChannel.WHATSAPP]) {
        await this.consent.setState({
          tenantId: org.id,
          phoneE164: fromPhone,
          channel: ch,
          state: ConsentState.OPTED_OUT,
          contactId: contact.id,
          source: "stop_keyword",
        });
      }
    } else {
      await this.consent.setState({
        tenantId: org.id,
        phoneE164: fromPhone,
        channel,
        state: ConsentState.OPTED_IN,
        contactId: contact.id,
        source: keyword === ConsentState.OPTED_IN ? "start_keyword" : "inbound",
      });
    }

    await this.prisma.conversationState.upsert({
      where: {
        tenantId_contactPhone_channel: {
          tenantId: org.id,
          contactPhone: fromPhone,
          channel,
        },
      },
      update: {
        contactId: contact.id,
        unreadCount: { increment: 1 },
        resolved: false,
        lastMessageAt: inbound.receivedAt,
      },
      create: {
        tenantId: org.id,
        contactId: contact.id,
        contactPhone: fromPhone,
        channel,
        unreadCount: 1,
        resolved: false,
        lastMessageAt: inbound.receivedAt,
      },
    });

    const recipientWhere = attributedOutbound?.recipientId
      ? {
          id: attributedOutbound.recipientId,
        }
      : attributedOutbound?.blastId
        ? {
            blastId: attributedOutbound.blastId,
            phoneE164: fromPhone,
          }
        : null;

    if (recipientWhere) {
      const updated = await this.prisma.blastRecipient.updateMany({
        where: {
          ...recipientWhere,
          status: {
            not: BlastRecipientStatus.RESPONDED,
          },
        },
        data: {
          status: BlastRecipientStatus.RESPONDED,
          respondedAt: inbound.receivedAt,
        },
      });
      if (updated.count > 0) {
        await this.prisma.analyticsSnapshot.create({
          data: {
            tenantId: org.id,
            blastId: attributedOutbound?.blastId || null,
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
    }

    this.events.emit("inbox.inbound", {
      contactPhone: fromPhone,
      blastId: attributedOutbound?.blastId || null,
      body: payload.body || "",
      channel,
    });

    if (this.journeys) {
      try {
        await this.journeys.handleTrigger(JourneyTriggerType.message_received, {
          tenantId: org.id,
          contactId: contact.id,
          blastId: attributedOutbound?.blastId || null,
        });
      } catch (error) {
        // Journey failures must never break inbound recording.
        this.events.emit("journey.trigger_error", {
          type: JourneyTriggerType.message_received,
          error: String(error),
        });
      }
    }

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
      channel: MessageChannel;
      unreadCount: number;
      resolved: boolean;
      ownerId?: string | null;
      lastMessageAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    };

    // Conversations are keyed per (phone, channel) so SMS and WhatsApp threads
    // for the same person stay distinct.
    const keyOf = (phone: string, channel: MessageChannel) => `${phone}|${channel}`;
    const merged = new Map<string, ConversationRow>();
    for (const row of rows) {
      const phone = normalizePhoneE164(row.contactPhone);
      const channel = (row.channel as MessageChannel) ?? MessageChannel.SMS;
      merged.set(keyOf(phone, channel), {
        contactPhone: phone,
        channel,
        unreadCount: row.unreadCount,
        resolved: row.resolved,
        ownerId: row.ownerId,
        lastMessageAt: row.lastMessageAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }

    for (const row of contactsFromMessages) {
      const phone = normalizePhoneE164(row.contactPhone);
      const channel = (row.channel as MessageChannel) ?? MessageChannel.SMS;
      const key = keyOf(phone, channel);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          contactPhone: phone,
          channel,
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

    // Twilio's live message API only surfaces SMS history.
    for (const [rawPhone, summary] of Object.entries(twilioContacts || {})) {
      const phone = normalizePhoneE164(rawPhone);
      const key = keyOf(phone, MessageChannel.SMS);
      const parsedAt = summary?.date ? new Date(summary.date) : null;
      const lastMessageAt =
        parsedAt && Number.isFinite(parsedAt.getTime()) ? parsedAt : null;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          contactPhone: phone,
          channel: MessageChannel.SMS,
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

    const ownerById = await this.resolveOwners(
      org.id,
      sortedRows.map((row) => row.ownerId),
    );
    const withNames = sortedRows.map((row) => ({
      ...row,
      contactName: contactNameByPhone.get(row.contactPhone) || null,
      owner: row.ownerId ? ownerById.get(row.ownerId) ?? null : null,
    }));

    if (!input?.query?.trim()) return withNames;
    const q = input.query.trim().toLowerCase();
    return withNames.filter((row) => {
      if (row.contactPhone.toLowerCase().includes(q)) return true;
      return (row.contactName || "").toLowerCase().includes(q);
    });
  }

  /** Resolve claimed-conversation owner ids to { id, name } (batched). */
  private async resolveOwners(tenantId: string, ownerIds: Array<string | null | undefined>) {
    const ids = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];
    const map = new Map<string, { id: string; name: string }>();
    if (ids.length === 0) return map;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, email: true },
    });
    for (const u of users) map.set(u.id, { id: u.id, name: u.displayName || u.email });
    // The env super-admin isn't a User row; label it sensibly.
    for (const id of ids) if (!map.has(id)) map.set(id, { id, name: id === "env-admin" ? "Admin" : "Unknown" });
    return map;
  }

  async getThread(contactPhone: string, channelInput?: MessageChannel | string) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    const channel = coerceChannel(channelInput ?? MessageChannel.SMS);
    // Twilio's live message API only covers SMS; skip it for WhatsApp threads.
    const [[inboundRows, outboundRows], twilioMessages] = await Promise.all([
      this.repo.getThread(org.id, phone, channel),
      channel === MessageChannel.SMS
        ? this.twilio
            .getMessagesForPhoneNumber(phone, 200)
            .then((payload) => payload.messages)
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    const sessionOpen = await this.sessionWindow.isOpen(org.id, phone, channel);

    const messages = [
      ...inboundRows.map((row) => ({
        id: row.id,
        sid: row.twilioMessageSid || undefined,
        type: "inbound" as const,
        channel: (row.channel as MessageChannel) ?? MessageChannel.SMS,
        at: row.receivedAt.toISOString(),
        body: row.body,
        mediaUrl: row.mediaUrl ?? null,
        from: row.fromPhone,
        to: row.toPhone,
        blastId: row.blastId,
      })),
      ...outboundRows.map((row) => ({
        id: row.id,
        sid: row.twilioMessageSid || undefined,
        type: "outbound" as const,
        channel: (row.channel as MessageChannel) ?? MessageChannel.SMS,
        at: row.sentAt.toISOString(),
        body: row.body,
        mediaUrl: row.mediaUrl ?? null,
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
        channel: MessageChannel.SMS,
        at: String(row.dateSent || row.dateCreated),
        body: String(row.body || ""),
        mediaUrl: null,
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

    const convo = await this.prisma.conversationState.findUnique({
      where: {
        tenantId_contactPhone_channel: { tenantId: org.id, contactPhone: phone, channel },
      },
      select: { ownerId: true },
    });
    const owner = convo?.ownerId
      ? (await this.resolveOwners(org.id, [convo.ownerId])).get(convo.ownerId) ?? null
      : null;

    return {
      contactPhone: phone,
      contactName,
      channel,
      sessionOpen,
      owner,
      blastContext,
      blastHistory,
      messages: deduped,
    };
  }

  async reply(contactPhone: string, body: string, channelInput?: MessageChannel | string) {
    const org = await this.ensureOrganization();
    const to = normalizePhoneE164(contactPhone);
    const channel = coerceChannel(channelInput ?? MessageChannel.SMS);
    const contact = await this.contacts.getOrCreateByPhone(org.id, to);

    // A free-text WhatsApp reply is only valid inside the 24h session window.
    if (channel === MessageChannel.WHATSAPP) {
      const open = await this.sessionWindow.isOpen(org.id, to, channel);
      if (!open) {
        throw new BadRequestException({
          code: "SESSION_WINDOW_CLOSED",
          message:
            "WhatsApp's 24-hour window has closed for this contact. Send an approved template to re-open the conversation.",
        });
      }
    }

    const sent = await this.twilio.sendMessage(to, body, { channel });
    const normalizedTo = sent.to ? normalizePhoneE164(sent.to.replace(/^whatsapp:/i, "")) : to;
    const normalizedFrom = sent.from
      ? normalizePhoneE164(sent.from.replace(/^whatsapp:/i, ""))
      : sent.from;
    const row = await this.prisma.outboundMessage.create({
      data: {
        tenantId: org.id,
        contactId: contact.id,
        channel,
        toPhone: normalizedTo,
        fromPhone: normalizedFrom,
        body: sent.body || body,
        status: BlastRecipientStatus.SENT,
        twilioMessageSid: sent.sid,
        sentAt: new Date(sent.dateSent || sent.dateCreated),
      },
    });
    await this.prisma.conversationState.upsert({
      where: {
        tenantId_contactPhone_channel: {
          tenantId: org.id,
          contactPhone: to,
          channel,
        },
      },
      update: {
        contactId: contact.id,
        unreadCount: 0,
        lastMessageAt: row.sentAt,
      },
      create: {
        tenantId: org.id,
        contactId: contact.id,
        contactPhone: to,
        channel,
        unreadCount: 0,
        resolved: false,
        lastMessageAt: row.sentAt,
      },
    });
    this.events.emit("inbox.reply", { contactPhone: to, channel });
    return row;
  }

  async markConversation(
    contactPhone: string,
    resolved: boolean,
    channelInput?: MessageChannel | string,
  ) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    const channel = coerceChannel(channelInput ?? MessageChannel.SMS);
    return this.prisma.conversationState.upsert({
      where: {
        tenantId_contactPhone_channel: {
          tenantId: org.id,
          contactPhone: phone,
          channel,
        },
      },
      update: {
        unreadCount: 0,
        resolved,
      },
      create: {
        tenantId: org.id,
        contactPhone: phone,
        channel,
        unreadCount: 0,
        resolved,
      },
    });
  }

  /** Claim a conversation for the given user (server-owned ownership). */
  async claimConversation(
    contactPhone: string,
    ownerId: string,
    channelInput?: MessageChannel | string,
  ) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    const channel = coerceChannel(channelInput ?? MessageChannel.SMS);
    await this.prisma.conversationState.upsert({
      where: {
        tenantId_contactPhone_channel: { tenantId: org.id, contactPhone: phone, channel },
      },
      update: { ownerId, claimedAt: new Date() },
      create: { tenantId: org.id, contactPhone: phone, channel, ownerId, claimedAt: new Date() },
    });
    const owner = (await this.resolveOwners(org.id, [ownerId])).get(ownerId) ?? null;
    return { contactPhone: phone, channel, owner };
  }

  /** Release a conversation (clear its owner). */
  async releaseConversation(contactPhone: string, channelInput?: MessageChannel | string) {
    const org = await this.ensureOrganization();
    const phone = normalizePhoneE164(contactPhone);
    const channel = coerceChannel(channelInput ?? MessageChannel.SMS);
    await this.prisma.conversationState.updateMany({
      where: { tenantId: org.id, contactPhone: phone, channel },
      data: { ownerId: null, claimedAt: null },
    });
    return { contactPhone: phone, channel, owner: null };
  }

  async suggest(message: string) {
    const org = await this.ensureOrganization();
    const suggestions = await this.ai.suggestReplies({ tenantId: org.id, message });
    return { suggestions };
  }
}
