import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageChannel } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";

/**
 * WhatsApp's 24-hour customer-care window. A business may only send free-form
 * text within `WHATSAPP_SESSION_WINDOW_HOURS` of the contact's last inbound
 * WhatsApp message; outside it, an approved Content template is required.
 * SMS has no such window, so it is always "open".
 */
@Injectable()
export class SessionWindowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private windowMs(): number {
    const hours = Number(this.config.get<string>("WHATSAPP_SESSION_WINDOW_HOURS", "24")) || 24;
    return Math.min(24, Math.max(1, hours)) * 60 * 60 * 1000;
  }

  /** When the window opened (last inbound WhatsApp), or null if never. */
  async lastInboundAt(organizationId: string, phoneE164: string): Promise<Date | null> {
    const last = await this.prisma.inboundMessage.findFirst({
      where: { organizationId, fromPhone: phoneE164, channel: MessageChannel.WHATSAPP },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
    return last?.receivedAt ?? null;
  }

  async isOpen(
    organizationId: string,
    phoneE164: string,
    channel: MessageChannel,
  ): Promise<boolean> {
    if (channel !== MessageChannel.WHATSAPP) return true;
    const last = await this.lastInboundAt(organizationId, phoneE164);
    if (!last) return false;
    return Date.now() - last.getTime() < this.windowMs();
  }
}
