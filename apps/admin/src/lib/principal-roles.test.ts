import { describe, expect, it } from "vitest";
import { canManageWorkspace, isOwner, isVolunteer } from "./principal-roles";

describe("canManageWorkspace", () => {
  // THE regression: the join-request badge was gated on `role !== "ORGANISER"`, so it never
  // showed for the person who owns the workspace — and it is the only signal that someone is
  // waiting to be let in.
  it("includes the OWNER, not just the ORGANISER", () => {
    expect(canManageWorkspace({ role: "OWNER" })).toBe(true);
    expect(canManageWorkspace({ role: "ORGANISER" })).toBe(true);
  });

  it("excludes a volunteer", () => {
    expect(canManageWorkspace({ role: "VOLUNTEER" })).toBe(false);
  });

  it("lets a super-admin through whatever their role reads as", () => {
    expect(canManageWorkspace({ role: "VOLUNTEER", isSuperAdmin: true })).toBe(true);
    expect(canManageWorkspace({ isSuperAdmin: true })).toBe(true);
  });

  it("is safe on an absent or half-loaded principal", () => {
    expect(canManageWorkspace(null)).toBe(false);
    expect(canManageWorkspace(undefined)).toBe(false);
    expect(canManageWorkspace({})).toBe(false);
    expect(canManageWorkspace({ role: null })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(canManageWorkspace({ role: "owner" })).toBe(true);
  });
});

describe("isOwner", () => {
  it("is strictly the owner — an organiser is not one", () => {
    expect(isOwner({ role: "OWNER" })).toBe(true);
    expect(isOwner({ role: "ORGANISER" })).toBe(false);
  });

  // Deliberately narrow: this gates ownership transfer and destructive settings, so acting-as
  // must not silently qualify.
  it("does not treat a super-admin as the owner", () => {
    expect(isOwner({ role: "ORGANISER", isSuperAdmin: true })).toBe(false);
  });
});

describe("isVolunteer", () => {
  it("identifies a field volunteer", () => {
    expect(isVolunteer({ role: "VOLUNTEER" })).toBe(true);
    expect(isVolunteer({ role: "OWNER" })).toBe(false);
  });

  it("never calls a super-admin a volunteer", () => {
    expect(isVolunteer({ role: "VOLUNTEER", isSuperAdmin: true })).toBe(false);
  });
});
