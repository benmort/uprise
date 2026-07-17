import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  listFlags,
  getFlagAdmin,
  setTenantFlag,
  setGlobalFlag,
  listPlans,
  upsertPlan,
  updatePlan,
  getFlagAdminFor,
  setTargetFlag,
  searchTenants,
  searchNetworks,
} from "./flags";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("flags api client", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listFlags GETs the effective flag map", async () => {
    await listFlags();
    expect(mockReq.mock.calls[0][0]).toBe("/system/feature-flags");
    expect(mockReq.mock.calls[0][1]).toBeUndefined();
  });

  it("getFlagAdmin GETs the admin breakdown", async () => {
    await getFlagAdmin();
    expect(mockReq.mock.calls[0][0]).toBe("/system/feature-flags/admin");
  });

  it("setTenantFlag PATCHes the flag/enabled body", async () => {
    await setTenantFlag("canvass" as never, false);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/system/feature-flags");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ flag: "canvass", enabled: false });
  });

  it("setTenantFlag can clear an override with null", async () => {
    await setTenantFlag("canvass" as never, null);
    expect(JSON.parse(mockReq.mock.calls[0][1]?.body as string)).toEqual({
      flag: "canvass",
      enabled: null,
    });
  });

  it("setGlobalFlag PATCHes the global endpoint", async () => {
    await setGlobalFlag("canvass" as never, true);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/system/feature-flags/global");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ flag: "canvass", enabled: true });
  });

  it("listPlans GETs /plans", async () => {
    await listPlans();
    expect(mockReq.mock.calls[0][0]).toBe("/plans");
  });

  it("upsertPlan POSTs the plan input to /plans", async () => {
    const input = { key: "pro", displayName: "Pro", featureFlags: { canvass: true } };
    await upsertPlan(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/plans");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("updatePlan PATCHes the encoded plan id", async () => {
    await updatePlan("p/1", { order: 3 });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/plans/p%2F1");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ order: 3 });
  });

  it("getFlagAdminFor builds the tenant query", async () => {
    await getFlagAdminFor({ tenantId: "t1" });
    expect(mockReq.mock.calls[0][0]).toBe("/system/feature-flags/admin/target?tenantId=t1");
  });

  it("getFlagAdminFor builds the network query", async () => {
    await getFlagAdminFor({ networkId: "n1" });
    expect(mockReq.mock.calls[0][0]).toBe("/system/feature-flags/admin/target?networkId=n1");
  });

  it("setTargetFlag PATCHes the merged target/flag/enabled body", async () => {
    await setTargetFlag({ networkId: "n1" }, "canvass" as never, true);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/system/feature-flags/target");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({
      networkId: "n1",
      flag: "canvass",
      enabled: true,
    });
  });

  it("searchTenants encodes the query", async () => {
    await searchTenants("get up");
    expect(mockReq.mock.calls[0][0]).toBe("/tenants/search?q=get%20up");
  });

  it("searchNetworks encodes the query", async () => {
    await searchNetworks("a&b");
    expect(mockReq.mock.calls[0][0]).toBe("/networks/search?q=a%26b");
  });
});
