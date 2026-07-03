// Mock data for the parked Segmentation surface (Future group). No API — everything
// here is static sample data so the screens are fully interactive as a UI mock.
// Mirrors the Slingshot segmentation builder: L1 intent tree + L2 policy + L3 compliance
// + live preview, over a closed condition catalogue.

export type MatchKind = "all" | "any" | "none";
export type ValueKind = "multi" | "single" | "number" | "window";
export type Capability = "now" | "pending" | "gated";

export interface CatalogueItem {
  field: string;
  label: string;
  description: string;
  valueKind: ValueKind;
  operators: string[];
  options?: string[];
  capability: Capability;
  /** rough per-condition reach, for the "≈ N match alone" hint */
  aloneReach: number;
}

export interface CatalogueSection {
  section: string;
  items: CatalogueItem[];
}

export interface Condition {
  id: string;
  field: string;
  operator: string;
  values: string[];
}

export interface FilterGroup {
  match: MatchKind;
  conditions: Condition[];
  groups: FilterGroup[];
}

export interface MailingPolicy {
  activeOnly: boolean;
  fatigueEnabled: boolean;
  fatigueWindowHours: number;
}

export interface Segment {
  id: string;
  name: string;
  summary: string;
  createdByName: string;
  updatedAt: string; // ISO
  members: number;
  status: "active" | "archived";
  rootMatch: MatchKind;
  tree: FilterGroup;
  policy: MailingPolicy;
}

export const AU_STATES = ["NSW", "QLD", "VIC", "SA", "WA", "TAS", "NT", "ACT"];
export const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
export const DONOR_STATUSES = ["one_off", "regular", "lapsed", "never"];
export const SEED_TAGS = ["climate", "environment", "reef", "energy", "democracy", "first-nations"];
export const SEED_ACTIONS = ["Reef petition", "Climate march RSVP", "Donated 2026", "Email opened (30d)", "Survey complete"];
export const WINDOWS = ["7", "30", "90", "180", "365"];

export const WINDOW_LABELS: Record<string, string> = {
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  "180": "6 months",
  "365": "1 year",
};

/** The closed condition vocabulary, grouped by IA — drives the catalogue dialog. */
export const CATALOGUE: CatalogueSection[] = [
  {
    section: "Who they are",
    items: [
      { field: "member.locState", label: "Location", description: "State or territory of residence.", valueKind: "multi", operators: ["in", "not_in"], options: AU_STATES, capability: "now", aloneReach: 12401 },
      { field: "member.ageGroup", label: "Age band", description: "Age cohort.", valueKind: "multi", operators: ["in", "not_in"], options: AGE_BANDS, capability: "now", aloneReach: 8134 },
      { field: "member.donorStatus", label: "Donor status", description: "Current giving status.", valueKind: "single", operators: ["is", "is_not"], options: DONOR_STATUSES, capability: "pending", aloneReach: 5960 },
      { field: "tag.has", label: "Tag", description: "Has a CRM tag.", valueKind: "single", operators: ["has", "doesnt_have"], options: SEED_TAGS, capability: "pending", aloneReach: 4800 },
    ],
  },
  {
    section: "What they did",
    items: [
      { field: "activity.lastActiveWithin", label: "Last active", description: "Engaged within a time window.", valueKind: "window", operators: ["within", "not_within"], options: WINDOWS, capability: "now", aloneReach: 15920 },
      { field: "action.taken", label: "Action taken", description: "Completed a campaign action.", valueKind: "single", operators: ["is", "is_not"], options: SEED_ACTIONS, capability: "pending", aloneReach: 2380 },
      { field: "fru.donatedToCampaign", label: "Donated to", description: "Donated to a specific campaign.", valueKind: "single", operators: ["within", "not_within"], capability: "gated", aloneReach: 3180 },
      { field: "cs.signedPetition", label: "Signed petition", description: "Signed a specific petition.", valueKind: "single", operators: ["within", "not_within"], capability: "gated", aloneReach: 4770 },
    ],
  },
];

export const CATALOGUE_ITEMS: Record<string, CatalogueItem> = Object.fromEntries(
  CATALOGUE.flatMap((s) => s.items).map((i) => [i.field, i]),
);

export const OPERATOR_LABELS: Record<string, string> = {
  in: "is in",
  not_in: "is not in",
  is: "is",
  is_not: "is not",
  has: "has",
  doesnt_have: "doesn't have",
  within: "within",
  not_within: "not within",
};

export const POPULATION = 39_800;

