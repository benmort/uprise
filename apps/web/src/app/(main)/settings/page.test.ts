import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(process.cwd(), "src", "app", "(main)", "settings", "page.tsx");

describe("settings page queue stats", () => {
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
