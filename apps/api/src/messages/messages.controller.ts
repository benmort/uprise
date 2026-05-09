import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { TwilioService } from "../twilio/twilio.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";

@Controller("messages")
export class MessagesController {
  constructor(private readonly twilio: TwilioService) {}

  @Post()
  async create(@Body() body: { to?: string; body?: string }) {
    const toRaw = typeof body?.to === "string" ? body.to.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!toRaw) throw new BadRequestException('"to" (phone number) is required');
    if (!text) throw new BadRequestException('"body" (message text) is required');
    const to = normalizePhoneE164(toRaw);
    return this.twilio.sendMessage(to, text);
  }

  @Get("latest-by-contact")
  async latestByContact() {
    return this.twilio.getLatestByContact(200);
  }

  @Get()
  async list(
    @Query("pageSize") pageSizeStr?: string,
    @Query("pageToken") pageToken?: string,
    @Query("phoneNumber") phoneNumber?: string,
  ) {
    if (phoneNumber && phoneNumber.trim()) {
      const limit = Math.min(200, Math.max(1, parseInt(String(pageSizeStr || "100"), 10) || 100));
      return this.twilio.getMessagesForPhoneNumber(normalizePhoneE164(phoneNumber.trim()), limit);
    }

    const pageSize = Math.min(100, Math.max(1, parseInt(String(pageSizeStr || "20"), 10) || 20));
    return this.twilio.getMessagesPage({
      pageSize,
      pageToken: pageToken || undefined,
    });
  }
}
