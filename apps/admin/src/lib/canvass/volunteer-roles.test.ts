import { describe, expect, it } from "vitest";
import {
  displayRole,
  initialAssignableRole,
  isEditableFromRoster,
  roleChangeFor,
} from "./volunteer-roles";

describe("displayRole", () => {
  // Showing an owner as "Volunteer" is what made the demotion look like a no-op.
  it("never flattens OWNER", () => {
    expect(displayRole("OWNER")).toBe("OWNER");
    expect(displayRole("owner")).toBe("OWNER");
  });

  it("passes ORGANISER through and defaults everything else to VOLUNTEER", () => {
    expect(displayRole("ORGANISER")).toBe("ORGANISER");
    expect(displayRole("VOLUNTEER")).toBe("VOLUNTEER");
    expect(displayRole("member")).toBe("VOLUNTEER");
    expect(displayRole(null)).toBe("VOLUNTEER");
    expect(displayRole(undefined)).toBe("VOLUNTEER");
  });
});

describe("isEditableFromRoster", () => {
  const owner = { id: "u-owner" };
  const volunteer = { id: "u-vol" };

  it("allows ordinary rows", () => {
    expect(isEditableFromRoster("VOLUNTEER", volunteer, { id: "u-org" })).toBe(true);
    expect(isEditableFromRoster("ORGANISER", volunteer, { id: "u-org" })).toBe(true);
  });

  // The escalation path: an organiser editing the owner's row.
  it("refuses an owner row to anyone else", () => {
    expect(isEditableFromRoster("OWNER", owner, { id: "u-org" })).toBe(false);
    expect(isEditableFromRoster("OWNER", owner, null)).toBe(false);
    expect(isEditableFromRoster("OWNER", owner, { id: undefined })).toBe(false);
  });

  it("allows a super-admin, and the owner on their own row", () => {
    expect(isEditableFromRoster("OWNER", owner, { id: "u-other", isSuperAdmin: true })).toBe(true);
    expect(isEditableFromRoster("OWNER", owner, { id: "u-owner" })).toBe(true);
  });
});

describe("initialAssignableRole", () => {
  it("offers no assignable role for an owner", () => {
    expect(initialAssignableRole("OWNER")).toBeUndefined();
  });

  it("pre-selects the row's own role otherwise", () => {
    expect(initialAssignableRole("ORGANISER")).toBe("ORGANISER");
    expect(initialAssignableRole("VOLUNTEER")).toBe("VOLUNTEER");
    expect(initialAssignableRole(null)).toBe("VOLUNTEER");
  });
});

describe("roleChangeFor", () => {
  // THE regression. Saving a phone-number edit must not carry a role with it.
  it("sends nothing when the role is unchanged", () => {
    expect(roleChangeFor("ORGANISER", "ORGANISER")).toBeUndefined();
    expect(roleChangeFor("VOLUNTEER", "VOLUNTEER")).toBeUndefined();
  });

  // Defence in depth: even a stale select must not be able to demote an owner from here.
  it("sends nothing for an owner row, whatever the select says", () => {
    expect(roleChangeFor("OWNER", undefined)).toBeUndefined();
    expect(roleChangeFor("OWNER", "VOLUNTEER")).toBeUndefined();
    expect(roleChangeFor("OWNER", "ORGANISER")).toBeUndefined();
  });

  it("sends the new role on a real change", () => {
    expect(roleChangeFor("VOLUNTEER", "ORGANISER")).toBe("ORGANISER");
    expect(roleChangeFor("ORGANISER", "VOLUNTEER")).toBe("VOLUNTEER");
  });

  it("treats an unknown stored role as VOLUNTEER when deciding change", () => {
    expect(roleChangeFor("member", "VOLUNTEER")).toBeUndefined();
    expect(roleChangeFor("member", "ORGANISER")).toBe("ORGANISER");
  });
});
