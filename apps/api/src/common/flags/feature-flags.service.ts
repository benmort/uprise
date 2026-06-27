import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FEATURE_FLAG_KEYS,
  FLAG_DEFAULTS,
  FLAG_META,
  isFeatureFlagKey,
  type FeatureFlagKey,
  type FeatureFlagMap,
  type FlagLayer,
} from "@uprise/flags";
import { PrismaService } from "../../prisma/prisma.service";
import { OutboxService } from "../outbox/outbox.service";

/** Backwards-compatible alias for the resolved flag map. */
export type SystemFeatureFlags = FeatureFlagMap;

type Overrides = { tenant: Map<string, boolean>; plan: Map<string, boolean>; global: Map<string, boolean> };

export type FlagAdminEntry = {
  key: FeatureFlagKey;
  description: string;
  kind: string;
  controllableBy: readonly FlagLayer[];
  default: boolean;
  env: boolean | null;
  tenantOverride: boolean | null;
  planEntitlement: boolean | null;
  globalOverride: boolean | null;
  effective: boolean;
  source: FlagLayer | "default";
};

// Short TTL: the API is serverless (many instances), so each resolves from its
// own memory. The TTL bounds staleness without a DB hit per request; a write
// invalidates the instance that handled it. No cross-instance invalidation.
const CACHE_TTL_MS = 30_000;

@Injectable()
export class FeatureFlagsService {
  private readonly cache = new Map<string, { map: FeatureFlagMap; expiry: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Sync env-layer getter — only FEATURE_JOURNEYS_ENABLED still resolves from
  //    an env kill-switch; every other flag is plan-/global-driven via resolveAll. ──
  isJourneysEnabled(): boolean { return this.envOrDefault("FEATURE_JOURNEYS_ENABLED"); }

  private envOrDefault(key: FeatureFlagKey): boolean {
    return this.envValue(key) ?? FLAG_DEFAULTS[key];
  }

  /** The env override: a boolean iff the flag's env var is explicitly set, else undefined. */
  private envValue(key: FeatureFlagKey): boolean | undefined {
    const raw = process.env[FLAG_META[key].envVar];
    if (raw === undefined || raw.trim() === "") return undefined;
    const v = raw.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  // ── Async layered resolution: env › tenant › (plan, P2) › global › default ──

  async resolveAll(ctx: { tenantId?: string | null }): Promise<FeatureFlagMap> {
    const tenantId = ctx.tenantId ?? null;
    const cacheKey = tenantId ?? "_global";
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiry > Date.now()) return hit.map;
    const overrides = await this.loadOverrides(tenantId);
    const map = {} as FeatureFlagMap;
    for (const key of FEATURE_FLAG_KEYS) map[key] = this.resolveOne(key, overrides).enabled;
    this.cache.set(cacheKey, { map, expiry: Date.now() + CACHE_TTL_MS });
    return map;
  }

  async isEnabled(key: FeatureFlagKey, ctx: { tenantId?: string | null }): Promise<boolean> {
    return (await this.resolveAll(ctx))[key];
  }

  async getAdminView(ctx: { tenantId?: string | null }): Promise<FlagAdminEntry[]> {
    const overrides = await this.loadOverrides(ctx.tenantId ?? null);
    return FEATURE_FLAG_KEYS.map((key) => {
      const meta = FLAG_META[key];
      const resolved = this.resolveOne(key, overrides);
      return {
        key,
        description: meta.description,
        kind: meta.kind,
        controllableBy: meta.controllableBy,
        default: meta.default,
        env: meta.controllableBy.includes("env") ? (this.envValue(key) ?? null) : null,
        tenantOverride: overrides.tenant.get(key) ?? null,
        planEntitlement: overrides.plan.get(key) ?? null,
        globalOverride: overrides.global.get(key) ?? null,
        effective: resolved.enabled,
        source: resolved.source,
      };
    });
  }

  private async loadOverrides(tenantId: string | null): Promise<Overrides> {
    const rows = await this.prisma.featureFlagOverride.findMany({
      where: tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null },
    });
    const tenant = new Map<string, boolean>();
    const global = new Map<string, boolean>();
    for (const r of rows) (r.tenantId ? tenant : global).set(r.flagKey, r.enabled);
    const plan = await this.loadPlanEntitlements(tenantId);
    return { tenant, plan, global };
  }

  /** The tenant's plan entitlements: tenant → network → plan.featureFlags. */
  private async loadPlanEntitlements(tenantId: string | null): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (!tenantId) return map;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { networkId: true },
    });
    if (!tenant?.networkId) return map;
    const network = await this.prisma.network.findUnique({
      where: { id: tenant.networkId },
      select: { planName: true },
    });
    if (!network?.planName) return map;
    const plan = await this.prisma.plan.findUnique({
      where: { key: network.planName },
      select: { featureFlags: true, archivedAt: true },
    });
    if (!plan || plan.archivedAt) return map;
    const ff = plan.featureFlags as Record<string, unknown> | null;
    if (ff && typeof ff === "object") {
      for (const [k, v] of Object.entries(ff)) if (typeof v === "boolean") map.set(k, v);
    }
    return map;
  }

  private resolveOne(
    key: FeatureFlagKey,
    o: Overrides,
  ): { enabled: boolean; source: FlagLayer | "default" } {
    const meta = FLAG_META[key];
    if (meta.controllableBy.includes("env")) {
      const env = this.envValue(key);
      if (env !== undefined) return { enabled: env, source: "env" };
    }
    if (meta.controllableBy.includes("tenant")) {
      const t = o.tenant.get(key);
      if (t !== undefined) return { enabled: t, source: "tenant" };
    }
    if (meta.controllableBy.includes("plan")) {
      const p = o.plan.get(key);
      if (p !== undefined) return { enabled: p, source: "plan" };
    }
    if (meta.controllableBy.includes("global")) {
      const g = o.global.get(key);
      if (g !== undefined) return { enabled: g, source: "global" };
    }
    return { enabled: meta.default, source: "default" };
  }

  // ── Writes: set/clear an override + emit the domain event in one transaction ──

  /** enabled=null clears the override (falls back to the next layer). */
  async setOverride(input: {
    tenantId: string | null;
    flagKey: string;
    enabled: boolean | null;
    updatedBy?: string | null;
  }): Promise<void> {
    if (!isFeatureFlagKey(input.flagKey)) {
      throw new BadRequestException(`Unknown feature flag: ${input.flagKey}`);
    }
    const layer: FlagLayer = input.tenantId ? "tenant" : "global";
    if (!FLAG_META[input.flagKey].controllableBy.includes(layer)) {
      throw new BadRequestException(`Flag ${input.flagKey} is not ${layer}-controllable`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlagOverride.deleteMany({
        where: { tenantId: input.tenantId, flagKey: input.flagKey },
      });
      if (input.enabled !== null) {
        await tx.featureFlagOverride.create({
          data: {
            tenantId: input.tenantId,
            flagKey: input.flagKey,
            enabled: input.enabled,
            updatedBy: input.updatedBy ?? null,
          },
        });
      }
      await this.outbox.append(tx, {
        tenantId: input.tenantId ?? "system",
        eventType: "system.flag.changed",
        aggregateId: input.flagKey,
        payload: { flagKey: input.flagKey, tenantId: input.tenantId, enabled: input.enabled },
      });
    });
    this.invalidate(input.tenantId);
  }

  /** Drop cached resolutions. A global change can affect every tenant. */
  invalidate(tenantId: string | null): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}
