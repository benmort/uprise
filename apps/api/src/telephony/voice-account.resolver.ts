import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { TwilioService, type ResolvedSender } from "../twilio/twilio.service";
import { TelephonySenderResolver } from "./telephony-sender.resolver";
import { isVoiceCapable } from "./phone-capabilities";

/** The Twilio account + credentials a browser voice call runs under. */
export type VoiceAccount = {
  mode: "platform" | "subaccount";
  accountSid: string;
  /** The number the callee sees (`<Dial callerId>`). */
  callerId: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
};

type VoiceSettings = {
  voiceApiKeySid?: string;
  voiceApiKeySecret?: string; // encrypted at rest
  voiceTwimlAppSid?: string;
  /** The autodialer's own TwiML app on this subaccount (voiceUrl → dialler IVR). */
  voiceDialerTwimlAppSid?: string;
};

/**
 * Resolves which Twilio account a browser (WebRTC) voice call for a tenant runs
 * under, integrating the per-tenant number provisioning (meld doc 09 telephony).
 * When the tenant has an ACTIVE provisioned transactional number, calls originate
 * from that number on its subaccount — lazily creating + caching a per-subaccount
 * voice API key + TwiML App in TelephonyAccount.settings. Otherwise the platform
 * account + TWILIO_VOICE_FROM (the pre-provisioning behaviour).
 */
