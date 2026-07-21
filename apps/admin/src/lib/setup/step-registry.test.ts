import { describe, expect, it } from "vitest";
import { FLOW_META, STEP_META, stepTitle } from "./step-registry";

describe("STEP_META", () => {
  it("has complete metadata (title/blurb/href/cta) for every key", () => {
    for (const [key, meta] of Object.entries(STEP_META)) {
      expect(meta.title, key).toBeTruthy();
      expect(meta.blurb, key).toBeTruthy();
      expect(meta.cta, key).toBeTruthy();
      expect(meta.href, key).toMatch(/^\/[a-z-]+(\/[a-z-]+)?(#[a-z-]+)?$/);
    }
  });

  it("routes self steps to /account and org steps to their settings tabs", () => {
    expect(STEP_META.verifyEmail.href).toBe("/account");
    expect(STEP_META.businessLegal.href).toBe("/settings/business");
    expect(STEP_META.contacts.href).toBe("/settings/contacts");
    expect(STEP_META.address.href).toBe("/settings/addresses");
  });

  it("routes channel steps to the getting-started card anchors", () => {
    expect(STEP_META.phoneNumber.href).toBe("/getting-started#numbers");
    expect(STEP_META.emailIdentity.href).toBe("/getting-started#email");
  });
});

describe("FLOW_META", () => {
  it("covers the four flows", () => {
    expect(Object.keys(FLOW_META).sort()).toEqual(["account", "channels", "identity", "organisation"]);
  });
});

describe("stepTitle", () => {
  it("uses the registry title for known keys", () => {
    expect(stepTitle("businessLegal")).toBe("Business & legal details");
  });

  it("derives a readable fallback for unknown keys (forward-compat)", () => {
    expect(stepTitle("futureNewStep")).toBe("Future New Step");
    expect(stepTitle("snake_case_key")).toBe("Snake Case Key");
  });
});
