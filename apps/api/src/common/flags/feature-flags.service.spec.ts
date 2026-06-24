import { FeatureFlagsService } from "./feature-flags.service";

type Row = { tenantId: string | null; flagKey: string; enabled: boolean };

function makeService(rows: Row[]): FeatureFlagsService {
  const prisma = {
    featureFlagOverride: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as ConstructorParameters<typeof FeatureFlagsService>[1];
  return new FeatureFlagsService(
    {} as ConstructorParameters<typeof FeatureFlagsService>[0],
    prisma,
    {} as ConstructorParameters<typeof FeatureFlagsService>[2],
  );
}

describe("FeatureFlagsService.resolveAll precedence", () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = ["FEATURE_WHATSAPP_ENABLED", "FEATURE_AI_ASSIST_ENABLED", "FEATURE_BULLMQ_UPLOAD_ENABLED"];
  beforeEach(() => envKeys.forEach((k) => (saved[k] = process.env[k])));
  afterEach(() => envKeys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]!))));

  it("falls back to the catalogue default with no env/override", async () => {
    envKeys.forEach((k) => delete process.env[k]);
    const flags = await makeService([]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false); // default false
    expect(flags.FEATURE_REALTIME_ENABLED).toBe(true); // default true
  });

  it("a per-tenant override beats the default", async () => {
    delete process.env.FEATURE_WHATSAPP_ENABLED;
    const flags = await makeService([{ tenantId: "t1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true }]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(true);
  });

  it("the env kill-switch beats a per-tenant override", async () => {
    process.env.FEATURE_WHATSAPP_ENABLED = "false";
    const flags = await makeService([{ tenantId: "t1", flagKey: "FEATURE_WHATSAPP_ENABLED", enabled: true }]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_WHATSAPP_ENABLED).toBe(false);
  });

  it("an ops (env-only) flag ignores a tenant override", async () => {
    delete process.env.FEATURE_BULLMQ_UPLOAD_ENABLED;
    const flags = await makeService([{ tenantId: "t1", flagKey: "FEATURE_BULLMQ_UPLOAD_ENABLED", enabled: true }]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_BULLMQ_UPLOAD_ENABLED).toBe(false); // tenant layer not allowed → default
  });

  it("a global override applies when there is no tenant override", async () => {
    delete process.env.FEATURE_AI_ASSIST_ENABLED;
    const flags = await makeService([{ tenantId: null, flagKey: "FEATURE_AI_ASSIST_ENABLED", enabled: false }]).resolveAll({ tenantId: "t1" });
    expect(flags.FEATURE_AI_ASSIST_ENABLED).toBe(false); // default true, global forces false
  });
});
