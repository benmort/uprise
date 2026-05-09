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
    expect(source).toContain("Performance Pulse");
    expect(source).toContain("Recent Blasts");
  });

  it("contains audience page scaffold", () => {
    const source = read("audience/page.tsx");
    expect(source).toContain("Audience Management");
    expect(source).toContain("Sync Integrations");
  });

  it("contains composer page scaffold", () => {
    const source = read("composer/page.tsx");
    expect(source).toContain("Composer");
    expect(source).toContain("TCPA Compliance");
  });

  it("contains analytics page scaffold", () => {
    const source = read("analytics/page.tsx");
    expect(source).toContain("Blast Analytics");
    expect(source).toContain("Recipient Activity Log");
  });

  it("contains inbox page scaffold", () => {
    const source = read("inbox/page.tsx");
    expect(source).toContain("Active Conversations");
    expect(source).toContain("Type your response");
  });

  it("wires the header create blast CTA to the composer route", () => {
    const source = read("layout.tsx");
    expect(source).toContain('Link href="/composer"');
    expect(source).toContain("Create Blast");
  });
});
