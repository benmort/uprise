import { Injectable } from "@nestjs/common";
import { ConsentState, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "stop all"]);
const START_KEYWORDS = new Set(["start", "yes", "unstop", "resume"]);

/** Classify an inbound message body as an opt-out / opt-in keyword, if any. */
export function classifyConsentKeyword(body: string): ConsentState | null {
  const text = String(body || "").trim().toLowerCase();
  if (!text) return null;
  if (STOP_KEYWORDS.has(text)) return ConsentState.OPTED_OUT;
  if (START_KEYWORDS.has(text)) return ConsentState.OPTED_IN;
  return null;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async getState(
    tenantId: string,
    phoneE164: string,
    channel: MessageChannel,
  ): Promise<ConsentState> {
    const row = await this.prisma.contactConsent.findUnique({
      where: {
        tenantId_phoneE164_channel: { tenantId, phoneE164, channel },
      },
      select: { state: true },
    });
    return row?.state ?? ConsentState.UNKNOWN;
  }

  /**
   * Upsert consent state for a contact on a channel. Emits `messaging.consent.changed`
   * ONLY when the state actually transitions (a repeat STOP, a re-imported opt-out, the
   * per-inbound opt-in refresh — all no-ops, no event), atomically with the write. The
   * CRM write-back's opt-out stream is the first consumer; volume stays bounded because
   * real transitions are rare.
   */
  async setState(input: {
    tenantId: string;
    phoneE164: string;
    channel: MessageChannel;
    state: ConsentState;
    contactId?: string | null;
    source?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.contactConsent.findUnique({
        where: {
          tenantId_phoneE164_channel: {
            tenantId: input.tenantId,
            phoneE164: input.phoneE164,
            channel: input.channel,
          },
        },
        select: { state: true },
      });
      const previousState = existing?.state ?? ConsentState.UNKNOWN;
      await tx.contactConsent.upsert({
        where: {
          tenantId_phoneE164_channel: {
            tenantId: input.tenantId,
            phoneE164: input.phoneE164,
            channel: input.channel,
          },
        },
        update: {
          state: input.state,
          ...(input.contactId ? { contactId: input.contactId } : {}),
          ...(input.source ? { source: input.source } : {}),
        },
        create: {
          tenantId: input.tenantId,
          phoneE164: input.phoneE164,
          channel: input.channel,
          state: input.state,
          contactId: input.contactId ?? null,
          source: input.source ?? null,
        },
      });
      if (previousState !== input.state) {
        await this.outbox.append(tx, {
          tenantId: input.tenantId,
          eventType: "messaging.consent.changed",
          aggregateId: `${input.phoneE164}:${input.channel}`,
          payload: {
            tenantId: input.tenantId,
            contactId: input.contactId ?? null,
            phoneE164: input.phoneE164,
            channel: input.channel,
            state: input.state,
            previousState,
            source: input.source ?? null,
          },
        });
      }
    });
  }

  /**
   * Whether a business-initiated message may be sent on this channel.
   * - SMS: blocked only on explicit OPTED_OUT.
   * - WhatsApp: requires explicit OPTED_IN (Meta policy) and not OPTED_OUT.
   */
  canSend(state: ConsentState, channel: MessageChannel): boolean {
    if (state === ConsentState.OPTED_OUT) return false;
    if (channel === MessageChannel.WHATSAPP) return state === ConsentState.OPTED_IN;
    return true;
  }

  /** Bulk consent lookup for a set of phones on one channel. */
  async getStatesForPhones(
    tenantId: string,
    channel: MessageChannel,
    phones: string[],
  ): Promise<Map<string, ConsentState>> {
    if (phones.length === 0) return new Map();
    const rows = await this.prisma.contactConsent.findMany({
      where: { tenantId, channel, phoneE164: { in: phones } },
      select: { phoneE164: true, state: true },
    });
    return new Map(rows.map((r) => [r.phoneE164, r.state]));
  }
}
