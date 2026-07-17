/**
 * The uprise attribute catalogue (the analogue of slingshot's MVP_CATALOGUE) —
 * the single, code-based data source the describe view projects from and the
 * save-time capability gate checks against. Keyed to the closed condition
 * vocabulary (`definition/types/condition.types.ts`), grouped by builder IA and
 * capability-tagged.
 *
 * Coverage invariants (spec-enforced):
 * - every **authorable** (L1) union type has exactly one entry here;
 * - every `now`/`pending` entry's `type` is a closed-union member;
 * - `gated` descriptors may advertise future types (refused on save).
 *
 * L2/L3 types are deliberately catalogued too (layer-tagged) so the effective-
 * tree transparency UI can label the read-only policy/compliance nodes — the
 * authoring guard, not the catalogue, keeps them out of L1 filters.
 */
import { conditionLayer } from "../definition/types/condition-layer";
import type { CatalogueEntry, CatalogueOption } from "./catalogue.types";

// --- operator vocabularies (by dataType) -------------------------------------------
const ENUM_OPS = ["in", "notIn"];
const BOOL_OPS = ["is", "isNot"];
const STRING_OPS = ["eq", "contains"];
const DATE_OPS = ["within", "before", "after", "between"];
const SELF_OPS = ["is", "isNot"];

// --- static option sets --------------------------------------------------------------
const AU_STATES: CatalogueOption[] = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "WA", label: "Western Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "NT", label: "Northern Territory" },
  { value: "ACT", label: "Australian Capital Territory" },
];
const CONSENT_STATES: CatalogueOption[] = [
  { value: "OPTED_IN", label: "Opted in" },
  { value: "OPTED_OUT", label: "Opted out" },
  { value: "UNKNOWN", label: "Unknown" },
];
const SUPPORT_LEVELS: CatalogueOption[] = [
  { value: "STRONG_SUPPORT", label: "Strong support" },
  { value: "LEAN_SUPPORT", label: "Lean support" },
  { value: "UNDECIDED", label: "Undecided" },
  { value: "LEAN_OPPOSE", label: "Lean oppose" },
  { value: "STRONG_OPPOSE", label: "Strong oppose" },
];
const RSVP_STATUSES: CatalogueOption[] = [
  { value: "GOING", label: "Going" },
  { value: "ATTENDED", label: "Attended" },
  { value: "WAITLIST", label: "Waitlisted" },
  { value: "CANCELLED", label: "Cancelled" },
];
const ENROLMENT_STATES: CatalogueOption[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "WAITING", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "EXITED", label: "Exited" },
];
const GEO_LAYERS: CatalogueOption[] = [
  { value: "ced", label: "Federal electorate (CED)" },
  { value: "sed", label: "State electorate (SED)" },
  { value: "sed_lower", label: "State lower house" },
  { value: "sed_upper", label: "State upper house" },
  { value: "lga", label: "Local government area" },
  { value: "ward", label: "Council ward" },
  { value: "sa1", label: "SA1" },
  { value: "sa2", label: "SA2" },
  { value: "sa3", label: "SA3" },
  { value: "sa4", label: "SA4" },
];

// --- IA groups -------------------------------------------------------------------------
const WHO = "Who they are";
const DONE = "What they've done";
const REACH = "How to reach them";
const WHERE = "Where they are";
const ADVANCED = "Advanced";

/** Shorthand entry constructor — layer derived from the type (single source). */
const entry = (
  e: Omit<CatalogueEntry, "layer" | "capability"> & { capability?: CatalogueEntry["capability"] },
): CatalogueEntry => ({
  ...e,
  layer: conditionLayer(e.type),
  capability: e.capability ?? "now",
});

