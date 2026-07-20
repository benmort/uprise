import type { PermissionRule } from "./types";

/**
 * Central role → permissions table. Ported from prog and reconciled with uprise'
 * ORGANISER/VOLUNTEER. Role rules are always positive (no `inverted`).
 *
 * - `super-admin` is the system-wide bypass (`manage all`); granted by the
 *   User.isSuperAdmin DB flag (and the env break-glass login).
 * - `owner` is the full tenant role incl. billing/network.
 * - `organiser` == prog's `admin` rule-set extended with uprise' campaign/messaging
 *   domains (the uprise ORGANISER maps here). No billing.
 * - `volunteer` is field-only (uprise VOLUNTEER, formerly VOLUNTEER): read assigned
 *   turf/walklist + visible contacts, write doorknocks/dispositions; no audience/blast access.
 * - `member` is a read-only tenant member.
 */
export const UPRISE_ROLES = ["super-admin", "owner", "organiser", "volunteer", "member"] as const;
export type Role = (typeof UPRISE_ROLES)[number];

/** Maps the Prisma AppUserRole enum values to the unified role ids. */
export const APP_USER_ROLE_TO_ROLE: Record<string, Role> = {
  OWNER: "owner",
  ORGANISER: "organiser",
  VOLUNTEER: "volunteer",
};

export const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<PermissionRule>> = {
  "super-admin": [{ action: "manage", resource: "all" }],

  owner: [
    { action: "manage", resource: "tenant.all" },
    { action: "manage", resource: "iam.all" },
    { action: "manage", resource: "audience.all" },
    { action: "manage", resource: "messaging.all" },
    { action: "manage", resource: "telephony.all" },
    { action: "manage", resource: "email.all" },
    { action: "manage", resource: "canvass.all" },
    { action: "manage", resource: "events.all" },
    { action: "manage", resource: "journey.all" },
    { action: "manage", resource: "integration.all" },
    { action: "manage", resource: "geo.all" },
    { action: "manage", resource: "analytics.all" },
    { action: "manage", resource: "insights.all" },
    { action: "manage", resource: "civic.all" },
    { action: "manage", resource: "demographics.all" },
    { action: "manage", resource: "compliance.all" },
    { action: "manage", resource: "contacts.contact" },
    { action: "manage", resource: "contacts.tag" },
    { action: "manage", resource: "payment.all" },
    { action: "read", resource: "audit.log" },
    { action: "manage", resource: "system.feature-flags" },
  ],

  organiser: [
    { action: "manage", resource: "audience.all" },
    { action: "manage", resource: "messaging.all" },
    { action: "manage", resource: "telephony.all" },
    { action: "manage", resource: "email.all" },
    { action: "manage", resource: "canvass.all" },
    { action: "manage", resource: "events.all" },
    { action: "manage", resource: "journey.all" },
    { action: "manage", resource: "integration.all" },
    { action: "manage", resource: "geo.all" },
    { action: "manage", resource: "compliance.all" },
    { action: "manage", resource: "insights.all" },
    { action: "manage", resource: "civic.all" },
    { action: "manage", resource: "demographics.all" },
    { action: "manage", resource: "contacts.contact" },
    { action: "manage", resource: "contacts.tag" },
    { action: "manage", resource: "tenant.member" },
    { action: "manage", resource: "tenant.invitation" },
    { action: "manage", resource: "tenant.org-profile" },
    { action: "manage", resource: "tenant.files" },
    { action: "read", resource: "tenant.tenant" },
    { action: "read", resource: "analytics.all" },
    { action: "create", resource: "analytics.vital" },
    { action: "read", resource: "audit.log" },
    { action: "read", resource: "system.feature-flags" },
  ],

  volunteer: [
    { action: "read", resource: "canvass.turf" },
    { action: "read", resource: "canvass.walklist" },
    { action: "read", resource: "canvass.campaign" },
    { action: "read", resource: "canvass.script" },
    { action: "read", resource: "canvass.survey" },
    { action: "manage", resource: "canvass.doorknock" },
    { action: "create", resource: "canvass.disposition" },
    { action: "read", resource: "canvass.shift" },
    { action: "read", resource: "events.event" },
    { action: "read", resource: "events.calendar" },
    { action: "read", resource: "contacts.contact" },
    { action: "read", resource: "contacts.tag" },
    // The field PWA's web-vitals beacon posts load metrics for the volunteer's tenant.
    { action: "create", resource: "analytics.vital" },
  ],

  member: [
    { action: "read", resource: "tenant.tenant" },
    { action: "read", resource: "tenant.org-profile" },
    { action: "read", resource: "audience.all" },
    { action: "read", resource: "messaging.all" },
    { action: "read", resource: "telephony.all" },
    { action: "read", resource: "email.all" },
    { action: "read", resource: "canvass.all" },
    { action: "read", resource: "events.all" },
    { action: "read", resource: "analytics.all" },
    { action: "read", resource: "insights.all" },
    { action: "read", resource: "civic.all" },
    { action: "read", resource: "demographics.all" },
  ],
};

export function isKnownRole(role: string): role is Role {
  return (UPRISE_ROLES as readonly string[]).includes(role);
}
