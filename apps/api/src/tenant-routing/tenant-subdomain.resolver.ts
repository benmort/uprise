import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tenantSlugFromPlatformHost } from "@uprise/domains";
import { PrismaService } from "../prisma/prisma.service";

/** What a host resolves to when it names a tenant. */
export interface HostTenant {
  tenantId: string;
}

/** Cache TTL for slug → tenant lookups (the resolver is on the per-request hot path). */
const SLUG_CACHE_TTL_MS = 60_000;

/**
 * Maps a request host to its tenant for host-based scoping (meld doc 14 + the tenant
 * subdomain plan). A `<slug>.<PLATFORM_BASE_DOMAIN>` host resolves to that tenant; a
 * platform APP host (`admin.`, `auth.`, `api.` …), the apex, or an unknown slug resolve
 * to `null` — meaning "no host tenant, fall back to the session" (today's behaviour,
 * unchanged). Part B (custom white-label domains) extends `resolve()` with a DB-backed
 * custom-parent branch; Part A is the platform-subdomain case only.
 */
@Injectable()
export class TenantSubdomainResolver {
  // slug → { tenantId|null }. A short TTL keeps the per-request lookup cheap while a
  // newly-created / renamed tenant becomes routable within ~SLUG_CACHE_TTL_MS.
  private readonly slugCache = new Map<string, { tenantId: string | null; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** The single per-env platform root that `<slug>.<root>` subdomains hang off. */
  private platformRoots(): string[] {
    const base = this.config.get<string>("PLATFORM_BASE_DOMAIN", "uprise.org.au").trim();
    return base ? [base] : [];
  }

  /** Resolve a request host to its tenant, or `null` for a platform surface. */
  async resolve(host: string): Promise<HostTenant | null> {
    const slug = tenantSlugFromPlatformHost(host, this.platformRoots());
    if (!slug) return null;
    const tenantId = await this.tenantIdForSlug(slug);
    return tenantId ? { tenantId } : null;
  }

  private async tenantIdForSlug(slug: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.slugCache.get(slug);
    if (cached && cached.expiresAt > now) return cached.tenantId;
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    const tenantId = tenant?.id ?? null;
    this.slugCache.set(slug, { tenantId, expiresAt: now + SLUG_CACHE_TTL_MS });
    return tenantId;
  }

  /** Drop the slug cache — call after a tenant slug change / soft-delete. */
  invalidate(): void {
    this.slugCache.clear();
  }
}
