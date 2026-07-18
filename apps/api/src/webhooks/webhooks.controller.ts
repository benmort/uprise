import {
  Body,
  Controller,
  Header,
  Logger,
  Post,
  Query,
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
import { SendGridService } from "../email/sendgrid.service";
import { EmailWebhookAuthService } from "../email/email-webhook-auth.service";
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
  private readonly logger = new Logger(WebhooksController.name);

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
    private readonly sendgridService: SendGridService,
    private readonly emailWebhookAuth: EmailWebhookAuthService,
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
    // Attacker bytes: cap the size and treat unparseable payloads exactly like
    // bad signatures (401, not 500) — SendGrid never sends either.
    if (raw.length > 2_000_000) throw new UnauthorizedException("SendGrid payload too large");
    // Parsed BEFORE verification only to pick the signing key (per-subuser
    // webhooks each sign with their own) — nothing is trusted until the
    // signature verifies with the resolved key.
    let events: SendGridEvent[];
    try {
      const parsed = raw ? (JSON.parse(raw) as SendGridEvent[] | SendGridEvent) : [];
      events = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new UnauthorizedException("Invalid SendGrid payload");
    }
    if (this.email.isWebhookVerificationConfigured()) {
      // Preferred: ECDSA signed event webhook over the RAW body (doc 07). The
      // key is the sending account's (Email.emailAccountId provenance), falling
      // back to the platform env key — deterministic, never try-both.
      const sig = (req.headers["x-twilio-email-event-webhook-signature"] as string) ?? "";
      const ts = (req.headers["x-twilio-email-event-webhook-timestamp"] as string) ?? "";
      const key = await this.emailWebhookAuth.resolveKey(events);
      if (!this.sendgridService.verifyEventWebhookSignatureWithKey(key, raw, sig, ts)) {
        throw new UnauthorizedException("Invalid SendGrid signature");
      }
    } else {
      // Fallback: shared secret (legacy). With per-account signed keys in play,
      // an entirely unverified webhook would be an open door — fail closed when
      // NEITHER verification mechanism is configured.
      const secret = this.config.get<string>("SENDGRID_WEBHOOK_SECRET", "").trim();
      if (!secret) throw new UnauthorizedException("SendGrid webhook verification is not configured");
      const provided = (req.headers["x-webhook-secret"] as string) ?? "";
      if (provided !== secret) throw new UnauthorizedException("Invalid SendGrid webhook secret");
    }
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

    // Fail closed: an inbound to a number not provisioned to any tenant has no owner to
    // attribute it to. Drop it (ack 200 so the provider doesn't retry) rather than land
    // it on a shared default org — that would leak cross-tenant.
    if (!resolution.tenantId) {
      this.logger.warn(
        `Dropping inbound message to unprovisioned number ${toParsed.phoneE164} (from ${fromParsed.phoneE164}) — no tenant`,
      );
      return TWIML_EMPTY;
    }

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
      tenantId: resolution.tenantId,
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
      // Twilio posts these on a failed/busy/no-answer call so we can record WHY it never
      // connected (e.g. ErrorCode 13224, SipResponseCode 486). Absent on success.
      ErrorCode?: string;
      ErrorMessage?: string;
      SipResponseCode?: string;
    },
    @Req() req: Request,
    @Query("callId") callId?: string,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    const status = String(body?.CallStatus || "");
    const durationRaw = body?.CallDuration ? Number(body.CallDuration) : undefined;
    const priceRaw = body?.Price ? Number(body.Price) : undefined;
    await this.calls.processStatusCallback(
      {
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
        errorCode: body?.ErrorCode ? String(body.ErrorCode) : undefined,
        errorMessage: body?.ErrorMessage ? String(body.ErrorMessage) : undefined,
        sipCode: body?.SipResponseCode ? String(body.SipResponseCode) : undefined,
        accountSid: body?.AccountSid || undefined,
      },
      callId,
    );
    return TWIML_EMPTY;
  }

  /**
   * TwiML App voice handler for a browser (WebRTC) softphone call. The Voice SDK's
   * `device.connect({ params: { To, contactId } })` lands here; we create the Call
   * row and return `<Dial>` bridging the browser to the callee, from the tenant's
   * provisioned number. Tenant is derived from the signed client identity (`From`),
   * never a client param. An invalid request returns a spoken apology, not a bridge.
   */
  @Post("voice-outbound")
  @Header("Content-Type", "application/xml")
  async voiceOutbound(
    @Body() body: { To?: string; From?: string; AccountSid?: string; contactId?: string; fromNumberId?: string },
    @Req() req: Request,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    const tenantId = tenantFromClientIdentity(body?.From);
    const to = String(body?.To || "").trim();
    if (!tenantId || !/^\+[1-9]\d{6,14}$/.test(to)) {
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we could not place this call.</Say></Response>';
    }
    const { twiml } = await this.calls.startBrowserCall({
      tenantId,
      // Optional dialler choice; validated tenant-scoped + voice-capable in the service.
      fromNumberId: body?.fromNumberId || null,
      toNumber: to,
      contactId: body?.contactId || null,
      accountSid: body?.AccountSid,
    });
    return twiml;
  }

  /**
   * `<Dial action>` callback for a browser call — the parent leg's verdict on the
   * bridge (DialCallStatus). The child leg's own status callbacks carry the rich
   * detail; this is the safety net for dials that fail before the child leg exists
   * (blocked caller ID, invalid number), which would otherwise strand the Call row
   * at INITIATED. Returns empty TwiML so the parent leg ends cleanly.
   */
  @Post("voice-dial-status")
  @Header("Content-Type", "application/xml")
  async voiceDialStatus(
    @Body()
    body: {
      CallSid?: string; // the PARENT (browser) leg
      DialCallSid?: string; // the child (callee) leg, when one was created
      DialCallStatus?: string; // completed | busy | no-answer | failed | canceled
      AccountSid?: string;
    },
    @Req() req: Request,
    @Query("callId") callId?: string,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    if (callId && body?.CallSid && body?.DialCallStatus) {
      await this.calls.processDialOutcome({
        callId,
        parentCallSid: String(body.CallSid),
        dialCallStatus: String(body.DialCallStatus),
        dialCallSid: body?.DialCallSid ? String(body.DialCallSid) : undefined,
        accountSid: body?.AccountSid || undefined,
      });
    }
    return TWIML_EMPTY;
  }

  /**
   * Twilio recording status callback (meld doc 09). A call's recording finalises
   * after the call ends, so it arrives separately from the status callback; this
   * binds the RecordingUrl to its Call (completed only — failed/absent are logged).
   * Idempotency + the claim live in CallsService.
   */
  @Post("voice-recording-callback")
  @Header("Content-Type", "application/xml")
  async voiceRecordingCallback(
    @Body()
    body: {
      CallSid?: string;
      RecordingUrl?: string;
      RecordingStatus?: string;
      AccountSid?: string;
    },
    @Req() req: Request,
    @Query("callId") callId?: string,
  ): Promise<string> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid);
    this.validateTwilioSignature(req, body as Record<string, unknown>, token);
    await this.calls.processRecordingCallback(
      {
        callSid: String(body?.CallSid || ""),
        recordingUrl: body?.RecordingUrl || undefined,
        recordingStatus: body?.RecordingStatus || undefined,
        accountSid: body?.AccountSid || undefined,
      },
      callId,
    );
    return TWIML_EMPTY;
  }
}

/**
 * The tenant id from a browser Voice client identity. The access token identity is
 * `u{userId}.t{tenantId}`; Twilio delivers it as `From: client:u{userId}.t{tenantId}`.
 */
function tenantFromClientIdentity(from?: string): string | null {
  const match = /\.t([A-Za-z0-9]+)$/.exec(String(from || ""));
  return match ? match[1] : null;
}
