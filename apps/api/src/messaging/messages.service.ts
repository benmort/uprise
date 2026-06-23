import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

/** Read surface over OutboundMessage (GetSms / GetSmsStatus, meld doc 09). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  async getMessage(id: string) {
    const org = await this.ensureOrganization();
    const message = await this.prisma.outboundMessage.findFirst({
      where: { id, tenantId: org.id },
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
