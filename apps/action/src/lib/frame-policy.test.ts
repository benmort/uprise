import { describe, expect, it } from "vitest";
import { buildFrameAncestors, sanitiseDomains } from "./frame-policy";

const ADMIN = "https://admin.uprise.org.au";

describe("sanitiseDomains", () => {
  it("keeps hostnames and *.wildcards, drops anything that could break out of the CSP", () => {
    expect(
      sanitiseDomains([
        "Example.org",
        "*.campaign.org.au",
        "https://evil.com", // scheme is the snippet's job, not a hostname
        "spaces are bad.com",
        "self' https://evil.com; script-src 'unsafe-inline", // injection attempt
        42,
      ]),
    ).toEqual(["example.org", "*.campaign.org.au"]);
  });
});

describe("buildFrameAncestors", () => {
  it("the plain page is never foreign-framable (self + admin preview only)", () => {
    expect(
      buildFrameAncestors({ isEmbedRoute: false, policy: null, policyFetchFailed: false, admin: ADMIN }),
    ).toBe(`frame-ancestors 'self' ${ADMIN}`);
  });

  it("an embed with an allowlist frames only those hosts (https-pinned)", () => {
    expect(
      buildFrameAncestors({
        isEmbedRoute: true,
        policy: { embedDomains: ["example.org", "*.campaign.org.au"] },
        policyFetchFailed: false,
        admin: ADMIN,
      }),
    ).toBe(`frame-ancestors 'self' ${ADMIN} https://example.org https://*.campaign.org.au`);
  });

  it("an EMPTY allowlist means embeddable anywhere — no header at all", () => {
    expect(
      buildFrameAncestors({
        isEmbedRoute: true,
        policy: { embedDomains: [] },
        policyFetchFailed: false,
        admin: ADMIN,
      }),
    ).toBeNull();
  });

  it("a failed policy fetch fails CLOSED, never open", () => {
    expect(
      buildFrameAncestors({ isEmbedRoute: true, policy: null, policyFetchFailed: true, admin: ADMIN }),
    ).toBe(`frame-ancestors 'self' ${ADMIN}`);
  });
});
