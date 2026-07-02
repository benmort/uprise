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
import { RawBodyRequest } from "@nestjs/common";
import { InboxService } from "../inbox/inbox.service";
import { BlastsService } from "../blasts/blasts.service";
import { EmailService, type SendGridEvent } from "../email/email.service";
import { PaymentService, type StripeEvent } from "../payment/payment.service";
import { StripeService } from "../payment/stripe.service";
import { CallsService } from "../calls/calls.service";
import { TelephonyWebhookAuthService } from "../telephony/telephony-webhook-auth.service";
import { TelephonyProvisioningService } from "../telephony/telephony-provisioning.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { parseChannelAddress } from "../messaging/message-channel.util";

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

@Controller()
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly inbox: InboxService,
    private readonly blasts: BlastsService,
    private readonly email: EmailService,
    private readonly payment: PaymentService,
    private readonly stripe: StripeService,
    private readonly calls: CallsService,
    private readonly telephonyAuth: TelephonyWebhookAuthService,
    private readonly telephonyProvisioning: TelephonyProvisioningService,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  /**
   * Stripe event webhook. Verifies the signature over the RAW body when
   * STRIPE_WEBHOOK_SECRET is set (rawBody enabled in main.ts). Per-event
   * idempotency + transitions live in PaymentService.
   */
  @Post("payment-webhook")
  async paymentWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    // Signature verification is MANDATORY — an unsigned/forged event could trigger
    // refunds or mark payments succeeded. Require the secret + the raw body.
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET", "").trim();
    if (!secret) throw new UnauthorizedException("STRIPE_WEBHOOK_SECRET is not configured");
    const raw = req.rawBody?.toString("utf8") ?? "";
    const sig = (req.headers["stripe-signature"] as string) ?? "";
    if (!raw || !this.stripe.verifyWebhookSignature(raw, sig)) {
      throw new UnauthorizedException("Invalid Stripe signature");
    }
    await this.payment.processStripeEvent(JSON.parse(raw) as StripeEvent);
    return { ok: true };
  }

  /**
   * SendGrid event webhook (delivered/bounce/dropped/open/click). Public (the
   * guard allowlists it); optionally gated by a shared secret. Per-event
   * idempotency + status transitions live in EmailService.
   */
  @Post("email-webhook")
  async emailWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString("utf8") ?? "";
    if (this.email.isWebhookVerificationConfigured()) {
      // Preferred: ECDSA signed event webhook over the RAW body (doc 07).
      const sig = (req.headers["x-twilio-email-event-webhook-signature"] as string) ?? "";
      const ts = (req.headers["x-twilio-email-event-webhook-timestamp"] as string) ?? "";
      if (!this.email.verifyEventWebhookSignature(raw, sig, ts)) {
        throw new UnauthorizedException("Invalid SendGrid signature");
      }
    } else {
      // Fallback: optional shared secret (legacy).
      const secret = this.config.get<string>("SENDGRID_WEBHOOK_SECRET", "").trim();
      if (secret) {
        const provided = (req.headers["x-webhook-secret"] as string) ?? "";
        if (provided !== secret) throw new UnauthorizedException("Invalid SendGrid webhook secret");
      }
    }
    const parsed = raw ? (JSON.parse(raw) as SendGridEvent[] | SendGridEvent) : [];
    const events = Array.isArray(parsed) ? parsed : [parsed];
    await this.email.processSendGridEvents(events);
    return { ok: true };
  }

  /**
   * Validate X-Twilio-Signature with the token of the account that SENT the
   * webhook — per-tenant subaccounts sign with their own tokens, so callers
   * resolve the token first (by To number / AccountSid / BundleSid) and the
   * platform env token is only the fallback.
   */
  private validateTwilioSignature(req: Request, body: Record<string, unknown>, authToken?: string) {
    const token = authToken ?? this.config.get<string>("TWILIO_AUTH_TOKEN");
    if (!token) {
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
    const isValid = (twilio as any).validateRequest(token, signature, url, body || {});
    if (!isValid) {
      throw new UnauthorizedException("Invalid Twilio signature");
    }
  }

  @Post("inbound-text-message-hook")
  @Header("Content-Type", "application/xml")
  async inboundTextMessage(
    @Body()
    body: {
      From?: string;
      To?: string;
      Body?: string;
      MessageSid?: string;
      NumMedia?: string;
      MediaUrl0?: string;
      MediaContentType0?: string;
    },
    @Req() req: Request,
  ): Promise<string> {
    // WhatsApp and SMS share this hook; the channel is encoded in the address prefix.
    // The To number picks the signing token AND routes the message to its tenant —
    // choosing the token from a body field is safe because validation still
    // requires the matching account's secret.
    const fromParsed = parseChannelAddress(String(body?.From || ""));
    const toParsed = parseChannelAddress(String(body?.To || ""));
    const resolution = await this.telephonyAuth.resolveInbound(toParsed.phoneE164);
    this.validateTwilioSignature(req, body as Record<string, unknown>, resolution.authToken);

    const text = String(body?.Body || "");
    const messageSid = String(body?.MessageSid || "");
    const hasMedia = Number(body?.NumMedia || "0") > 0;

    await this.inbox.recordInbound({
      from: fromParsed.phoneE164,
      to: toParsed.phoneE164,
      body: text,
      messageSid,
      channel: fromParsed.channel,
      mediaUrl: hasMedia ? body?.MediaUrl0 || null : null,
      mediaContentType: hasMedia ? body?.MediaContentType0 || null : null,
      tenantId: resolution.tenantId ?? undefined,
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
      AccountSid?: string;
    },
    @Req() req: Request,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    await this.blasts.handleTwilioStatusCallback({
      messageSid: String(body?.MessageSid || ""),
      messageStatus: String(body?.MessageStatus || ""),
      errorCode: body?.ErrorCode ? String(body.ErrorCode) : null,
      errorMessage: body?.ErrorMessage ? String(body.ErrorMessage) : null,
    });
    return TWIML_EMPTY;
  }

  /**
   * Twilio Regulatory Compliance bundle status callback — approval/rejection of
   * a tenant's AU-mobile bundle drives the provisioning FSM out of
   * COMPLIANCE_SUBMITTED. Signature is validated with the token of the
   * subaccount that owns the bundle; claim-before-act keyed on BundleSid:Status
   * so Twilio's retries are idempotent (release on throw lets a retry reprocess).
   */
  @Post("telephony/bundle-status-callback")
  async bundleStatusCallback(
    @Body() body: { BundleSid?: string; Status?: string; FailureReason?: string },
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const bundleSid = String(body?.BundleSid || "");
    const status = String(body?.Status || "");
    const token = await this.telephonyAuth.tokenForBundleSid(bundleSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);

    const eventId = `${bundleSid}:${status}`;
    if (!(await this.webhookEvents.claim("twilio-bundle", eventId))) return { ok: true };
    try {
      await this.telephonyProvisioning.applyBundleStatus(bundleSid, status, body?.FailureReason ?? null);
    } catch (err) {
      await this.webhookEvents.release("twilio-bundle", eventId);
      throw err;
    }
    return { ok: true };
  }

  /**
   * Twilio voice status callback (meld doc 09). Drives the Call FSM; per-status
   * idempotency + transitions live in CallsService. Twilio sends Price as a
   * negative decimal in major units (e.g. "-0.015"); we store positive cents.
   */
  @Post("voice-status-callback")
  @Header("Content-Type", "application/xml")
  async voiceStatusCallback(
    @Body()
    body: {
      CallSid?: string;
      CallStatus?: string;
      CallDuration?: string;
      RecordingUrl?: string;
      Price?: string;
      PriceUnit?: string;
      AccountSid?: string;
    },
    @Req() req: Request,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    const status = String(body?.CallStatus || "");
    const durationRaw = body?.CallDuration ? Number(body.CallDuration) : undefined;
    const priceRaw = body?.Price ? Number(body.Price) : undefined;
    await this.calls.processStatusCallback({
      callSid: String(body?.CallSid || ""),
      status,
      durationSeconds: Number.isFinite(durationRaw) ? durationRaw : undefined,
      recordingUrl: body?.RecordingUrl || undefined,
      priceCents:
        priceRaw !== undefined && Number.isFinite(priceRaw)
          ? Math.round(Math.abs(priceRaw) * 100)
          : undefined,
      currency: body?.PriceUnit || undefined,
      startedAt: status === "in-progress" ? new Date() : undefined,
    });
    return TWIML_EMPTY;
  }
}
