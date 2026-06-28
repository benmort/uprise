import { FeatureFlagsService } from "./feature-flags.service";

type Row = { tenantId: string | null; flagKey: string; enabled: boolean };

function makeService(rows: Row[]): FeatureFlagsService {
  const prisma = {
    featureFlagOverride: { findMany: jest.fn().mockResolvedValue(rows) },
    // no network → plan layer resolves empty (precedence tests don't exercise plans)
    tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: null }) },
    network: { findUnique: jest.fn().mockResolvedValue(null) },
    plan: { findUnique: jest.fn().mockResolvedValue(null) },
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
      plan: { findUnique: jest.fn().mockResolvedValue(null) },
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
