import {
  Body,
  Controller,
  Header,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import twilio from "twilio";
import { InboxService } from "../inbox/inbox.service";
import { BlastsService } from "../blasts/blasts.service";

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

@Controller()
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly inbox: InboxService,
    private readonly blasts: BlastsService,
  ) {}

  private validateTwilioSignature(req: Request, body: Record<string, unknown>) {
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      throw new UnauthorizedException("TWILIO_AUTH_TOKEN not configured");
    }
    const signature =
      (req.headers["x-twilio-signature"] as string) ||
      (req.headers["X-Twilio-Signature"] as string);
    if (!signature) {
      throw new UnauthorizedException("Missing X-Twilio-Signature");
    }
    const protocol =
      (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host =
      (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
    const url = `${protocol}://${host}${req.originalUrl}`;
    const isValid = (twilio as any).validateRequest(authToken, signature, url, body || {});
    if (!isValid) {
      throw new UnauthorizedException("Invalid Twilio signature");
    }
  }

  @Post("inbound-text-message-hook")
  @Header("Content-Type", "application/xml")
  async inboundTextMessage(
    @Body() body: { From?: string; To?: string; Body?: string; MessageSid?: string },
    @Req() req: Request,
  ): Promise<string> {
    this.validateTwilioSignature(req, body as Record<string, unknown>);

    const from = String(body?.From || "");
    const to = String(body?.To || "");
    const text = String(body?.Body || "");
    const messageSid = String(body?.MessageSid || "");

    await this.inbox.recordInbound({
      from,
      to,
      body: text,
      messageSid,
    });
    return TWIML_EMPTY;
  }

  @Post("twilio-status-callback")
  @Header("Content-Type", "application/xml")
  async twilioStatusCallback(
    @Body()
    body: {
      MessageSid?: string;
      MessageStatus?: string;
      ErrorCode?: string;
      ErrorMessage?: string;
    },
    @Req() req: Request,
  ): Promise<string> {
    this.validateTwilioSignature(req, body as Record<string, unknown>);
    await this.blasts.handleTwilioStatusCallback({
      messageSid: String(body?.MessageSid || ""),
      messageStatus: String(body?.MessageStatus || ""),
      errorCode: body?.ErrorCode ? String(body.ErrorCode) : null,
      errorMessage: body?.ErrorMessage ? String(body.ErrorMessage) : null,
    });
    return TWIML_EMPTY;
  }
}
