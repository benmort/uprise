import { Injectable } from "@nestjs/common";
import { ConsentState, MessageChannel } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  async getState(
    organizationId: string,
    phoneE164: string,
    channel: MessageChannel,
  ): Promise<ConsentState> {
    const row = await this.prisma.contactConsent.findUnique({
      where: {
        organizationId_phoneE164_channel: { organizationId, phoneE164, channel },
      },
      select: { state: true },
    });
    return row?.state ?? ConsentState.UNKNOWN;
  }

  /** Upsert consent state for a contact on a channel. */
  async setState(input: {
    organizationId: string;
    phoneE164: string;
    channel: MessageChannel;
    state: ConsentState;
    contactId?: string | null;
    source?: string;
  }): Promise<void> {
    await this.prisma.contactConsent.upsert({
      where: {
        organizationId_phoneE164_channel: {
          organizationId: input.organizationId,
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
        organizationId: input.organizationId,
        phoneE164: input.phoneE164,
        channel: input.channel,
        state: input.state,
        contactId: input.contactId ?? null,
        source: input.source ?? null,
      },
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
    organizationId: string,
    channel: MessageChannel,
    phones: string[],
  ): Promise<Map<string, ConsentState>> {
    if (phones.length === 0) return new Map();
    const rows = await this.prisma.contactConsent.findMany({
      where: { organizationId, channel, phoneE164: { in: phones } },
      select: { phoneE164: true, state: true },
    });
    return new Map(rows.map((r) => [r.phoneE164, r.state]));
  }
}
