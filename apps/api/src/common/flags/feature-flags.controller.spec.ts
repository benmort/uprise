import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

describe("FeatureFlagsController", () => {
  it("resolves effective flags for the caller's tenant", async () => {
    const expected = {
      FEATURE_REALTIME_ENABLED: true,
      FEATURE_WHATSAPP_ENABLED: false,
    } as unknown as Awaited<ReturnType<FeatureFlagsService["resolveAll"]>>;
    const resolveAll = jest.fn().mockResolvedValue(expected);
    const flags = { resolveAll } as unknown as FeatureFlagsService;
    const controller = new FeatureFlagsController(flags);
    const req = { user: { tenantId: "t1" } } as unknown as Parameters<FeatureFlagsController["list"]>[0];

    await expect(controller.list(req)).resolves.toEqual(expected);
    expect(resolveAll).toHaveBeenCalledWith({ tenantId: "t1" });
  });
});
