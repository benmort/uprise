import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/campaigns", () => ({
  listCampaigns: vi.fn(async () => ({ ok: true, data: [{ id: "c1", name: "Camp One" }, { id: "c2", name: "Camp Two" }] })),
}));
vi.mock("@/lib/api", () => ({
  listAudiences: vi.fn(async () => ({ ok: true, data: { rows: [{ id: "a1", name: "Aud" }] } })),
  listBlasts: vi.fn(async () => ({ ok: true, data: [{ id: "b1", title: "Blast" }] })),
}));
vi.mock("@/lib/api/insights", () => ({ listPolls: vi.fn(async () => ({ ok: true, data: [{ id: "p1", title: "Poll" }] })) }));
vi.mock("@/lib/api/flags", () => ({ searchTenants: vi.fn(async () => ({ ok: true, data: [{ id: "t1", name: "Tenant" }] })) }));
vi.mock("@/lib/api/civic", () => ({
  listPoliticians: vi.fn(async () => ({ ok: true, data: [{ id: "pol1", name: "MP", displayName: "The MP" }] })),
  listPolicies: vi.fn(async () => ({ ok: true, data: [{ id: "pl1", title: "Policy" }] })),
}));

import { SITEMAP_RESOLVERS, concretePath, dynamicPrefix, isSingleDynamic, resolverFor } from "./sitemap-resolvers";

describe("sitemap-resolvers", () => {
  it("derives the dynamic prefix and single-dynamic check", () => {
    expect(dynamicPrefix("/canvass/[campaignId]/walklists")).toBe("/canvass/[campaignId]");
    expect(dynamicPrefix("/static")).toBeNull();
    expect(isSingleDynamic("/canvass/[campaignId]/walklists")).toBe(true);
    expect(isSingleDynamic("/insights/[pollId]/questions/[code]")).toBe(false);
  });

  it("resolverFor matches only single-dynamic known prefixes", () => {
    expect(resolverFor("/canvass/[campaignId]/walklists")?.prefix).toBe("/canvass/[campaignId]");
    expect(resolverFor("/insights/[pollId]/questions/[code]")).toBeNull(); // multi-dynamic
    expect(resolverFor("/invite/[token]")).toBeNull(); // no resolver for this prefix
    expect(resolverFor("/static")).toBeNull();
  });

  it("concretePath substitutes the single dynamic segment", () => {
    expect(concretePath("/canvass/[campaignId]/walklists", "c1")).toBe("/canvass/c1/walklists");
  });

  it("resolvers map records to {id,label}, preferring name/title/displayName", async () => {
    expect(await SITEMAP_RESOLVERS["/canvass/[campaignId]"]()).toEqual([
      { id: "c1", label: "Camp One" },
      { id: "c2", label: "Camp Two" },
    ]);
    expect(await SITEMAP_RESOLVERS["/audience/[id]"]()).toEqual([{ id: "a1", label: "Aud" }]);
    expect(await SITEMAP_RESOLVERS["/blasts/[id]"]()).toEqual([{ id: "b1", label: "Blast" }]);
    expect((await SITEMAP_RESOLVERS["/insights/[pollId]"]())[0].label).toBe("Poll");
    expect((await SITEMAP_RESOLVERS["/super/tenants/[tenantId]"]())[0].label).toBe("Tenant");
    expect((await SITEMAP_RESOLVERS["/data/politicians/[id]"]())[0].label).toBe("MP");
    expect((await SITEMAP_RESOLVERS["/data/policies/[id]"]())[0].label).toBe("Policy");
  });
});
