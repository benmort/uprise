import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Read surface over OutboundMessage (GetSms / GetSmsStatus, meld doc 09). */
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessage(tenantId: string, id: string) {
    const message = await this.prisma.outboundMessage.findFirst({
      where: { id, tenantId },
    });
    if (!message) throw new NotFoundException("Message not found");
    return {
      id: message.id,
      channel: message.channel,
      kind: message.kind,
      // Marketing rows track delivery on `status`; transactional rows on `txStatus`.
      status: message.status,
      txStatus: message.txStatus,
      purpose: message.purpose,
      toPhone: message.toPhone,
      fromPhone: message.fromPhone,
      body: message.body,
      twilioMessageSid: message.twilioMessageSid,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
    };
  }
}
