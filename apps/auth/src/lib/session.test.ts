import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "@uprise/contracts";
import { completeAuth } from "./session";

const ENV_KEY = "NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS";

/** Minimal Membership stubs — completeAuth only ever inspects the array length. */
function memberships(n: number): Membership[] {
  return Array.from({ length: n }, (_, i) => ({ tenantId: `t${i}` }) as unknown as Membership);
}

describe("completeAuth", () => {
  const originalEnv = process.env[ENV_KEY];
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env[ENV_KEY] = "http://localhost:3000,https://app.example.com";
    assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("sends a multi-tenant user to tenant selection, carrying an encoded return_to", () => {
    completeAuth(memberships(2), "https://app.example.com/next");
    expect(assign).toHaveBeenCalledWith(
      "/select-tenant?return_to=https%3A%2F%2Fapp.example.com%2Fnext",
    );
  });

  it("sends a multi-tenant user to bare tenant selection when there is no return_to", () => {
    completeAuth(memberships(3), null);
    expect(assign).toHaveBeenCalledWith("/select-tenant");
  });

  it("sends a single-tenant user straight to the validated return_to", () => {
    completeAuth(memberships(1), "https://app.example.com/dashboard");
    expect(assign).toHaveBeenCalledWith("https://app.example.com/dashboard");
  });

  it("validates the return_to for a single-tenant user, rejecting an off-allowlist origin", () => {
    completeAuth(memberships(1), "https://evil.example/steal");
    expect(assign).toHaveBeenCalledWith("http://localhost:3000");
  });

  it("treats undefined memberships as single-tenant and redirects to the default", () => {
    completeAuth(undefined, null);
    expect(assign).toHaveBeenCalledWith("http://localhost:3000");
  });
});
