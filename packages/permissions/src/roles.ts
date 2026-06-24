import type { PermissionRule } from "./types";

/**
 * Central role → permissions table. Ported from prog and reconciled with yarns'
 * ORGANISER/CANVASSER. Role rules are always positive (no `inverted`).
 *
 * - `super-admin` is the system-wide bypass (`manage all`), the env break-glass login.
 * - `owner` is the full tenant role incl. billing/network.
 * - `organiser` == prog's `admin` rule-set extended with yarns' campaign/messaging
 *   domains (the yarns ORGANISER maps here). No billing.
 * - `canvasser` is field-only (yarns CANVASSER): read assigned turf/walklist + visible
 *   contacts, write doorknocks/dispositions; no audience/blast/integration access.
 * - `member` is a read-only tenant member.
 */
export const YARNS_ROLES = ["super-admin", "owner", "organiser", "canvasser", "member"] as const;
export type Role = (typeof YARNS_ROLES)[number];

/** Maps the legacy Prisma AppUserRole enum values to the unified role ids. */
export const APP_USER_ROLE_TO_ROLE: Record<string, Role> = {
  ORGANISER: "organiser",
  CANVASSER: "canvasser",
};

export const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<PermissionRule>> = {
  "super-admin": [{ action: "manage", resource: "all" }],

  owner: [
    { action: "manage", resource: "tenant.all" },
    { action: "manage", resource: "iam.all" },
    { action: "manage", resource: "audience.all" },
    { action: "manage", resource: "messaging.all" },
    { action: "manage", resource: "telephony.all" },
    { action: "manage", resource: "canvass.all" },
    { action: "manage", resource: "journey.all" },
    { action: "manage", resource: "integration.all" },
    { action: "manage", resource: "geo.all" },
    { action: "manage", resource: "analytics.all" },
    { action: "manage", resource: "compliance.all" },
    { action: "manage", resource: "contacts.contact" },
    { action: "manage", resource: "payment.all" },
    { action: "read", resource: "audit.log" },
    { action: "manage", resource: "system.feature-flags" },
  ],

  organiser: [
    { action: "manage", resource: "audience.all" },
    { action: "manage", resource: "messaging.all" },
    { action: "manage", resource: "telephony.all" },
    { action: "manage", resource: "canvass.all" },
    { action: "manage", resource: "journey.all" },
    { action: "manage", resource: "integration.all" },
    { action: "manage", resource: "geo.all" },
    { action: "manage", resource: "compliance.all" },
    { action: "manage", resource: "contacts.contact" },
    { action: "manage", resource: "tenant.member" },
    { action: "manage", resource: "tenant.invitation" },
    { action: "manage", resource: "tenant.org-profile" },
    { action: "read", resource: "tenant.tenant" },
    { action: "read", resource: "analytics.all" },
    { action: "read", resource: "audit.log" },
    { action: "read", resource: "system.feature-flags" },
  ],

  canvasser: [
    { action: "read", resource: "canvass.turf" },
    { action: "read", resource: "canvass.walklist" },
    { action: "read", resource: "canvass.campaign" },
    { action: "read", resource: "canvass.script" },
    { action: "read", resource: "canvass.survey" },
    { action: "manage", resource: "canvass.doorknock" },
    { action: "create", resource: "canvass.disposition" },
    { action: "read", resource: "contacts.contact" },
  ],

  member: [
    { action: "read", resource: "tenant.tenant" },
    { action: "read", resource: "tenant.org-profile" },
    { action: "read", resource: "audience.all" },
    { action: "read", resource: "messaging.all" },
    { action: "read", resource: "telephony.all" },
    { action: "read", resource: "canvass.all" },
    { action: "read", resource: "analytics.all" },
  ],
};

export function isKnownRole(role: string): role is Role {
  return (YARNS_ROLES as readonly string[]).includes(role);
}
