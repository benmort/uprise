import { describe, expect, it } from "vitest";
import { resolveTenantId } from "./active-tenant";

describe("resolveTenantId", () => {
  // THE regression: reading `activeTenant?.id` alone resolved to undefined for every ordinary
  // owner ("Null for ordinary users" — AuthPrincipal), so the email identity card returned before
  // fetching and the tenant's own email identity never rendered.
  it("resolves an ordinary user from their session tenant", () => {
    expect(resolveTenantId({ tenantId: "t1", activeTenant: null })).toBe("t1");
    expect(resolveTenantId({ tenantId: "t1" })).toBe("t1");
  });

  it("falls back to the acting-as tenant when there is no session tenant", () => {
    expect(resolveTenantId({ tenantId: null, activeTenant: { id: "t-acted" } })).toBe("t-acted");
  });

  it("prefers an explicit prop — a super-admin surface names its target", () => {
    expect(resolveTenantId({ tenantId: "t1" }, "t-explicit")).toBe("t-explicit");
    expect(resolveTenantId({ tenantId: "t1", activeTenant: { id: "t2" } }, "t-explicit")).toBe("t-explicit");
  });

  it("ignores a blank explicit value rather than resolving to nothing", () => {
    expect(resolveTenantId({ tenantId: "t1" }, "   ")).toBe("t1");
    expect(resolveTenantId({ tenantId: "t1" }, "")).toBe("t1");
  });

  it("is safe on an absent or half-loaded principal", () => {
    expect(resolveTenantId(null)).toBeUndefined();
    expect(resolveTenantId(undefined)).toBeUndefined();
    expect(resolveTenantId({})).toBeUndefined();
    expect(resolveTenantId({ tenantId: null, activeTenant: null })).toBeUndefined();
  });
});
