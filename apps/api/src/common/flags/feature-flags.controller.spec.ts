import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

describe("FeatureFlagsController", () => {
  it("returns system feature flag snapshot", () => {
    const expected = {
      FEATURE_REALTIME_ENABLED: true,
      FEATURE_AI_ASSIST_ENABLED: true,
      FEATURE_BLAST_SCHEDULER_ENABLED: true,
      FEATURE_BULLMQ_UPLOAD_ENABLED: false,
      FEATURE_BULLMQ_BLAST_ENABLED: true,
      BLAST_DRY_RUN: true,
    };
    const flags = {
      getSystemFeatureFlags: jest.fn().mockReturnValue(expected),
    } as unknown as FeatureFlagsService;
    const controller = new FeatureFlagsController(flags);

    expect(controller.getFeatureFlags()).toEqual(expected);
  });
});
