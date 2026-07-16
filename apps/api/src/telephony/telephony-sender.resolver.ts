import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import type { ResolvedSender } from "../twilio/twilio.service";

export type SendPurpose = "transactional" | "marketing" | "whatsapp";

export type SenderContext = {
  tenantId: string;
  campaignId?: string | null;
  purpose: SendPurpose;
};

const CACHE_TTL_MS = 60_000;

/**
 * Resolves which Twilio account/number a send goes out on. Precedence:
 * campaign-scoped number → tenant purpose-matched number → tenant default →
 * `undefined` (⇒ TwilioService uses the platform TWILIO_* env credentials —
 * the pre-multi-tenant behaviour). WhatsApp stays platform-level: per-tenant
 * WhatsApp senders are a separate compliance journey.
 *
 * Gated by FEATURE_TENANT_TELEPHONY_ENABLED per tenant; off ⇒ env. Results
 * (hits AND misses) are cached 60 s so blast loops don't hit the DB per
 * recipient; provisioning/account mutations call `invalidate(tenantId)`.
 */
@Injectable()
export class TelephonySenderResolver {
  private readonly cache = new Map<string, { value: ResolvedSender | undefined; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async resolve(ctx: SenderContext): Promise<ResolvedSender | undefined> {
    if (ctx.purpose === "whatsapp") return undefined;
    const enabled = await this.flags.isEnabled("FEATURE_TENANT_TELEPHONY_ENABLED", {
      tenantId: ctx.tenantId,
    });
    if (!enabled) return undefined;

    const key = `${ctx.tenantId}:${ctx.campaignId ?? ""}:${ctx.purpose}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.lookup(ctx);
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  invalidate(tenantId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) this.cache.delete(key);
    }
  }

  /**
   * Sender for one specific provisioned number (inbox replies go out from the
   * number the contact actually texted). Undefined when the number isn't an
   * ACTIVE tenant number — the caller falls back to `resolve()` / platform env.
   */
  async resolveByNumber(tenantId: string, phoneNumberE164: string): Promise<ResolvedSender | undefined> {
    const enabled = await this.flags.isEnabled("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId });
    if (!enabled) return undefined;

    const key = `${tenantId}:num:${phoneNumberE164}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const number = await this.prisma.telephonyPhoneNumber.findFirst({
      where: { tenantId, phoneNumberE164, status: "ACTIVE" },
    });
    const account = number
      ? await this.prisma.telephonyAccount.findFirst({
          where: { id: number.accountId, status: "ACTIVE" },
        })
      : null;
    const value: ResolvedSender | undefined =
      number && account
        ? {
            accountSid: account.accountSid,
            authToken: this.crypto.decrypt(account.encryptedAuthToken),
            from: number.phoneNumberE164,
          }
        : undefined;
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /**
   * Sender for one explicitly-chosen provisioned number (a blast's `fromNumberId`).
   * Undefined when the number isn't an ACTIVE tenant number — the caller then falls
   * back to `resolve()` / platform env, so a released/reassigned choice degrades safely.
   */
  async resolveByNumberId(tenantId: string, numberId: string): Promise<ResolvedSender | undefined> {
    const enabled = await this.flags.isEnabled("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId });
    if (!enabled) return undefined;

    const key = `${tenantId}:id:${numberId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const number = await this.prisma.telephonyPhoneNumber.findFirst({
      where: { id: numberId, tenantId, status: "ACTIVE" },
    });
    const account = number
      ? await this.prisma.telephonyAccount.findFirst({
          where: { id: number.accountId, status: "ACTIVE" },
        })
      : null;
    const value: ResolvedSender | undefined =
      number && account
        ? {
            accountSid: account.accountSid,
            authToken: this.crypto.decrypt(account.encryptedAuthToken),
            from: number.phoneNumberE164,
          }
        : undefined;
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private async lookup(ctx: SenderContext): Promise<ResolvedSender | undefined> {
    const numbers = await this.prisma.telephonyPhoneNumber.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    if (numbers.length === 0) return undefined;

    const campaignScoped = ctx.campaignId
      ? numbers.find((n) => n.campaignId === ctx.campaignId)
      : undefined;
    const tenantDefaults = numbers.filter((n) => n.campaignId == null);
    const purposeMatched = tenantDefaults.find((n) => n.purpose === ctx.purpose);
    const number = campaignScoped ?? purposeMatched ?? tenantDefaults[0];
    if (!number) return undefined;

    const account = await this.prisma.telephonyAccount.findFirst({
      where: { id: number.accountId, status: "ACTIVE" },
    });
    if (!account) return undefined;

    const settings = (account.settings ?? {}) as { sendRatePerSecond?: number; maxConcurrent?: number };
    return {
      accountSid: account.accountSid,
      authToken: this.crypto.decrypt(account.encryptedAuthToken),
      from: number.phoneNumberE164,
      ratePerSecond: typeof settings.sendRatePerSecond === "number" ? settings.sendRatePerSecond : undefined,
      maxConcurrent: typeof settings.maxConcurrent === "number" ? settings.maxConcurrent : undefined,
    };
  }
}
