import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(process.cwd(), "src", "app", "(main)", "settings", "page.tsx");

describe("settings page observability sections", () => {
  it("renders feature toggles section", () => {
    const source = readFileSync(sourcePath, "utf8");
    expect(source).toContain("Feature Toggles");
    expect(source).toContain("Refresh Toggles");
    expect(source).toContain("DRY RUN ACTIVE");
    expect(source).toContain("BLAST_DRY_RUN is enabled");
    expect(source).toContain("featureFlagsLoading");
    expect(source).toContain("featureFlagsError");
    expect(source).toContain("refreshFeatureFlags");
    expect(source).toContain("getFeatureFlags");
  });

  it("renders queue and redis stats section", () => {
    const source = readFileSync(sourcePath, "utf8");
    expect(source).toContain("Queue & Redis Stats");
    expect(source).toContain("Refresh Stats");
    expect(source).toContain("Queue Prefix:");
    expect(source).toContain("Redis");
  });

  it("wires loading, error and refresh fetch states", () => {
    const source = readFileSync(sourcePath, "utf8");
    expect(source).toContain("queueStatsLoading");
    expect(source).toContain("queueStatsError");
    expect(source).toContain("refreshQueueStats");
    expect(source).toContain("setInterval");
    expect(source).toContain("EmptyState");
    expect(source).toContain("Skeleton");
    expect(source).toContain("getQueueStats");
  });
});
