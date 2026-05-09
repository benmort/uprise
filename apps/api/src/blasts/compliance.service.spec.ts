import { ConfigService } from "@nestjs/config";
import { ComplianceService } from "./compliance.service";

describe("ComplianceService", () => {
  const config = {
    get: (key: string, fallback?: any) => {
      const map: Record<string, any> = {
        REQUIRE_OPTOUT_LANGUAGE: true,
        QUIET_HOURS_START: 21,
        QUIET_HOURS_END: 8,
      };
      return key in map ? map[key] : fallback;
    },
  } as ConfigService;

  it("warns when opt-out language is missing", () => {
    const service = new ComplianceService(config);
    const res = service.validateMessageForSend("Hi there");
    expect(res.ok).toBe(false);
    expect(res.warnings[0]).toMatch(/opt-out/i);
  });

  it("passes when message has opt-out language outside quiet hours", () => {
    const service = new ComplianceService(config);
    const res = service.validateMessageForSend(
      "Hello there. Reply STOP to opt out.",
      new Date("2026-05-08T10:00:00"),
    );
    expect(res.warnings.length).toBe(0);
  });
});
