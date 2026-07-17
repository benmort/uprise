import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import committed from "@/generated/sitemap.json";
import { liveOrigin, routeHref, sitemap, type SitemapApp } from "./sitemap";

const marketing: SitemapApp = { key: "product-marketing", label: "Product marketing", prodUrl: "https://uprise.org.au", routeCount: 1, routes: [] };
const admin: SitemapApp = { key: "admin", label: "Admin", prodUrl: "https://admin.uprise.org.au", routeCount: 1, routes: [] };

describe("sitemap lib", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routeHref returns null for a dynamic pattern and a full URL for a static route", () => {
    expect(routeHref(marketing, { path: "/plans/[id]", dynamic: true, group: null })).toBeNull();
    expect(routeHref(marketing, { path: "/plans", dynamic: false, group: null })).toBe("https://uprise.org.au/plans");
    // Root path doesn't double the slash.
    expect(routeHref(marketing, { path: "/", dynamic: false, group: null })).toBe("https://uprise.org.au");
  });

  it("liveOrigin falls back to the prod URL for apex-domain marketing apps", () => {
    expect(liveOrigin("product-marketing", "https://uprise.org.au")).toBe("https://uprise.org.au");
  });

  it("liveOrigin derives a platform app's origin from the current host", () => {
    vi.stubGlobal("window", { location: { host: "admin.uprise.org.au", protocol: "https:" } });
    expect(liveOrigin("admin", "https://admin.uprise.org.au")).toBe("https://admin.uprise.org.au");
    // A non-derivable host (localhost) → prod fallback.
    vi.stubGlobal("window", { location: { host: "localhost:3000", protocol: "http:" } });
    expect(liveOrigin("admin", "https://admin.uprise.org.au")).toBe("https://admin.uprise.org.au");
  });

  it("exposes the six frontend apps from the manifest", () => {
    expect(sitemap.apps.map((a) => a.key)).toEqual(
      expect.arrayContaining(["admin", "auth", "action", "product-marketing", "organisation-marketing", "field"]),
    );
  });

  // Staleness guard: the committed manifest must match the on-disk routes.
  it("manifest is current — run `pnpm gen:sitemap` if this fails", async () => {
    const genPath = join(process.cwd(), "..", "..", "scripts", "gen-sitemap.mjs"); // vitest cwd = apps/admin
    const { buildManifest } = (await import(pathToFileURL(genPath).href)) as {
      buildManifest: () => { apps: SitemapApp[] };
    };
    const norm = (apps: SitemapApp[]) => apps.map((a) => ({ key: a.key, paths: a.routes.map((r) => r.path).sort() }));
    expect(norm(committed.apps as SitemapApp[])).toEqual(norm(buildManifest().apps));
  });
});
