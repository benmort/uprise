import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adminSrc = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(adminSrc, rel), "utf8");

const settingsIndex = read("app/(main)/settings/page.tsx");
const observability = read("components/settings/observability.tsx");
const general = read("app/(main)/future/tenant-settings/general-settings.tsx");
const sectionRoute = read("app/(main)/settings/[section]/page.tsx");
const queues = read("app/(main)/settings/queues/page.tsx");

describe("settings consolidated into the tabbed General page", () => {
  it("/settings redirects to the first General tab", () => {
    expect(settingsIndex).toContain("redirect");
    expect(settingsIndex).toContain("/settings/tenant");
  });

  it("General tabs are served as real /settings/[section] routes", () => {
    expect(sectionRoute).toContain("GeneralSettings");
    expect(sectionRoute).toContain("sectionToTab");
  });

  it("General page exposes the former /settings cards as tabs", () => {
    expect(general).toContain("Alerts");
    expect(general).toContain("Feature Flags");
    expect(general).toContain("Queue & Redis");
    expect(general).toContain("Access");
    expect(general).toContain("Integrations");
    expect(general).toContain("ResponderAlertsSettings");
    expect(general).toContain("TenantFeatureFlagsEditor");
    expect(general).toContain("TenantQueueRedisPanel");
  });
});

describe("shared observability sections", () => {
  it("Tenant Feature Flags editor is wired to per-tenant override endpoints", () => {
    expect(observability).toContain("getFlagAdmin");
    expect(observability).toContain("setTenantFlag");
  });
  it("Tenant Queue & Redis panel reads per-tenant job health", () => {
    expect(observability).toContain("getTenantActivity");
  });
  it("super-admin lock + fetch states present", () => {
    expect(observability).toContain("TenantLockedSection");
    expect(observability).toContain("Restricted to super admins");
    expect(observability).toContain("EmptyState");
    expect(observability).toContain("Skeleton");
  });
});

describe("global (super-admin) queue stats page", () => {
  it("renders the platform-wide Queue & Redis Stats from the global endpoint", () => {
    expect(queues).toContain("Queue & Redis Stats");
    expect(queues).toContain("Queue Prefix:");
    expect(queues).toContain("Redis");
    expect(queues).toContain("getQueueStats");
  });
});
