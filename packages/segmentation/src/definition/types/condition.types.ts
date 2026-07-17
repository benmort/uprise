/**
 * The closed `Condition` discriminated union — uprise's segmentation vocabulary,
 * ported from slingshot's section-2 grammar (condition.types.ts) with the roster
 * re-cut for uprise's data model.
 *
 * A condition is a single filter leaf: a `type` (the attribute / verb id) + an
 * `op` + its operands, in these families:
 *
 * - **contact** — spine facts on `public.Contact` (+ the G-NAF address join):
 *   location, reachability, provenance, tenure, canvass support level;
 * - **tag / consent / source** — assignment tables keyed by contactId;
 * - **activity** — engagement verbs across canvassing, surveys, events, blasts,
 *   journeys and email engagement;
 * - **geo / insights** — electorate/region membership via `geo.address_region`,
 *   and the poll-threshold clause (via InsightsService);
 * - **custom** — a reference to an envelope-held AI custom clause (the SQL lane);
 * - **compliance.& policy.& prefixes** — L3/L2-only leaves the authoring guard
 *   refuses in an authored L1 filter (`validateAuthoredFilter`).
 *
 * Operators are uniform by dataType (the slingshot grammar): date →
 * `within`/`before`/`after`/`between`; number → `gt`/`lt`/`eq`/`between`; enum →
 * `in`/`notIn`; bool → `is`/`isNot`; string → `eq`/`contains`; membership-self →
 * `is`/`isNot`.
 *
 * These are the **types**; the closed runtime authority (per-type strict operand
 * schemas + operator-by-dataType enforcement) is the Zod `ConditionSchema` in
 * `../validation/condition.schema.ts`. The build-time drift guards (bottom of
 * this file) fail the package build if the union and `CONDITION_TYPES` diverge.
 */

// --- operand shapes, by dataType (ported verbatim from slingshot) -----------------

/** Numeric comparison (`gt`/`lt`/`eq`) or a numeric `between` range. */
export type CountCondition<T extends string> =
  | { type: T; op: "gt" | "lt" | "eq"; value: number }
  | { type: T; op: "between"; from: number; to: number };

/** Boolean leaf — `is` / `isNot`. */
export interface BoolCondition<T extends string> {
  type: T;
  op: "is" | "isNot";
  value: boolean;
}

/** Enum / string-set membership — `in` / `notIn`. */
export interface EnumCondition<T extends string> {
  type: T;
  op: "in" | "notIn";
  values: string[];
}

/** Free-text match — `eq` / `contains`. */
export interface StringCondition<T extends string> {
  type: T;
  op: "eq" | "contains";
  value: string;
}

/** Date leaf — rolling `within` days, `before` / `after` an instant, or a `between` range. */
export type DateCondition<T extends string> =
  | { type: T; op: "within"; days: number }
  | { type: T; op: "before" | "after"; date: string }
  | { type: T; op: "between"; from: string; to: string };

// --- bespoke leaves ---------------------------------------------------------------

/** `contact.postcode` — string-set (`in`/`notIn`) or an exact `eq`. */
export type PostcodeCondition =
  | { type: "contact.postcode"; op: "in" | "notIn"; values: string[] }
  | { type: "contact.postcode"; op: "eq"; value: string };

/** Has (not) responded to a survey. */
export interface SurveyRespondedCondition {
  type: "survey.responded";
  op: "is" | "isNot";
  surveyId: string;
}

/** Answered a specific question with (out) one of the given values (option value or free text). */
export interface SurveyAnsweredCondition {
  type: "survey.answered";
  questionId: string;
  op: "in" | "notIn";
  values: string[];
}

/** Has (not) RSVPed to an event — any event when `eventId` is absent. */
export interface EventRsvpedCondition {
  type: "event.rsvped";
  op: "is" | "isNot";
  eventId?: string;
  /** RSVP statuses that count (default GOING + ATTENDED). */
  statuses?: string[];
}

