import { IntegrationJobStatus } from "@uprise/db";
import { isSyncStalled } from "./audiences.service";

describe("isSyncStalled", () => {
  const now = 1_700_000_000_000;
  const at = (msAgo: number) => new Date(now - msAgo);

  it("flags a QUEUED job that has waited past the queued threshold (worker not consuming)", () => {
    expect(isSyncStalled(IntegrationJobStatus.QUEUED, at(3 * 60_000), null, now)).toBe(true);
  });

  it("does not flag a freshly QUEUED job still within grace", () => {
    expect(isSyncStalled(IntegrationJobStatus.QUEUED, at(10_000), null, now)).toBe(false);
  });

  it("flags a RUNNING job stuck well past a chunk's run budget (died mid-run)", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(10 * 60_000), at(6 * 60_000), now)).toBe(true);
  });

  it("does not flag a RUNNING job still within budget", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(10 * 60_000), at(30_000), now)).toBe(false);
  });

  it("falls back to createdAt when a RUNNING job has no startedAt", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(6 * 60_000), null, now)).toBe(true);
  });

  it("never flags terminal states, however old", () => {
    expect(isSyncStalled(IntegrationJobStatus.SUCCEEDED, at(60 * 60_000), null, now)).toBe(false);
    expect(isSyncStalled(IntegrationJobStatus.FAILED, at(60 * 60_000), null, now)).toBe(false);
  });
});
