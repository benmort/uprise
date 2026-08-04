import { ConfigService } from "@nestjs/config";
import { ActionsRateLimitService } from "./actions-rate-limit.service";
import type { ApiHttpException } from "../common/http/api-response";

/** ApiHttpException nests the code at response.error.code. */
async function expectRateLimited(p: Promise<unknown>): Promise<void> {
  try {
    await p;
    throw new Error("expected RATE_LIMITED throw");
  } catch (err) {
    const e = err as ApiHttpException;
    expect(e.getStatus()).toBe(429);
    expect((e.getResponse() as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  }
}
import type { AutodialerFacade } from "./autodialer.facade";

function makeService(env: Record<string, string> = {}, counts = { today: 0, active: 0 }) {
  const config = { get: (k: string, d?: string) => env[k] ?? d } as unknown as ConfigService;
  const countSessions = jest.fn(async (_page: string, opts: { since?: Date; activeOnly?: boolean }) =>
    opts.activeOnly ? counts.active : counts.today,
  );
  const facade = { countSessions } as unknown as AutodialerFacade;
  return { service: new ActionsRateLimitService(config, facade), countSessions };
}

describe("ActionsRateLimitService", () => {
  it("allows requests under every window", async () => {
    const { service } = makeService();
    await expect(service.assertWithinLimits("p1", "1.1.1.1")).resolves.toBeUndefined();
  });

  it("trips the per-IP minute window at the limit", async () => {
    const { service } = makeService({ ACTIONS_RATE_IP_PER_MINUTE: "2" });
    const now = Date.now();
    await service.assertWithinLimits("p1", "9.9.9.9", now);
    await service.assertWithinLimits("p2", "9.9.9.9", now + 1);
    await expectRateLimited(service.assertWithinLimits("p3", "9.9.9.9", now + 2));
  });

  it("resets a window once it has elapsed", async () => {
    const { service } = makeService({ ACTIONS_RATE_IP_PER_MINUTE: "1", ACTIONS_RATE_IP_PER_HOUR: "1000" });
    const now = Date.now();
    await service.assertWithinLimits("p1", "2.2.2.2", now);
    await expect(service.assertWithinLimits("p1", "2.2.2.2", now + 61_000)).resolves.toBeUndefined();
  });

  it("trips the durable per-page daily cap from the facade count", async () => {
    const { service } = makeService({ ACTIONS_MAX_SESSIONS_PER_DAY: "10" }, { today: 10, active: 0 });
    await expectRateLimited(service.assertWithinLimits("p1", "3.3.3.3"));
  });

  it("trips the durable concurrent cap", async () => {
    const { service } = makeService({ ACTIONS_MAX_CONCURRENT_SESSIONS: "2" }, { today: 0, active: 2 });
    await expectRateLimited(service.assertWithinLimits("p1", "4.4.4.4"));
  });

  it("skips the DB caps entirely when an in-memory window already tripped", async () => {
    const { service, countSessions } = makeService({ ACTIONS_RATE_IP_PER_MINUTE: "1" });
    const now = Date.now();
    await service.assertWithinLimits("p1", "5.5.5.5", now);
    await expectRateLimited(service.assertWithinLimits("p1", "5.5.5.5", now + 1));
    // one successful pass = 2 facade calls; the tripped pass must add none
    expect(countSessions).toHaveBeenCalledTimes(2);
  });
});
