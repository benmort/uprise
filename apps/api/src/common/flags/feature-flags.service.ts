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

type Overrides = {
  tenant: Map<string, boolean>;
  network: Map<string, boolean>;
  plan: Map<string, boolean>;
  global: Map<string, boolean>;
};

/** A resolution target: a tenant, a network, or (both null) the platform global view. */
export type FlagTarget = { tenantId?: string | null; networkId?: string | null };

export type FlagAdminEntry = {
  key: FeatureFlagKey;
  description: string;
  kind: string;
  controllableBy: readonly FlagLayer[];
  default: boolean;
  env: boolean | null;
  tenantOverride: boolean | null;
  networkOverride: boolean | null;
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
    const overrides = await this.loadOverrides({ tenantId });
    const map = {} as FeatureFlagMap;
    for (const key of FEATURE_FLAG_KEYS) map[key] = this.resolveOne(key, overrides).enabled;
    this.cache.set(cacheKey, { map, expiry: Date.now() + CACHE_TTL_MS });
    return map;
  }

  async isEnabled(key: FeatureFlagKey, ctx: { tenantId?: string | null }): Promise<boolean> {
    return (await this.resolveAll(ctx))[key];
  }

  async getAdminView(target: FlagTarget = {}): Promise<FlagAdminEntry[]> {
    const overrides = await this.loadOverrides(target);
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
        networkOverride: overrides.network.get(key) ?? null,
        planEntitlement: overrides.plan.get(key) ?? null,
        globalOverride: overrides.global.get(key) ?? null,
        effective: resolved.enabled,
        source: resolved.source,
      };
    });
  }

  // Load every override scope relevant to a target. For a tenant: its own overrides,
  // its network's overrides + plan, and global. For a network: its overrides + plan,
  // and global. For neither (global view): just global.
  private async loadOverrides(target: FlagTarget): Promise<Overrides> {
    const tenantId = target.tenantId ?? null;
    // A tenant resolves its network from the tenant row; a network target is explicit.
    let networkId = target.networkId ?? null;
    if (tenantId) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { networkId: true },
      });
      networkId = t?.networkId ?? null;
    }
    let planName: string | null = null;
    if (networkId) {
      const n = await this.prisma.network.findUnique({
        where: { id: networkId },
        select: { planName: true },
      });
      planName = n?.planName ?? null;
    }
    const or: Array<Record<string, unknown>> = [{ tenantId: null, networkId: null }];
    if (tenantId) or.push({ tenantId });
    if (networkId) or.push({ networkId });
    const rows = await this.prisma.featureFlagOverride.findMany({ where: { OR: or } });
    const tenant = new Map<string, boolean>();
    const network = new Map<string, boolean>();
    const global = new Map<string, boolean>();
    for (const r of rows) {
      if (r.tenantId) tenant.set(r.flagKey, r.enabled);
      else if (r.networkId) network.set(r.flagKey, r.enabled);
      else global.set(r.flagKey, r.enabled);
    }
    const plan = await this.loadPlanEntitlements(planName);
    return { tenant, network, plan, global };
  }

  /** A plan's feature-flag entitlements, by plan key (Network.planName → Plan). */
  private async loadPlanEntitlements(planName: string | null): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (!planName) return map;
    const plan = await this.prisma.plan.findUnique({
      where: { key: planName },
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
    // Network-wide override: a coarser tenant override, applying to any tenant- or
    // plan-controllable flag (resolves between tenant and plan).
    if (meta.controllableBy.includes("tenant") || meta.controllableBy.includes("plan")) {
      const n = o.network.get(key);
      if (n !== undefined) return { enabled: n, source: "network" };
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

  /**
   * Set/clear an override for exactly one scope: tenant (tenantId), network (networkId),
   * or global (both null). enabled=null clears it (falls back to the next layer).
   */
  async setOverride(input: {
    tenantId?: string | null;
    networkId?: string | null;
    flagKey: string;
    enabled: boolean | null;
    updatedBy?: string | null;
  }): Promise<void> {
    if (!isFeatureFlagKey(input.flagKey)) {
      throw new BadRequestException(`Unknown feature flag: ${input.flagKey}`);
    }
    const tenantId = input.tenantId ?? null;
    const networkId = input.networkId ?? null;
    if (tenantId && networkId) {
      throw new BadRequestException("An override is tenant- or network-scoped, not both");
    }
    const meta = FLAG_META[input.flagKey];
    const layer: FlagLayer = tenantId ? "tenant" : networkId ? "network" : "global";
    // A network override applies to any tenant- or plan-controllable flag; tenant/global
    // must be declared in controllableBy.
    const allowed =
      layer === "network"
        ? meta.controllableBy.includes("tenant") || meta.controllableBy.includes("plan")
        : meta.controllableBy.includes(layer);
    if (!allowed) {
      throw new BadRequestException(`Flag ${input.flagKey} is not ${layer}-controllable`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlagOverride.deleteMany({
        where: { tenantId, networkId, flagKey: input.flagKey },
      });
      if (input.enabled !== null) {
        await tx.featureFlagOverride.create({
          data: { tenantId, networkId, flagKey: input.flagKey, enabled: input.enabled, updatedBy: input.updatedBy ?? null },
        });
      }
      await this.outbox.append(tx, {
        tenantId: tenantId ?? networkId ?? "system",
        eventType: "system.flag.changed",
        aggregateId: input.flagKey,
        payload: { flagKey: input.flagKey, tenantId, networkId, enabled: input.enabled },
      });
    });
    // A tenant change invalidates that tenant; network/global changes can affect many
    // tenants, so clear the whole cache.
    if (tenantId) this.invalidate(tenantId);
    else this.cache.clear();
  }

  /** Drop cached resolutions. A global change can affect every tenant. */
  invalidate(tenantId: string | null): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}
