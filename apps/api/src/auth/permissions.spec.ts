import {
  defineAbilityFor,
  APP_USER_ROLE_TO_ROLE,
  type AuthenticatedActor,
} from "@yarns/permissions";

function actor(roles: string[]): AuthenticatedActor {
  return { id: "u1", type: "user", email: "u@org.au", tenantId: "t1", roles };
}

describe("@yarns/permissions role matrix", () => {
  it("super-admin can manage everything", () => {
    const a = defineAbilityFor(actor(["super-admin"]));
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("delete", "payment.all")).toBe(true);
    expect(a.can("read", "tenant.network")).toBe(true);
  });

  it("the isSuperAdmin flag alone grants manage:all (no role string needed)", () => {
    const a = defineAbilityFor({ id: "u1", type: "user", email: "u@org.au", tenantId: "t1", roles: [], isSuperAdmin: true });
    expect(a.can("manage", "all")).toBe(true);
    expect(a.can("delete", "payment.all")).toBe(true);
    expect(a.can("manage", "tenant.network")).toBe(true);
  });

  it("organiser manages campaign/messaging/audience but not billing or network", () => {
    const a = defineAbilityFor(actor(["organiser"]));
    expect(a.can("manage", "audience.audience")).toBe(true); // .all expansion
    expect(a.can("manage", "messaging.blast")).toBe(true);
    expect(a.can("manage", "canvass.turf")).toBe(true);
    expect(a.can("read", "analytics.snapshot")).toBe(true);
    expect(a.can("manage", "tenant.member")).toBe(true);
    // No billing, no tenant-level network/ownership management.
    expect(a.can("manage", "payment.all")).toBe(false);
    expect(a.can("manage", "tenant.network")).toBe(false);
  });

  it("volunteer is field-only: doorknocks yes, audience/blasts no", () => {
    const a = defineAbilityFor(actor(["volunteer"]));
    expect(a.can("manage", "canvass.doorknock")).toBe(true);
    expect(a.can("create", "canvass.disposition")).toBe(true);
    expect(a.can("read", "canvass.turf")).toBe(true);
    expect(a.can("read", "contacts.contact")).toBe(true);
    expect(a.can("read", "audience.audience")).toBe(false);
    expect(a.can("manage", "messaging.blast")).toBe(false);
  });

  it("member is read-only", () => {
    const a = defineAbilityFor(actor(["member"]));
    expect(a.can("read", "audience.audience")).toBe(true);
    expect(a.can("create", "audience.audience")).toBe(false);
    expect(a.can("manage", "canvass.doorknock")).toBe(false);
  });

  it("an actorPermissions manage:all grant is a super-admin bypass", () => {
    const a = defineAbilityFor({
      ...actor([]),
      actorPermissions: [{ action: "manage", resource: "all" }],
    });
    expect(a.can("manage", "all")).toBe(true);
  });

  it("maps legacy AppUserRole values to unified roles", () => {
    expect(APP_USER_ROLE_TO_ROLE.ORGANISER).toBe("organiser");
    expect(APP_USER_ROLE_TO_ROLE.VOLUNTEER).toBe("volunteer");
  });
});
