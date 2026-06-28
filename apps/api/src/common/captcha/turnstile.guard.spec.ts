import { ForbiddenException } from "@nestjs/common";
import { TurnstileGuard } from "./turnstile.guard";
import type { TurnstileService } from "./turnstile.service";
import type { VerifyOutcome } from "./turnstile.service";
import type { CaptchaTier } from "./require-captcha.decorator";

function ctx(headers: Record<string, string> = {}) {
  const request = { headers, method: "POST", path: "/x", ip: "1.2.3.4", socket: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

function makeGuard(opts: {
  tier: CaptchaTier | undefined;
  configured?: boolean;
  outcome?: VerifyOutcome;
}) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(opts.tier) };
  const turnstile = {
    isConfigured: jest.fn().mockReturnValue(opts.configured ?? true),
    verify: jest.fn().mockResolvedValue(opts.outcome ?? "pass"),
  } as unknown as TurnstileService;
  return {
    guard: new TurnstileGuard(reflector as never, turnstile),
    turnstile,
  };
}

describe("TurnstileGuard", () => {
  it("passes routes without @RequireCaptcha (no verification)", async () => {
    const { guard, turnstile } = makeGuard({ tier: undefined });
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(turnstile.verify).not.toHaveBeenCalled();
  });

  it("no-ops when Turnstile is not configured", async () => {
    const { guard, turnstile } = makeGuard({ tier: "strict", configured: false });
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(turnstile.verify).not.toHaveBeenCalled();
  });

  it("strict: rejects a missing/invalid token", async () => {
    const { guard } = makeGuard({ tier: "strict", outcome: "fail" });
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("strict: fails closed when the verifier is unavailable", async () => {
    const { guard } = makeGuard({ tier: "strict", outcome: "unavailable" });
    await expect(guard.canActivate(ctx({ "cf-turnstile-response": "t" }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("soft: fails open when the verifier is unavailable", async () => {
    const { guard } = makeGuard({ tier: "soft", outcome: "unavailable" });
    await expect(guard.canActivate(ctx({ "cf-turnstile-response": "t" }))).resolves.toBe(true);
  });

  it("soft: still rejects an explicit verification failure", async () => {
    const { guard } = makeGuard({ tier: "soft", outcome: "fail" });
    await expect(guard.canActivate(ctx({ "cf-turnstile-response": "t" }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("passes when verification passes", async () => {
    const { guard } = makeGuard({ tier: "strict", outcome: "pass" });
    await expect(guard.canActivate(ctx({ "cf-turnstile-response": "t" }))).resolves.toBe(true);
  });
});