/** Was (not) sent a blast — any blast when `blastId` is absent; optionally windowed. */
export interface BlastReceivedCondition {
  type: "blast.received";
  op: "is" | "isNot";
  blastId?: string;
  withinDays?: number;
}

/** Replied (inbound message) — any blast when `blastId` is absent; optionally windowed. */
export interface BlastRepliedCondition {
  type: "blast.replied";
  op: "is" | "isNot";
  blastId?: string;
  withinDays?: number;
}

/** Is (not) enrolled in a journey — any journey when `journeyId` is absent. */
export interface JourneyEnrolledCondition {
  type: "journey.enrolled";
  op: "is" | "isNot";
  journeyId?: string;
  /** Enrolment states that count (default ACTIVE). */
  states?: string[];
}

/**
 * The exposed geo layers a `geo.area` condition can target — keys of the
 * evaluator's validated `geo.address_region` column allowlist. A key here is
 * interpolated into raw SQL by the resolver, so this list is closed.
 */
export const GEO_AREA_TYPES = [
  "ced",
  "sed",
  "sed_lower",
  "sed_upper",
  "lga",
  "ward",
  "sa1",
  "sa2",
  "sa3",
  "sa4",
] as const;
export type GeoAreaType = (typeof GEO_AREA_TYPES)[number];

/** Region membership over `geo.address_region` — `in`/`notIn` a set of area codes. */
export interface GeoAreaCondition {
  type: "geo.area";
  areaType: GeoAreaType;
  op: "in" | "notIn";
  values: string[];
}

/** The poll-threshold comparison operators (legacy clause parity). */
export const POLL_THRESHOLD_OPS = [">", ">=", "<", "<=", "="] as const;
export type PollThresholdOp = (typeof POLL_THRESHOLD_OPS)[number];

/**
 * Contacts whose address falls in a region whose poll estimate meets a
 * threshold — the 1:1 port of the legacy `pollThreshold` clause (resolved via
 * `InsightsService.resolvePollThresholdToGeoCodes`, visibility-gated).
 */
export interface PollThresholdCondition {
  type: "insights.pollThreshold";
  pollId: string;
  questionCode: string;
  response: string;
  op: PollThresholdOp;
  value: number;
  geoKind: GeoAreaType;
}

/**
 * A reference to an AI custom clause held on the definition envelope (the SQL
 * lane). The predicate itself never lives in the tree — the leaf resolver
 * re-validates and executes the referenced clause every evaluation, fail-closed.
 */
export interface CustomClauseCondition {
  type: "custom.clause";
  clauseRef: string;
}

// --- L2 / L3 leaves (never authorable — composed by the system) --------------------

/** The channels the compliance floor is built for (uprise blast channels). */
export const COMPLIANCE_CHANNELS = ["SMS", "WHATSAPP"] as const;
export type ComplianceChannel = (typeof COMPLIANCE_CHANNELS)[number];

/** L3 — channel-consent floor (opt-out excluded for SMS; opt-in required for WhatsApp). */
export interface ChannelConsentCondition {
  type: "compliance.channelConsent";
  channel: ComplianceChannel;
}

/** L3 — tenant suppression-list floor (phone/email matched). */
export interface NotSuppressedCondition {
  type: "compliance.notSuppressed";
  channel: ComplianceChannel;
}

/** L3 — deliverability floor (a reachable address for the channel). */
export interface ReachableCondition {
  type: "compliance.reachable";
  channel: ComplianceChannel;
}

/**
 * The L2-only active-member reference — a valid `Condition` so stored policy can
 * carry it, but refused in an authored L1 filter (`l2-in-l1`). The live active
 * clause is the policy's embedded `isActive.predicate`, inlined at composition.
 */
export interface PolicyIsActiveCondition {
  type: "policy.isActive";
  op: "is" | "isNot";
  policy: "org-default";
}