@Injectable()
export class VoiceAccountResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly twilio: TwilioService,
    private readonly senders: TelephonySenderResolver,
  ) {}

  private voiceOutboundUrl(): string {
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/voice-outbound`;
  }

  /** The dialler TwiML app's voice URL — a widget caller lands on the autodialer IVR. */
  private dialerVoiceUrl(): string {
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/autodialer/ivr/session-answer`;
  }

  /** Status callback for calls the dialler app places (same fallback chain as placeCall). */
  private voiceStatusCallbackUrl(): string {
    const explicit = this.config.get<string>("TWILIO_VOICE_STATUS_CALLBACK_URL", "").trim();
    if (explicit) return explicit;
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/voice-status-callback`;
  }

  private platformCallerId(): string {
    // AU mobiles are never a voice caller ID — a +614 platform number yields ""
    // (the "no voice number" marker voiceToken turns into VOICE_NUMBER_REQUIRED).
    const preferred = this.config.get<string>("TWILIO_VOICE_FROM", "").trim();
    if (isVoiceCapable(preferred)) return preferred;
    const fallback = this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    return isVoiceCapable(fallback) ? fallback : "";
  }

  /**
   * The platform account for tenants without a provisioned subaccount (the uprise-wide
   * base). Uses explicit `TWILIO_API_KEY_*` + `TWILIO_TWIML_APP_SID` env when set;
   * otherwise auto-provisions a voice API key + TwiML App from the platform SMS
   * credentials (TWILIO_ACCOUNT_SID/AUTH_TOKEN) so no extra console setup is needed.
   */
  private async resolvePlatformAccount(): Promise<VoiceAccount> {
    const accountSid = this.config.get<string>("TWILIO_ACCOUNT_SID", "").trim();
    const base = {
      mode: "platform" as const,
      accountSid,
      callerId: this.platformCallerId(),
    };
    const envApiKeySid = this.config.get<string>("TWILIO_API_KEY_SID", "").trim();
    const envApiKeySecret = this.config.get<string>("TWILIO_API_KEY_SECRET", "").trim();
    const envTwimlAppSid = this.config.get<string>("TWILIO_TWIML_APP_SID", "").trim();
    if (envApiKeySid && envApiKeySecret && envTwimlAppSid) {
      return { ...base, apiKeySid: envApiKeySid, apiKeySecret: envApiKeySecret, twimlAppSid: envTwimlAppSid };
    }
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN", "").trim();
    const voice = await this.ensurePlatformVoiceApp(accountSid, authToken);
    return { ...base, ...voice };
  }

  /** The account (+ caller id) a browser call for `tenantId` places calls under. */
  async resolveForTenant(tenantId: string): Promise<VoiceAccount> {
    const sender = await this.senders.resolve({ tenantId, purpose: "transactional" });
    // A tenant sender that is an AU mobile (+614) is SMS-only — never dial from it.
    if (!sender?.from || !isVoiceCapable(sender.from)) return this.resolvePlatformAccount();
    const voice = await this.ensureSubaccountVoiceApp(sender);
    return {
      mode: "subaccount",
      accountSid: sender.accountSid,
      callerId: sender.from,
      apiKeySid: voice.apiKeySid,
      apiKeySecret: voice.apiKeySecret,
      twimlAppSid: voice.twimlAppSid,
    };
  }

  /**
   * The account a click-to-call widget session's voice token signs against.
   * Same account selection as `resolveForTenant`, but the VoiceGrant points at
   * the account's DIALLER TwiML app (voiceUrl → /autodialer/ivr/session-answer),
   * so anonymous widget tokens can never reach the softphone's TwiML surface.
   */
  async resolveDialerForTenant(tenantId: string): Promise<VoiceAccount> {
    const sender = await this.senders.resolve({ tenantId, purpose: "transactional" });
    if (!sender?.from || !isVoiceCapable(sender.from)) {
      const platform = await this.resolvePlatformAccount();
      // Explicit env pin wins (mirrors TWILIO_TWIML_APP_SID); else the
      // PlatformVoiceApp row lazily grows its dialler app.
      const envDialerApp = this.config.get<string>("TWILIO_DIALER_TWIML_APP_SID", "").trim();
      if (envDialerApp) return { ...platform, twimlAppSid: envDialerApp };
      const dialerAppSid = await this.ensurePlatformDialerApp(platform.accountSid);
      return { ...platform, twimlAppSid: dialerAppSid };
    }
    const voice = await this.ensureSubaccountVoiceApp(sender);
    const dialerAppSid = await this.ensureSubaccountDialerApp(sender);
    return {
      mode: "subaccount",
      accountSid: sender.accountSid,
      callerId: sender.from,
      apiKeySid: voice.apiKeySid,
      apiKeySecret: voice.apiKeySecret,
      twimlAppSid: dialerAppSid,
    };
  }

  /**
   * The caller-id for a webhook running under `accountSid` (tenant number or platform).
   * Cheap by design — never triggers lazy voice-app creation (that would run inside a
   * Twilio webhook), so it reads the platform number straight from config.
   */
  async callerIdForAccount(tenantId: string, accountSid: string): Promise<string> {
    const sender = await this.senders.resolve({ tenantId, purpose: "transactional" });
    if (sender?.from && isVoiceCapable(sender.from) && sender.accountSid === accountSid) {
      return sender.from;
    }
    return this.platformCallerId();
  }

  /** Get-or-create the platform account's voice app, persisted in PlatformVoiceApp. */
  private async ensurePlatformVoiceApp(
    accountSid: string,
    authToken: string,
  ): Promise<{ apiKeySid: string; apiKeySecret: string; twimlAppSid: string }> {
    const existing = await this.prisma.platformVoiceApp.findUnique({ where: { accountSid } });
    if (existing) {
      return {
        apiKeySid: existing.apiKeySid,
        apiKeySecret: this.crypto.decrypt(existing.encryptedApiKeySecret),
        twimlAppSid: existing.twimlAppSid,
      };
    }
    const created = await this.twilio.createVoiceApp({ accountSid, authToken }, this.voiceOutboundUrl());
    const encryptedApiKeySecret = this.crypto.encrypt(created.apiKeySecret);
    await this.prisma.platformVoiceApp.upsert({
      where: { accountSid },
      create: { accountSid, apiKeySid: created.apiKeySid, encryptedApiKeySecret, twimlAppSid: created.twimlAppSid },
      update: { apiKeySid: created.apiKeySid, encryptedApiKeySecret, twimlAppSid: created.twimlAppSid },
    });
    return created;
  }

  /**
   * Get-or-create the platform account's DIALLER TwiML app, persisted on the
   * PlatformVoiceApp row (dialerTwimlAppSid). Creates the base voice app first
   * when no row exists yet (the env-pinned softphone path never writes one).
   */
  private async ensurePlatformDialerApp(accountSid: string): Promise<string> {
    const authToken = this.config.get<string>("TWILIO_AUTH_TOKEN", "").trim();
    let row = await this.prisma.platformVoiceApp.findUnique({ where: { accountSid } });
    if (!row) {
      await this.ensurePlatformVoiceApp(accountSid, authToken);
      row = await this.prisma.platformVoiceApp.findUnique({ where: { accountSid } });
    }
    if (row?.dialerTwimlAppSid) return row.dialerTwimlAppSid;
    const sid = await this.twilio.createTwimlApp(
      { accountSid, authToken },
      this.dialerVoiceUrl(),
      "uprise-dialer",
      this.voiceStatusCallbackUrl(),
    );
    await this.prisma.platformVoiceApp.update({
      where: { accountSid },
      data: { dialerTwimlAppSid: sid },
    });
    return sid;
  }

  /** Get-or-create the subaccount's dialler TwiML app, cached in settings. */
  private async ensureSubaccountDialerApp(sender: ResolvedSender): Promise<string> {
    const account = await this.prisma.telephonyAccount.findFirst({
      where: { accountSid: sender.accountSid, status: "ACTIVE" },
    });
    const settings = (account?.settings ?? {}) as VoiceSettings & Record<string, unknown>;
    if (settings.voiceDialerTwimlAppSid) return settings.voiceDialerTwimlAppSid;
    const sid = await this.twilio.createTwimlApp(
      sender,
      this.dialerVoiceUrl(),
      "uprise-dialer",
      this.voiceStatusCallbackUrl(),
    );
    if (account) {
      await this.prisma.telephonyAccount.update({
        where: { id: account.id },
        data: { settings: { ...settings, voiceDialerTwimlAppSid: sid } },
      });
    }
    return sid;
  }

  /** Get-or-create the subaccount's voice API key + TwiML App, cached in settings. */
  private async ensureSubaccountVoiceApp(
    sender: ResolvedSender,
  ): Promise<{ apiKeySid: string; apiKeySecret: string; twimlAppSid: string }> {
    const account = await this.prisma.telephonyAccount.findFirst({
      where: { accountSid: sender.accountSid, status: "ACTIVE" },
    });
    const settings = (account?.settings ?? {}) as VoiceSettings & Record<string, unknown>;
    if (settings.voiceApiKeySid && settings.voiceApiKeySecret && settings.voiceTwimlAppSid) {
      return {
        apiKeySid: settings.voiceApiKeySid,
        apiKeySecret: this.crypto.decrypt(settings.voiceApiKeySecret),
        twimlAppSid: settings.voiceTwimlAppSid,
      };
    }
    const created = await this.twilio.createVoiceApp(sender, this.voiceOutboundUrl());
    if (account) {
      await this.prisma.telephonyAccount.update({
        where: { id: account.id },
        data: {
          settings: {
            ...settings,
            voiceApiKeySid: created.apiKeySid,
            voiceApiKeySecret: this.crypto.encrypt(created.apiKeySecret),
            voiceTwimlAppSid: created.twimlAppSid,
          },
        },
      });
    }
    return created;
  }
}
