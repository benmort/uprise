import { Injectable, Logger } from "@nestjs/common";
import { BlastRecipientStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioService } from "../twilio/twilio.service";
import { TelephonySenderResolver } from "../telephony/telephony-sender.resolver";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";

/**
 * One-off P2P text to a single contact. Deliberately does NOT reuse the blast
 * batch pipeline (Blast/BlastRecipient/sendNow) — that machinery is audience-
 * shaped, self-continues, and recalculates blast status. This reuses only the
 * primitives inbox.reply already uses: TwilioService + an OutboundMessage row +
 * a realtime event.
 */
@Injectable()
export class SingleSendService {
  private readonly logger = new Logger(SingleSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
    private readonly senderResolver: TelephonySenderResolver,
    private readonly events: RealtimeEventsService,
  ) {}

  async sendToContact(
    tenantId: string,
    contactId: string,
    body: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { phoneE164: true },
    });
    if (!contact?.phoneE164) {
      this.logger.warn(`Journey p2p_text skipped: contact ${contactId} has no phone`);
      return { sent: false, reason: "no_phone" };
    }

    const to = normalizePhoneE164(contact.phoneE164);
    const sender = await this.senderResolver.resolve({ tenantId, purpose: "marketing" });
    const sent = await this.twilio.sendMessage(to, body, sender ? { sender } : {});
    await this.prisma.outboundMessage.create({
      data: {
        tenantId,
        contactId,
        toPhone: sent.to ? normalizePhoneE164(sent.to) : to,
        fromPhone: sent.from ? normalizePhoneE164(sent.from) : sent.from,
        body: sent.body || body,
        status: BlastRecipientStatus.SENT,
        twilioMessageSid: sent.sid,
        sentAt: new Date(sent.dateSent || sent.dateCreated),
      },
    });
    this.events.emit("journey.message_sent", { contactId, to });
    return { sent: true };
  }
}
