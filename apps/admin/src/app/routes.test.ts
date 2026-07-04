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
    expect(source).toContain("Dashboard");
    expect(source).toContain('title="Canvassing"');
    expect(source).toContain('title="Messaging"');
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
    // /inbox renders the default folder via the shared list view; the shell
    // (breadcrumb, sidebar, compose) lives in inbox/layout.tsx.
    const source = read("inbox/page.tsx");
    expect(source).toContain("InboxFolderView");
    const layout = read("inbox/layout.tsx");
    expect(layout).toContain("Inbox");
  });

  it("renders the prog-style topbar (search + notifications + user menu)", () => {
    const source = read("layout.tsx");
    expect(source).toContain("TopbarSearch");
    expect(source).toContain("NotificationsDropdown");
    expect(source).toContain("UserDropdown");
    // The "c" quick-create-blast shortcut still routes through the shared helper.
    expect(source).toContain("createBlastAndOpen");
    const helper = read("../../lib/blasts.ts");
    expect(helper).toContain("/blasts/");
  });

  it("contains the profile page scaffold", () => {
    const source = read("profile/page.tsx");
    expect(source).toContain("Personal information");
    expect(source).toContain("profile.update");
  });

  it("contains the account page scaffold", () => {
    const source = read("account/page.tsx");
    expect(source).toContain("Change password");
    expect(source).toContain("Two-factor authentication");
  });
});
