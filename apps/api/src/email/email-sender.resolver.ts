import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";

export type EmailSendPurpose = "transactional" | "marketing";

export type EmailSenderContext = {
  tenantId: string;
  campaignId?: string | null;
  purpose: EmailSendPurpose;
};

/** A resolved per-tenant email sender; absent ⇒ the platform SENDGRID_* env sender. */
export type ResolvedEmailSender = {
  /** Decrypted subuser/BYO API key; absent ⇒ platform env key. */
  apiKey?: string;
  fromEmail: string;
  fromName?: string;
  subuserUsername?: string;
  /** Provenance stamped onto the Email row for webhook key resolution. */
  accountId: string;
  identityId: string;
};

const CACHE_TTL_MS = 60_000;

/**
 * Resolves which SendGrid identity a send goes out on (the email twin of
 * TelephonySenderResolver). Precedence: campaign-scoped identity → tenant
 * purpose-matched default → tenant default → `undefined` (platform env — the
 * pre-feature behaviour). Purpose "transactional" matches ONLY identities
 * explicitly created with purpose "transactional" — none exist by default, so
 * all transactional mail stays on the platform `info@` sender until a tenant
 * transactional identity is deliberately provisioned.
 *
 * Gated by FEATURE_TENANT_EMAIL_ENABLED per tenant. Hits AND misses cached
 * 60 s; provisioning/revocation calls `invalidate(tenantId)`.
 */
@Injectable()
export class EmailSenderResolver {
  private readonly cache = new Map<string, { value: ResolvedEmailSender | undefined; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async resolve(ctx: EmailSenderContext): Promise<ResolvedEmailSender | undefined> {
    const enabled = await this.flags.isEnabled("FEATURE_TENANT_EMAIL_ENABLED", {
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

  private async lookup(ctx: EmailSenderContext): Promise<ResolvedEmailSender | undefined> {
    const identities = await this.prisma.emailSenderIdentity.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    if (identities.length === 0) return undefined;

    // Campaign scoping and purpose are BOTH hard filters — a campaign-scoped
    // transactional identity must never shadow a marketing send (or vice versa).
    const campaignScoped = ctx.campaignId
      ? identities.find((i) => i.campaignId === ctx.campaignId && i.purpose === ctx.purpose)
      : undefined;
    const tenantDefaults = identities.filter((i) => i.campaignId == null);
    const purposeMatched = tenantDefaults.find((i) => i.purpose === ctx.purpose);
    // Transactional NEVER falls through to a marketing identity — service mail
    // stays on the platform sender unless a transactional identity exists.
    const identity =
      campaignScoped ?? purposeMatched ?? (ctx.purpose === "transactional" ? undefined : tenantDefaults[0]);
    if (!identity) return undefined;

    const account = await this.prisma.emailAccount.findFirst({
      where: { id: identity.accountId, status: "ACTIVE" },
    });
    if (!account) return undefined;

    return {
      apiKey: account.mode === "PLATFORM" ? undefined : this.crypto.decrypt(account.encryptedApiKey),
      fromEmail: identity.fromEmail,
      fromName: identity.fromName || undefined,
      subuserUsername: account.subuserUsername ?? undefined,
      accountId: account.id,
      identityId: identity.id,
    };
  }
}
