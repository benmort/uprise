/**
 * Action taxonomy — standard CRUD plus `operate` (run/process) and `manage`
 * (super-action that grants all). Ported from prog; domain verbs (send/refund)
 * are added as concrete needs arise.
 */
export const STANDARD_ACTIONS = ["read", "create", "update", "delete", "operate", "manage"] as const;
export type Action = (typeof STANDARD_ACTIONS)[number] | string;

/**
 * Resource taxonomy. Resources are namespaced `<domain>.<entity>`.
 * A `<domain>.all` wildcard grants the action on every resource in that domain.
 * The literal `all` is the super-resource granted only via `manage`.
 *
 * Covers uprise' current domains; payment/email/telephony entries are reserved
 * for when those domains are ported (meld docs 06–09) so the matrix is forward-compatible.
 */
export const UPRISE_RESOURCES = [
  // tenancy (meld doc 03)
  "tenant.tenant",
  "tenant.network",
  "tenant.member",
  "tenant.invitation",
  "tenant.org-profile",
  "tenant.api-keys",
  "tenant.files",
  "tenant.all",

  // identity / IAM (meld doc 03/04)
  "iam.user",
  "iam.session",
  "iam.profile",
  "iam.all",

  // contacts (cross-cutting canonical person)
  "contacts.contact",
  "contacts.tag",

  // audience
  "audience.audience",
  "audience.segment",
  "audience.import",
  "audience.contact-source",
  "audience.all",

  // insights (public-opinion polls attached to geo regions)
  "insights.poll",
  "insights.all",

  // civic (politicians + policies synced from They Vote For You)
  "civic.politician",
  "civic.policy",
  "civic.all",

  // demographics (ABS Census + SEIFA indicators attached to geo regions)
  "demographics.indicator",
  "demographics.all",

  // messaging (SMS/WhatsApp blasts, inbox, consent)
  "messaging.blast",
  "messaging.inbound",
  "messaging.outbound",
  "messaging.template",
  "messaging.consent",
  "messaging.conversation",
  "messaging.suppression",
  "messaging.all",

  // canvassing (field + organiser)
  "canvass.campaign",
  "canvass.turf",
  "canvass.walklist",
  "canvass.doorknock",
  "canvass.disposition",
  "canvass.script",
  "canvass.survey",
  // Reusable content library + object bindings (surveys/scripts/sets → campaigns/blasts).
  "canvass.content",
  "canvass.shift",
  "canvass.all",

  // events (public happenings people RSVP to) + the generic calendar
  "events.event",
  "events.calendar",
  "events.all",

  // journeys
  "journey.journey",
  "journey.enrolment",
  "journey.all",

  // integrations (Action Network etc.)
  "integration.connection",
  "integration.sync",
  "integration.all",

  // geo / divisions
  "geo.division",
  "geo.area",
  "geo.all",

  // analytics
  "analytics.snapshot",
  // Real-user web-vitals beacons — `create` is granted broadly (incl. volunteer) so the
  // field PWA can report load metrics; reads stay behind `read analytics.all`.
  "analytics.vital",
  "analytics.all",

  // compliance / suppression
  "compliance.suppression",
  "compliance.all",

  // telephony — voice calls (meld doc 09) + per-tenant numbers
  "telephony.call",
  "telephony.number",
  "telephony.provisioning",
  "telephony.all",

  // reserved for later-ported domains (meld docs 06–08)
  "payment.all",
  // email — sender identities (per-tenant SendGrid)
  "email.provisioning",
  "email.identity",
  "email.all",

  // cross-cutting
  "audit.log",
  "system.feature-flags",
  "system.feature-flags-global",
  // telephony provisioning mutations are platform-operator actions (subaccount
  // creation, compliance submission, number purchase) — kept outside telephony.*
  // so owners' `manage telephony.all` cannot reach them.
  "system.telephony-provisioning",
  "system.email-provisioning",
  "all",
] as const;
export type Resource = (typeof UPRISE_RESOURCES)[number] | string;

export interface PermissionRule {
  action: Action;
  resource: Resource;
  /** Negative grant; applied after positive rules to revoke. */
  inverted?: boolean;
  /** Future: MongoDB-style condition object for attribute-based filtering. */
  conditions?: Record<string, unknown>;
}

export type ActorType = "user" | "service-account";

/**
 * The verified, runtime view of a caller. The SessionAuthGuard (doc 04) builds
 * this from the session's User + their TenantMember roles.
 */
export interface AuthenticatedActor {
  id: string;
  type: ActorType;
  email: string;
  tenantId?: string | null;
  /** Role identifiers (e.g. 'organiser', 'volunteer', 'owner'). */
  roles: ReadonlyArray<string>;
  /** Per-actor overrides (grants or, with inverted, denies). */
  actorPermissions?: ReadonlyArray<Readonly<PermissionRule>>;
  /** Tenant-independent god-mode (User.isSuperAdmin) — grants `manage all`. */
  isSuperAdmin?: boolean;
}
