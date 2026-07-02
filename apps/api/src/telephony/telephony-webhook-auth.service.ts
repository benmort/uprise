import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";

export type InboundResolution = {
  /** Auth token the X-Twilio-Signature must have been computed with. */
  authToken: string;
  /** Tenant routing when the To number is a provisioned tenant number. */
  tenantId: string | null;
  campaignId: string | null;
};

/**
 * Resolves which Twilio auth token signed a webhook. With per-tenant
 * subaccounts, Twilio signs each webhook with the SENDING account's token —
 * the platform token only validates platform-account traffic. Resolution is
 * deterministic: the specific account's token when the webhook maps to a
 * provisioned number/account/bundle, otherwise the platform env token. Never
 * try-both-and-accept.
 *
 * NOT flag-gated: once a number row exists, its webhooks must validate
 * correctly regardless of the outbound-resolution flag.
 */
@Injectable()
export class TelephonyWebhookAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  private platformToken(): string {
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN", "").trim();
    if (!token) throw new UnauthorizedException("TWILIO_AUTH_TOKEN not configured");
    return token;
  }

  /** Inbound SMS/WhatsApp: token + tenant routing by the To number. */
  async resolveInbound(toE164: string): Promise<InboundResolution> {
    const number = toE164
      ? await this.prisma.telephonyPhoneNumber.findUnique({
          where: { phoneNumberE164: toE164 },
        })
      : null;
    if (!number) return { authToken: this.platformToken(), tenantId: null, campaignId: null };
    const account = await this.prisma.telephonyAccount.findFirst({ where: { id: number.accountId } });
    if (!account) return { authToken: this.platformToken(), tenantId: null, campaignId: null };
    return {
      authToken: this.crypto.decrypt(account.encryptedAuthToken),
      tenantId: number.tenantId,
      campaignId: number.campaignId,
    };
  }

  /** Status callbacks: token by the AccountSid Twilio posts with every event. */
  async tokenForAccountSid(accountSid?: string | null): Promise<string> {
    const sid = (accountSid ?? "").trim();
    if (!sid) return this.platformToken();
    const platformSid = this.config.get<string>("TWILIO_ACCOUNT_SID", "").trim();
    if (sid === platformSid) return this.platformToken();
    const account = await this.prisma.telephonyAccount.findUnique({ where: { accountSid: sid } });
    if (!account) return this.platformToken();
    return this.crypto.decrypt(account.encryptedAuthToken);
  }

  /** Regulatory-bundle status callbacks: token via the run's provisioning account. */
  async tokenForBundleSid(bundleSid?: string | null): Promise<string> {
    const sid = (bundleSid ?? "").trim();
    if (!sid) return this.platformToken();
    const run = await this.prisma.telephonyProvisioningRun.findUnique({ where: { bundleSid: sid } });
    const account = run?.accountId
      ? await this.prisma.telephonyAccount.findFirst({ where: { id: run.accountId } })
      : null;
    if (!account) return this.platformToken();
    return this.crypto.decrypt(account.encryptedAuthToken);
  }
}