/** The catalogue — one entry per condition type (+ gated future descriptors). */
export const UPRISE_CATALOGUE: CatalogueEntry[] = [
  // ── contact — who they are ────────────────────────────────────────────────
  entry({
    type: "contact.state",
    kind: "contact",
    group: WHERE,
    label: "State or territory",
    description: "State of the contact's matched address.",
    keywords: ["state", "nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act", "territory"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    options: AU_STATES,
    accent: "geo",
  }),
  entry({
    type: "contact.postcode",
    kind: "contact",
    group: WHERE,
    label: "Postcode",
    description: "Postcode of the contact's matched address.",
    keywords: ["postcode", "post code", "zip"],
    operators: [...ENUM_OPS, "eq"],
    dataType: "enum",
    valueInput: "multi",
    accent: "geo",
  }),
  entry({
    type: "contact.locality",
    kind: "contact",
    group: WHERE,
    label: "Suburb / locality",
    description: "Suburb of the contact's matched address.",
    keywords: ["suburb", "locality", "town", "city"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    accent: "geo",
  }),
  entry({
    type: "contact.turf",
    kind: "contact",
    group: WHERE,
    label: "Turf",
    description: "Contacts cut into a canvassing turf.",
    keywords: ["turf", "walklist", "doorknock area", "canvass area"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    optionsFeed: "turfs",
    accent: "canvass",
  }),
  entry({
    type: "contact.supportLevel",
    kind: "contact",
    group: WHO,
    label: "Support level",
    description: "Canvass-recorded support level (any disposition).",
    keywords: ["support", "supporter", "oppose", "undecided", "persuasion"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    options: SUPPORT_LEVELS,
    accent: "canvass",
  }),
  entry({
    type: "contact.hasEmail",
    kind: "contact",
    group: REACH,
    label: "Has an email address",
    description: "An email address is on file.",
    keywords: ["email", "reachable", "has email"],
    operators: BOOL_OPS,
    dataType: "bool",
    valueInput: "toggle",
    accent: "reach",
  }),
  entry({
    type: "contact.hasPhone",
    kind: "contact",
    group: REACH,
    label: "Has a mobile number",
    description: "A mobile number is on file.",
    keywords: ["phone", "mobile", "sms", "number"],
    operators: BOOL_OPS,
    dataType: "bool",
    valueInput: "toggle",
    accent: "reach",
  }),
  entry({
    type: "contact.emailDomain",
    kind: "contact",
    group: REACH,
    label: "Email domain",
    description: "The domain of the contact's email address.",
    keywords: ["domain", "email domain", "workplace"],
    operators: STRING_OPS,
    dataType: "string",
    valueInput: "text",
    accent: "reach",
  }),
  entry({
    type: "contact.createdAt",
    kind: "contact",
    group: WHO,
    label: "Joined",
    description: "When the contact was first added.",
    keywords: ["joined", "created", "new", "signed up", "tenure"],
    operators: DATE_OPS,
    dataType: "date",
    valueInput: "window",
    accent: "contact",
  }),

  // ── tags / consent / source ───────────────────────────────────────────────
  entry({
    type: "tag.tagged",
    kind: "tag",
    group: WHO,
    label: "Tagged",
    description: "Contacts carrying any of the chosen tags.",
    keywords: ["tag", "tagged", "label", "interest"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    optionsFeed: "tags",
    accent: "tag",
  }),
  entry({
    type: "consent.sms",
    kind: "consent",
    group: REACH,
    label: "SMS consent",
    description: "The contact's SMS consent state.",
    keywords: ["consent", "sms", "opt in", "opt out", "subscribed"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    options: CONSENT_STATES,
    accent: "reach",
  }),
  entry({
    type: "consent.whatsapp",
    kind: "consent",
    group: REACH,
    label: "WhatsApp consent",
    description: "The contact's WhatsApp consent state.",
    keywords: ["consent", "whatsapp", "opt in", "opt out"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    options: CONSENT_STATES,
    accent: "reach",
  }),
  entry({
    type: "source.system",
    kind: "source",
    group: WHO,
    label: "Source system",
    description: "Where the contact record came from (import, integration…).",
    keywords: ["source", "import", "integration", "origin", "provenance"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    optionsFeed: "sources",
    accent: "contact",
  }),

  // ── activity — what they've done ──────────────────────────────────────────
  entry({
    type: "activity.lastActiveWithin",
    kind: "activity",
    group: DONE,
    label: "Active",
    description: "Any engagement — a door knock, survey answer, RSVP or reply.",
    keywords: ["active", "engaged", "recent", "activity", "last active"],
    operators: DATE_OPS,
    dataType: "date",
    valueInput: "window",
    accent: "activity",
  }),
  entry({
    type: "canvass.doorKnockedAt",
    kind: "activity",
    group: DONE,
    label: "Door knocked",
    description: "Had a door-knock conversation.",
    keywords: ["door", "knock", "canvass", "doorknock", "visited"],
    operators: DATE_OPS,
    dataType: "date",
    valueInput: "window",
    accent: "canvass",
  }),
  entry({
    type: "canvass.dispositionCode",
    kind: "activity",
    group: DONE,
    label: "Canvass outcome",
    description: "A recorded door-knock disposition.",
    keywords: ["disposition", "outcome", "canvass result", "not home", "meaningful"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    optionsFeed: "dispositions",
    accent: "canvass",
  }),
  entry({
    type: "survey.responded",
    kind: "activity",
    group: DONE,
    label: "Responded to a survey",
    description: "Answered at least one question of the chosen survey.",
    keywords: ["survey", "responded", "answered", "questionnaire"],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "single",
    optionsFeed: "surveys",
    accent: "survey",
  }),
  entry({
    type: "survey.answered",
    kind: "activity",
    group: DONE,
    label: "Answered a question with…",
    description: "Gave one of the chosen answers to a specific question.",
    keywords: ["answer", "question", "response", "said"],
    operators: ENUM_OPS,
    dataType: "bespoke",
    valueInput: "multi",
    optionsFeed: "questions",
    accent: "survey",
  }),
  entry({
    type: "event.rsvped",
    kind: "activity",
    group: DONE,
    label: "RSVPed to an event",
    description: "Holds an RSVP (going/attended by default).",
    keywords: ["event", "rsvp", "attended", "going", "rally", "town hall"],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "single",
    optionsFeed: "events",
    options: RSVP_STATUSES,
    accent: "event",
  }),
  entry({
    type: "blast.received",
    kind: "activity",
    group: DONE,
    label: "Received a blast",
    description: "Was sent (delivered) a blast message.",
    keywords: ["blast", "received", "sent", "message", "sms"],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "single",
    optionsFeed: "blasts",
    accent: "blast",
  }),
  entry({
    type: "blast.replied",
    kind: "activity",
    group: DONE,
    label: "Replied to a blast",
    description: "Sent an inbound reply.",
    keywords: ["reply", "replied", "responded", "inbound"],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "single",
    optionsFeed: "blasts",
    accent: "blast",
  }),
  entry({
    type: "journey.enrolled",
    kind: "activity",
    group: DONE,
    label: "In a journey",
    description: "Enrolled in an automation journey.",
    keywords: ["journey", "automation", "enrolled", "flow"],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "single",
    optionsFeed: "journeys",
    options: ENROLMENT_STATES,
    accent: "journey",
  }),
  entry({
    type: "email.openedAt",
    kind: "activity",
    group: DONE,
    label: "Opened an email",
    description: "Opened a tenant email.",
    keywords: ["email", "opened", "open", "engagement"],
    operators: DATE_OPS,
    dataType: "date",
    valueInput: "window",
    accent: "email",
  }),
  entry({
    type: "email.clickedAt",
    kind: "activity",
    group: DONE,
    label: "Clicked an email",
    description: "Clicked a link in a tenant email.",
    keywords: ["email", "clicked", "click", "engagement", "link"],
    operators: DATE_OPS,
    dataType: "date",
    valueInput: "window",
    accent: "email",
  }),

  // ── geo / insights ─────────────────────────────────────────────────────────
  entry({
    type: "geo.area",
    kind: "geo",
    group: WHERE,
    label: "Electorate / region",
    description: "Contacts whose address falls in the chosen areas (any exposed layer).",
    keywords: ["electorate", "region", "lga", "ward", "federal", "state", "seat", "division"],
    operators: ENUM_OPS,
    dataType: "bespoke",
    valueInput: "multi",
    options: GEO_LAYERS,
    accent: "geo",
  }),
  entry({
    type: "insights.pollThreshold",
    kind: "insights",
    group: WHERE,
    label: "Poll threshold",
    description: "In an area where a poll estimate meets a threshold.",
    keywords: ["poll", "polling", "estimate", "threshold", "support level", "insights"],
    operators: [">", ">=", "<", "<=", "="],
    dataType: "bespoke",
    valueInput: "number",
    accent: "insights",
  }),

  // ── custom (the AI SQL lane) ───────────────────────────────────────────────
  entry({
    type: "custom.clause",
    kind: "custom",
    group: ADVANCED,
    label: "Custom query",
    description: "An AI-authored predicate over safe contact fields (validated + contained).",
    keywords: ["custom", "query", "sql", "advanced", "ai"],
    operators: [],
    dataType: "bespoke",
    valueInput: "none",
    accent: "custom",
  }),

  // ── L3 compliance (layer-tagged for the transparency UI; never authorable) ──
  entry({
    type: "compliance.channelConsent",
    kind: "compliance",
    group: ADVANCED,
    label: "Channel consent floor",
    description: "System floor: excludes opted-out (SMS) / non-opted-in (WhatsApp) contacts.",
    keywords: [],
    operators: [],
    dataType: "bespoke",
    valueInput: "none",
  }),
  entry({
    type: "compliance.notSuppressed",
    kind: "compliance",
    group: ADVANCED,
    label: "Suppression floor",
    description: "System floor: excludes contacts on the tenant suppression list.",
    keywords: [],
    operators: [],
    dataType: "bespoke",
    valueInput: "none",
  }),
  entry({
    type: "compliance.reachable",
    kind: "compliance",
    group: ADVANCED,
    label: "Reachability floor",
    description: "System floor: excludes contacts with no address for the channel.",
    keywords: [],
    operators: [],
    dataType: "bespoke",
    valueInput: "none",
  }),
  entry({
    type: "policy.isActive",
    kind: "compliance",
    group: ADVANCED,
    label: "Active members only",
    description: "Policy reference — the live clause is the segment's embedded active predicate.",
    keywords: [],
    operators: SELF_OPS,
    dataType: "bespoke",
    valueInput: "none",
  }),

  // ── gated future descriptors ("coming soon" in the builder; refused on save) ──
  entry({
    type: "contact.ageBand",
    kind: "contact",
    group: WHO,
    label: "Age band",
    description: "Age cohort — coming soon (no demographic data captured yet).",
    keywords: ["age", "young", "old", "under", "over", "cohort"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    capability: "gated",
    accent: "contact",
  }),
  entry({
    type: "contact.gender",
    kind: "contact",
    group: WHO,
    label: "Gender",
    description: "Gender — coming soon (no demographic data captured yet).",
    keywords: ["gender"],
    operators: ENUM_OPS,
    dataType: "enum",
    valueInput: "multi",
    capability: "gated",
    accent: "contact",
  }),
];

/** Catalogue lookup by condition type. */
const BY_TYPE = new Map(UPRISE_CATALOGUE.map((e) => [e.type, e]));

/** Find a catalogue entry by condition `type` (undefined for off-roster types). */
export const findCatalogueEntry = (type: string): CatalogueEntry | undefined => BY_TYPE.get(type);