export function labelValue(field: string, value: string): string {
  const item = CATALOGUE_ITEMS[field];
  if (item?.valueKind === "window") return WINDOW_LABELS[value] ?? value;
  return value;
}

/** Deterministic pseudo-reach for a tree, so the preview feels responsive. */
export function estimateReach(tree: FilterGroup, policy: MailingPolicy): number {
  const leaves = countLeaves(tree);
  if (leaves === 0) return POPULATION;
  // Each condition narrows; AND narrows more than OR. Purely cosmetic.
  const base = tree.match === "any" ? 0.62 : tree.match === "none" ? 0.78 : 0.34;
  let n = Math.round(POPULATION * Math.pow(base, Math.min(leaves, 4)) + 1200);
  if (policy.activeOnly) n = Math.round(n * 0.82);
  return Math.max(0, n);
}

function countLeaves(g: FilterGroup): number {
  return g.conditions.length + g.groups.reduce((acc, sub) => acc + countLeaves(sub), 0);
}

const daysAgo = (d: number) => new Date(Date.UTC(2026, 6, 3) - d * 86_400_000).toISOString();

export const MOCK_SEGMENTS: Segment[] = [
  {
    id: "seg_nsw_under35",
    name: "NSW under-35s",
    summary: "Members in NSW aged 18–34.",
    createdByName: "Alex Campaigner",
    updatedAt: daysAgo(2),
    members: 4120,
    status: "active",
    rootMatch: "all",
    tree: {
      match: "all",
      conditions: [
        { id: "c1", field: "member.locState", operator: "in", values: ["NSW"] },
        { id: "c2", field: "member.ageGroup", operator: "in", values: ["18-24", "25-34"] },
      ],
      groups: [],
    },
    policy: { activeOnly: true, fatigueEnabled: true, fatigueWindowHours: 24 },
  },
  {
    id: "seg_vic_sa_seniors",
    name: "VIC + SA seniors",
    summary: "Members in Victoria or South Australia aged 55+.",
    createdByName: "Sam Organiser",
    updatedAt: daysAgo(5),
    members: 6890,
    status: "active",
    rootMatch: "all",
    tree: {
      match: "all",
      conditions: [
        { id: "c1", field: "member.locState", operator: "in", values: ["VIC", "SA"] },
        { id: "c2", field: "member.ageGroup", operator: "in", values: ["55-64", "65+"] },
      ],
      groups: [],
    },
    policy: { activeOnly: true, fatigueEnabled: true, fatigueWindowHours: 24 },
  },
  {
    id: "seg_lapsed_qld",
    name: "Lapsed donors (QLD)",
    summary: "Queensland members whose donor status is lapsed.",
    createdByName: "Sam Organiser",
    updatedAt: daysAgo(9),
    members: 956,
    status: "active",
    rootMatch: "all",
    tree: {
      match: "all",
      conditions: [
        { id: "c1", field: "member.locState", operator: "in", values: ["QLD"] },
        { id: "c2", field: "member.donorStatus", operator: "is", values: ["lapsed"] },
      ],
      groups: [],
    },
    policy: { activeOnly: false, fatigueEnabled: true, fatigueWindowHours: 24 },
  },
  {
    id: "seg_reef_signers",
    name: "Reef campaign signers",
    summary: "Members tagged with the Reef campaign.",
    createdByName: "Alex Campaigner",
    updatedAt: daysAgo(1),
    members: 4800,
    status: "active",
    rootMatch: "all",
    tree: {
      match: "all",
      conditions: [{ id: "c1", field: "tag.has", operator: "has", values: ["reef"] }],
      groups: [],
    },
    policy: { activeOnly: true, fatigueEnabled: true, fatigueWindowHours: 24 },
  },
  {
    id: "seg_recent_active",
    name: "Recently active members",
    summary: "Members active in the last 30 days.",
    createdByName: "Jordan Lee",
    updatedAt: daysAgo(14),
    members: 15920,
    status: "archived",
    rootMatch: "all",
    tree: {
      match: "all",
      conditions: [{ id: "c1", field: "activity.lastActiveWithin", operator: "within", values: ["30"] }],
      groups: [],
    },
    policy: { activeOnly: false, fatigueEnabled: false, fatigueWindowHours: 24 },
  },
];

export function emptySegment(): Segment {
  return {
    id: "new",
    name: "Untitled audience",
    summary: "",
    createdByName: "You",
    updatedAt: daysAgo(0),
    members: 0,
    status: "active",
    rootMatch: "all",
    tree: { match: "all", conditions: [], groups: [] },
    policy: { activeOnly: true, fatigueEnabled: true, fatigueWindowHours: 24 },
  };
}
