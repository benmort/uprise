import { describe, it, expect } from "vitest";
import {
  UPRISE_ROLES,
  APP_USER_ROLE_TO_ROLE,
  ROLE_PERMISSIONS,
  isKnownRole,
  defineAbilityFor,
  resolveRolePermissions,
  STANDARD_ACTIONS,
  UPRISE_RESOURCES,
  type AuthenticatedActor,
  type Role,
} from "./index";

function actor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    id: "u1",
    type: "user",
    email: "a@example.com",
    roles: [],
    ...overrides,
  };
}

describe("roles table", () => {
  it("declares the five canonical roles in priority order", () => {
    expect(UPRISE_ROLES).toEqual([
      "super-admin",
      "owner",
      "organiser",
      "volunteer",
      "member",
    ]);
  });

  it("maps every Prisma AppUserRole enum value to a unified role id", () => {
    expect(APP_USER_ROLE_TO_ROLE).toEqual({
      OWNER: "owner",
      ORGANISER: "organiser",
      VOLUNTEER: "volunteer",
    });
    // Every mapped target must itself be a known role.
    for (const role of Object.values(APP_USER_ROLE_TO_ROLE)) {
      expect(isKnownRole(role)).toBe(true);
    }
  });

  it("gives super-admin the manage:all bypass and nothing else", () => {
    expect(ROLE_PERMISSIONS["super-admin"]).toEqual([
      { action: "manage", resource: "all" },
    ]);
  });

  it("grants owner billing/network domains that organiser lacks", () => {
    const ownerResources = ROLE_PERMISSIONS.owner.map((r) => r.resource);
    const organiserResources = ROLE_PERMISSIONS.organiser.map((r) => r.resource);
    expect(ownerResources).toContain("payment.all");
    expect(ownerResources).toContain("tenant.all");
    expect(organiserResources).not.toContain("payment.all");
    expect(organiserResources).not.toContain("tenant.all");
  });

  it("restricts volunteer to field-only rules with no audience access", () => {
    const rules = ROLE_PERMISSIONS.volunteer;
    expect(rules).toContainEqual({ action: "manage", resource: "canvass.doorknock" });
    expect(rules).toContainEqual({ action: "create", resource: "canvass.disposition" });
    expect(rules.every((r) => !r.resource.startsWith("audience"))).toBe(true);
    // Field role never gets a blanket manage over a whole domain.
    expect(rules.every((r) => !(r.action === "manage" && r.resource.endsWith(".all")))).toBe(true);
  });

  it("makes member strictly read-only", () => {
    expect(ROLE_PERMISSIONS.member.every((r) => r.action === "read")).toBe(true);
  });

  it("has a permission entry for every declared role", () => {
    for (const role of UPRISE_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("isKnownRole", () => {
  it("accepts declared roles and narrows the type", () => {
    for (const role of UPRISE_ROLES) {
      expect(isKnownRole(role)).toBe(true);
    }
  });

  it("rejects unknown role identifiers", () => {
    expect(isKnownRole("admin")).toBe(false);
    expect(isKnownRole("")).toBe(false);
    expect(isKnownRole("Owner")).toBe(false);
  });
});

describe("resolveRolePermissions", () => {
  it("returns the exact rule set for a single role", () => {
    expect(resolveRolePermissions(["owner"])).toEqual(ROLE_PERMISSIONS.owner);
  });

  it("concatenates rules across multiple roles", () => {
    const combined = resolveRolePermissions(["volunteer", "member"]);
    expect(combined).toEqual([
      ...ROLE_PERMISSIONS.volunteer,
      ...ROLE_PERMISSIONS.member,
    ]);
  });

  it("silently skips unknown roles", () => {
    expect(resolveRolePermissions(["owner", "nope", "also-nope"])).toEqual(
      ROLE_PERMISSIONS.owner,
    );
  });

  it("returns an empty set for no roles", () => {
    expect(resolveRolePermissions([])).toEqual([]);
  });
});

describe("defineAbilityFor — super-admin", () => {
  it("grants everything via the isSuperAdmin flag", () => {
    const ability = defineAbilityFor(actor({ isSuperAdmin: true }));
    expect(ability.can("read", "audience.audience")).toBe(true);
    expect(ability.can("delete", "tenant.tenant")).toBe(true);
    expect(ability.can("manage", "system.telephony-provisioning")).toBe(true);
  });

  it("grants everything via an explicit manage:all actor permission", () => {
    const ability = defineAbilityFor(
      actor({ actorPermissions: [{ action: "manage", resource: "all" }] }),
    );
    expect(ability.can("operate", "messaging.blast")).toBe(true);
  });

  it("does NOT treat an inverted manage:all as the super-admin bypass", () => {
    const ability = defineAbilityFor(
      actor({
        roles: ["member"],
        actorPermissions: [{ action: "manage", resource: "all", inverted: true }],
      }),
    );
    // The inverted rule revokes rather than grants, so the member baseline is gone.
    expect(ability.can("read", "audience.audience")).toBe(false);
    expect(ability.can("manage", "tenant.tenant")).toBe(false);
  });
});

describe("defineAbilityFor — role resolution and .all expansion", () => {
  it("expands a domain .all wildcard to concrete resources for owner", () => {
    const ability = defineAbilityFor(actor({ roles: ["owner"] }));
    // audience.all -> concrete entities, and manage implies read/update/delete.
    expect(ability.can("read", "audience.audience")).toBe(true);
    expect(ability.can("update", "audience.segment")).toBe(true);
    expect(ability.can("manage", "tenant.member")).toBe(true);
  });

  it("keeps a domain .all with no concrete entities as a literal rule (payment.all)", () => {
    const ability = defineAbilityFor(actor({ roles: ["owner"] }));
    expect(ability.can("manage", "payment.all")).toBe(true);
  });

  it("denies owner the platform-operator provisioning actions held outside telephony.*", () => {
    const ability = defineAbilityFor(actor({ roles: ["owner"] }));
    expect(ability.can("manage", "telephony.call")).toBe(true);
    expect(ability.can("manage", "system.telephony-provisioning")).toBe(false);
  });

  it("gives volunteer field rules but withholds audience and blanket canvass writes", () => {
    const ability = defineAbilityFor(actor({ roles: ["volunteer"] }));
    expect(ability.can("read", "canvass.turf")).toBe(true);
    expect(ability.can("update", "canvass.doorknock")).toBe(true); // manage implies update
    expect(ability.can("create", "canvass.disposition")).toBe(true);
    expect(ability.can("manage", "canvass.campaign")).toBe(false); // read-only
    expect(ability.can("read", "audience.audience")).toBe(false);
  });

  it("gives member read but not write across granted domains", () => {
    const ability = defineAbilityFor(actor({ roles: ["member"] }));
    expect(ability.can("read", "audience.audience")).toBe(true);
    expect(ability.can("read", "canvass.campaign")).toBe(true);
    expect(ability.can("update", "audience.audience")).toBe(false);
    expect(ability.can("create", "canvass.campaign")).toBe(false);
  });

  it("unions rules when an actor holds multiple roles", () => {
    const ability = defineAbilityFor(actor({ roles: ["volunteer", "member"] }));
    expect(ability.can("manage", "canvass.doorknock")).toBe(true); // volunteer
    expect(ability.can("read", "audience.audience")).toBe(true); // member
  });

  it("grants nothing to an actor with no roles or permissions", () => {
    const ability = defineAbilityFor(actor({ roles: [] }));
    expect(ability.can("read", "tenant.tenant")).toBe(false);
    expect(ability.can("read", "canvass.turf")).toBe(false);
  });

  it("skips unknown roles when building the ability", () => {
    const ability = defineAbilityFor(actor({ roles: ["wizard", "member"] }));
    expect(ability.can("read", "audience.audience")).toBe(true); // member survives
    expect(ability.can("manage", "audience.audience")).toBe(false); // wizard contributed nothing
  });
});

describe("defineAbilityFor — actor permission overrides", () => {
  it("adds a positive grant on top of roles, expanding its .all wildcard", () => {
    const ability = defineAbilityFor(
      actor({
        roles: ["member"],
        actorPermissions: [{ action: "manage", resource: "geo.all" }],
      }),
    );
    expect(ability.can("manage", "geo.division")).toBe(true);
    expect(ability.can("update", "geo.area")).toBe(true);
  });

  it("revokes a specific resource with an inverted rule while leaving siblings intact", () => {
    const ability = defineAbilityFor(
      actor({
        roles: ["member"],
        actorPermissions: [{ action: "read", resource: "audience.audience", inverted: true }],
      }),
    );
    expect(ability.can("read", "audience.audience")).toBe(false); // revoked
    expect(ability.can("read", "audience.segment")).toBe(true); // sibling untouched
  });

  it("honours a non-manage grant of the literal 'all' resource", () => {
    const ability = defineAbilityFor(
      actor({ actorPermissions: [{ action: "read", resource: "all" }] }),
    );
    // action !== manage, so this is not the super-admin bypass, but subject 'all' still matches.
    expect(ability.can("read", "canvass.turf")).toBe(true);
    expect(ability.can("read", "messaging.blast")).toBe(true);
    expect(ability.can("update", "canvass.turf")).toBe(false);
  });
});

describe("resource + action taxonomies", () => {
  it("exposes the standard action verbs including manage and operate", () => {
    expect(STANDARD_ACTIONS).toContain("manage");
    expect(STANDARD_ACTIONS).toContain("operate");
    expect(STANDARD_ACTIONS).toContain("read");
  });

  it("namespaces resources and terminates with the super-resource 'all'", () => {
    expect(UPRISE_RESOURCES).toContain("all");
    expect(UPRISE_RESOURCES).toContain("audience.all");
    expect(UPRISE_RESOURCES).toContain("canvass.doorknock");
    // Every entry bar the super-resource is dotted <domain>.<entity>.
    for (const resource of UPRISE_RESOURCES) {
      if (resource === "all") continue;
      expect(resource).toMatch(/^[a-z-]+\.[a-z-]+$/);
    }
  });

  it("keeps every role permission resource within the declared taxonomy", () => {
    const known = new Set<string>(UPRISE_RESOURCES);
    for (const role of UPRISE_ROLES) {
      for (const rule of ROLE_PERMISSIONS[role as Role]) {
        expect(known.has(rule.resource)).toBe(true);
      }
    }
  });
});
