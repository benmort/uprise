import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(process.cwd(), "src", "app", "(main)");

function read(relative: string): string {
  return readFileSync(join(appRoot, relative), "utf8");
}

describe("major route files", () => {
  it("contains dashboard page scaffold", () => {
    const source = read("dashboard/page.tsx");
    expect(source).toContain("Command centre");
    expect(source).toContain("Recent activity");
  });

  it("contains audience page scaffold", () => {
    const source = read("audience/page.tsx");
    expect(source).toContain("Build and Manage Audience Segments");
    expect(source).toContain("Upload CSV");
  });

  it("keeps legacy composer route as a redirect shim", () => {
    const source = read("composer/page.tsx");
    expect(source).toContain("/blasts/");
    expect(source).toContain("Redirecting...");
  });

  it("contains blast composer page scaffold", () => {
    const source = read("blasts/[id]/composer/page.tsx");
    expect(source).toContain("Composer");
    expect(source).toContain("Privacy Compliance");
  });

  it("contains blast details page scaffold", () => {
    const source = read("blasts/[id]/page.tsx");
    expect(source).toContain("Detailed blast analytics");
    expect(source).toContain("Open Composer");
  });

  it("contains analytics page scaffold", () => {
    const source = read("analytics/page.tsx");
    expect(source).toContain("Review Blast Performance");
    expect(source).toContain("Recipient Activity Log");
  });

  it("contains inbox page scaffold", () => {
    const source = read("inbox/page.tsx");
    expect(source).toContain("Active Conversations");
    expect(source).toContain("Type your response");
  });

  it("wires the header create blast CTA to create-and-redirect flow", () => {
    const source = read("layout.tsx");
    expect(source).toContain("createBlastAndOpen");
    expect(source).toContain("New text blast");
    // The create-and-redirect itself lives in the shared helper.
    const helper = read("../../lib/blasts.ts");
    expect(helper).toContain("/blasts/");
  });
});