// --- the per-family type rosters ---------------------------------------------------

/** Contact — enumerated location + canvass support + turf (enum). */
type ContactEnumType = "contact.state" | "contact.locality" | "contact.turf" | "contact.supportLevel";
/** Contact — reachability flags (bool). */
type ContactBoolType = "contact.hasEmail" | "contact.hasPhone";
/** Contact — email-domain match (string). */
type ContactStringType = "contact.emailDomain";
/** Contact — tenure (date). */
type ContactDateType = "contact.createdAt";

/** Tag / consent / source — assignment enums. */
type AssignmentEnumType = "tag.tagged" | "consent.sms" | "consent.whatsapp" | "source.system";

/** Activity — engagement recency dates (EXISTS in range). */
type ActivityDateType =
  | "activity.lastActiveWithin"
  | "canvass.doorKnockedAt"
  | "email.openedAt"
  | "email.clickedAt";
/** Activity — canvass disposition codes (enum). */
type ActivityEnumType = "canvass.dispositionCode";

// --- the closed union ---------------------------------------------------------------

/** The closed condition union — the storable Layer-1 filter leaf (+ L2/L3 leaves). */
export type Condition =
  | EnumCondition<ContactEnumType | AssignmentEnumType | ActivityEnumType>
  | BoolCondition<ContactBoolType>
  | StringCondition<ContactStringType>
  | DateCondition<ContactDateType | ActivityDateType>
  | PostcodeCondition
  | SurveyRespondedCondition
  | SurveyAnsweredCondition
  | EventRsvpedCondition
  | BlastReceivedCondition
  | BlastRepliedCondition
  | JourneyEnrolledCondition
  | GeoAreaCondition
  | PollThresholdCondition
  | CustomClauseCondition
  | ChannelConsentCondition
  | NotSuppressedCondition
  | ReachableCondition
  | PolicyIsActiveCondition;

/**
 * Every condition `type` in the closed union roster. The build-time guards
 * (below) assert this tuple and the union never drift. Adding/renaming a variant
 * is a package change with no migration (`filter` is jsonb) and does not loosen
 * the closed union.
 */
export const CONDITION_TYPES = [
  // contact — spine facts
  "contact.state",
  "contact.postcode",
  "contact.locality",
  "contact.turf",
  "contact.supportLevel",
  "contact.hasEmail",
  "contact.hasPhone",
  "contact.emailDomain",
  "contact.createdAt",
  // tag / consent / source — assignments
  "tag.tagged",
  "consent.sms",
  "consent.whatsapp",
  "source.system",
  // activity — engagement verbs
  "activity.lastActiveWithin",
  "canvass.doorKnockedAt",
  "canvass.dispositionCode",
  "survey.responded",
  "survey.answered",
  "event.rsvped",
  "blast.received",
  "blast.replied",
  "journey.enrolled",
  "email.openedAt",
  "email.clickedAt",
  // geo / insights
  "geo.area",
  "insights.pollThreshold",
  // custom — AI SQL lane reference
  "custom.clause",
  // compliance — L3 only (refused in authored L1)
  "compliance.channelConsent",
  "compliance.notSuppressed",
  "compliance.reachable",
  // policy — L2 only (refused in authored L1)
  "policy.isActive",
] as const;

export type ConditionType = (typeof CONDITION_TYPES)[number];

// --- build-time drift guards (ported verbatim) --------------------------------------
// These fail the package build if the union and CONDITION_TYPES ever diverge.

type Assert<T extends true> = T;

/** Every `CONDITION_TYPES` entry must appear in the union. */
export type ConditionTypeCoverageGuard = Assert<
  [Exclude<ConditionType, Condition["type"]>] extends [never] ? true : false
>;

/** The union must not introduce a type absent from `CONDITION_TYPES`. */
export type ConditionTypeNoExtraGuard = Assert<
  [Exclude<Condition["type"], ConditionType>] extends [never] ? true : false
>;
