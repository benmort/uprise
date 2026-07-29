import { FeatureFlagsService } from "./feature-flags.service";

type Row = { tenantId: string | null; flagKey: string; enabled: boolean };

/**
 * `defaultPlan` is what `findFirst({ isDefault: true })` returns — the fallback a plan-less
 * tenant resolves through. Null by default so the precedence tests below isolate the
 * tenant/network/global layers without a plan layer underneath them.
 */
function makeService(
  rows: Row[],
  defaultPlan: { featureFlags: Record<string, boolean>; archivedAt: Date | null } | null = null,
): FeatureFlagsService {
  const prisma = {
    featureFlagOverride: { findMany: jest.fn().mockResolvedValue(rows) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: null }) },
    network: { findUnique: jest.fn().mockResolvedValue(null) },
    plan: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(defaultPlan),
    },
  } as unknown as ConstructorParameters<typeof FeatureFlagsService>[1];
  return new FeatureFlagsService(
    {} as ConstructorParameters<typeof FeatureFlagsService>[0],
    prisma,
    {} as ConstructorParameters<typeof FeatureFlagsService>[2],
  );
}

describe("FeatureFlagsService.resolveAll precedence", () => {
  it("falls back to the catalogue default with no override", async () => {
    const flags = await makeService([]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false); // default false
    expect(flags.FEATURE_REALTIME_ENABLED).toBe(true); // default true
  });

  it("a per-tenant override beats the default for a plan-driven flag", async () => {
    const flags = await makeService([
      { tenantId: "t1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true);
  });

  it("ignores the env var — plan-driven flags no longer have an env layer", async () => {
    const saved = process.env.FEATURE_WHATSAPP_ENABLED;
    process.env.FEATURE_WHATSAPP_ENABLED = "false";
    try {
      const flags = await makeService([
        { tenantId: "t1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true },
      ]).resolveAll({ tenantId: "t1" });
      expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true); // env ignored; tenant override wins
    } finally {
      if (saved === undefined) delete process.env.FEATURE_WHATSAPP_ENABLED;
      else process.env.FEATURE_WHATSAPP_ENABLED = saved;
    }
  });

  it("a global-only flag ignores a tenant override", async () => {
    const flags = await makeService([
      { tenantId: "t1", flagKey: "FEATURE_BULLMQ_UPLOAD_ENABLED", enabled: true },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_BULLMQ_UPLOAD_ENABLED).toBe(false); // tenant layer not allowed → default
  });

  it("a global override drives a global-only flag", async () => {
    const flags = await makeService([
      { tenantId: null, flagKey: "FEATURE_BULLMQ_UPLOAD_ENABLED", enabled: true },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_BULLMQ_UPLOAD_ENABLED).toBe(true);
  });

  it("a global override applies to a plan-driven flag when there is no tenant override", async () => {
    const flags = await makeService([
      { tenantId: null, flagKey: "FEATURE_AI_ASSIST_ENABLED", enabled: false },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_AI_ASSIST_ENABLED).toBe(false); // default true, global forces false
  });

  // The network layer sits between tenant and plan (env › tenant › network › plan › global › default).
  function svcWith(rows: Array<{ tenantId: string | null; networkId: string | null; flagKey: string; enabled: boolean }>) {
    const prisma = {
      featureFlagOverride: { findMany: jest.fn().mockResolvedValue(rows) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: "n1" }) },
      network: { findUnique: jest.fn().mockResolvedValue({ planName: null }) },
      plan: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ConstructorParameters<typeof FeatureFlagsService>[1];
    return new FeatureFlagsService(
      {} as ConstructorParameters<typeof FeatureFlagsService>[0],
      prisma,
      {} as ConstructorParameters<typeof FeatureFlagsService>[2],
    );
  }

  it("a network override applies to the tenant when there is no tenant override", async () => {
    const flags = await svcWith([
      { tenantId: null, networkId: "n1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true); // default false, network forces on
  });

  it("a tenant override beats its network override", async () => {
    const flags = await svcWith([
      { tenantId: "t1", networkId: null, flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: false },
      { tenantId: null, networkId: "n1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true },
    ]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false); // tenant (off) wins over network (on)
  });
});

/**
 * Networks are created without a plan (`createNetwork` never sets planName), and a tenant may
 * have no network at all — so "no plan" is the common case, not an edge case. It used to mean
 * the plan layer contributed nothing and every flag fell to its catalogue default, quietly
 * withholding WhatsApp, tenant telephony and tenant email. Those tenants now resolve through
 * the plan marked isDefault (Growth).
 */
describe("FeatureFlagsService — the default plan is the plan-less baseline", () => {
  const GROWTH_FLAGS = {
    FEATURE_WHATSAPP_ENABLED: true,
    FEATURE_TENANT_TELEPHONY_ENABLED: true,
    FEATURE_TENANT_EMAIL_ENABLED: true,
    FEATURE_MULTIBRAND_ENABLED: false,
  };

  function svc(opts: {
    planName?: string | null;
    named?: { featureFlags: Record<string, boolean>; archivedAt: Date | null } | null;
    defaultPlan?: { featureFlags: Record<string, boolean>; archivedAt: Date | null } | null;
    rows?: Array<{ tenantId: string | null; networkId: string | null; flagKey: string; enabled: boolean }>;
  }) {
    const prisma = {
      featureFlagOverride: { findMany: jest.fn().mockResolvedValue(opts.rows ?? []) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: "n1" }) },
      network: { findUnique: jest.fn().mockResolvedValue({ planName: opts.planName ?? null }) },
      plan: {
        findUnique: jest.fn().mockResolvedValue(opts.named ?? null),
        findFirst: jest.fn().mockResolvedValue(opts.defaultPlan ?? null),
      },
    } as unknown as ConstructorParameters<typeof FeatureFlagsService>[1];
    return new FeatureFlagsService(
      {} as ConstructorParameters<typeof FeatureFlagsService>[0],
      prisma,
      {} as ConstructorParameters<typeof FeatureFlagsService>[2],
    );
  }

  const growth = { featureFlags: GROWTH_FLAGS, archivedAt: null };

  it("grants the default plan's entitlements when the network has no plan", async () => {
    const flags = await svc({ planName: null, defaultPlan: growth }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true); // catalogue default is false
    expect(flags.FEATURE_TENANT_TELEPHONY_ENABLED).toBe(true);
    expect(flags.FEATURE_TENANT_EMAIL_ENABLED).toBe(true);
  });

  it("does not grant what the default plan withholds", async () => {
    const flags = await svc({ planName: null, defaultPlan: growth }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_MULTIBRAND_ENABLED).toBe(false); // Scale-only
  });

  it("falls back when the named plan is archived", async () => {
    const flags = await svc({
      planName: "starter",
      named: { featureFlags: { FEATURE_WHATSAPP_ENABLED: false }, archivedAt: new Date() },
      defaultPlan: growth,
    }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true);
  });

  it("prefers the tenant's own plan over the default", async () => {
    const flags = await svc({
      planName: "grassroots",
      named: { featureFlags: { FEATURE_WHATSAPP_ENABLED: false }, archivedAt: null },
      defaultPlan: growth,
    }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false);
  });

  it("keeps the catalogue default when no plan is marked default", async () => {
    const flags = await svc({ planName: null, defaultPlan: null }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false);
  });

  it("still lets a tenant override beat the default plan", async () => {
    const flags = await svc({
      planName: null,
      defaultPlan: growth,
      rows: [{ tenantId: "t1", networkId: null, flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: false }],
    }).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false);
  });
});
