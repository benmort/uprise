/**
 * Full-screen presentation slides shown inside a guided tour.
 *
 * A tour step carrying a `slide` renders an opaque deck layer instead of the spotlight + floating
 * card (see components/tour/slide-deck.tsx). The payload is deliberately **pure data** — strings
 * and string arrays, no JSX and no icon components — which buys three things:
 *
 *   - the renderer's `switch (slide.kind)` is exhaustive at compile time, so a ninth layout is a
 *     type error until it is drawn;
 *   - per-kind invariants (a diagram has three nodes, only the first and last slides are blue) are
 *     assertable in this coverage-instrumented lib rather than hoped for in view code;
 *   - the house copy rules — Australian English, en-dashes never em-dashes, no exclamation marks —
 *     become lintable, and slides.test.ts walks every string to enforce them.
 *
 * Page numbers are derived from array position at render time, never authored into the copy.
 */

export type SlideTone = "blue" | "light" | "grey";

interface SlideBase {
  /** Stable id: the renderer's remount key, and what the step invariants join on. */
  id: string;
  tone: SlideTone;
  /** Micro-label above the title. Authored in sentence case; rendered uppercase. */
  eyebrow: string;
  title: string;
}

/** Opening statement. Title and one line, vertically centred – nothing else. */
export interface HeroSlide extends SlideBase {
  kind: "hero";
  lede: string;
}

/** A cloud of capability chips, a pivot sentence, then the consequences of the status quo. */
export interface ChipsSlide extends SlideBase {
  kind: "chips";
  chips: string[];
  note: string;
  consequences: string[];
}

/** Hub-and-spoke: one parent, three children, drawn with borders rather than SVG. */
export interface DiagramSlide extends SlideBase {
  kind: "diagram";
  hub: { label: string; sublabel: string };
  nodes: Array<{ label: string; items: string[] }>;
}

/** A left-to-right chip flow with a tag cloud underneath. */
export interface FlowSlide extends SlideBase {
  kind: "flow";
  stages: string[];
  tagsLabel: string;
  tags: string[];
}

/** What has been prepared, plus the marker saying none of it is real. */
export interface ChecklistSlide extends SlideBase {
  kind: "checklist";
  lede: string;
  items: string[];
  /** The fictional-data notice — the deck's one semantic-coloured element. */
  marker: string;
}

/** Oversized numbered questions, then a transition line. */
export interface NumberedSlide extends SlideBase {
  kind: "numbered";
  questions: string[];
  outro: string;
}

/** Three panels of headed lists. */
export interface ColumnsSlide extends SlideBase {
  kind: "columns";
  columns: Array<{ heading: string; items: string[] }>;
}

/** Side-by-side capability comparison: the prior-art tool on the left, Uprise on the right. */
export interface CompareSlide extends SlideBase {
  kind: "compare";
  leftLabel: string;
  rightLabel: string;
  rows: Array<{ capability: string; left: string; right: string }>;
  /** Framing line under the table – carries the evidence caveat or the takeaway. */
  note: string;
}

/** Closing ask: a statement beside a numbered path. */
export interface ClosingSlide extends SlideBase {
  kind: "closing";
  lede: string;
  path: string[];
}

export type TourSlide =
  | HeroSlide
  | ChipsSlide
  | DiagramSlide
  | FlowSlide
  | ChecklistSlide
  | NumberedSlide
  | ColumnsSlide
  | CompareSlide
  | ClosingSlide;

/**
 * The Climate 200 partner deck: six framing slides before the guided walkthrough, two closing
 * slides after it.
 *
 * The brief is that the system does the selling – so the opening earns the demo rather than
 * substituting for it (roughly ten minutes for six slides), and the close proposes a contained
 * pilot rather than a rollout.
 */
export const CLIMATE_200_SLIDES: TourSlide[] = [
  {
    id: "c200-slide-hero",
    kind: "hero",
    tone: "blue",
    eyebrow: "Campaign technology",
    title: "Uprise for Climate 200",
    lede: "Supported candidates and incumbents get an integrated campaign platform – without every campaign having to assemble and maintain its own software stack.",
  },
  {
    id: "c200-slide-challenge",
    kind: "chips",
    tone: "light",
    eyebrow: "The operational challenge",
    title: "Every campaign needs the same eight things",
    chips: [
      "Supporter and volunteer management",
      "Electoral and geographic data",
      "Door-knocking and field organising",
      "Calling and peer-to-peer SMS",
      "Volunteer recruitment and shifts",
      "Conversation tracking and support scoring",
      "Campaign reporting",
      "Integrations with existing systems",
    ],
    note: "Today each of these is chosen, configured and supported separately for every campaign.",
    consequences: [
      "Repeated setup, every cycle",
      "Data fragmented across tools",
      "Training and support done again each time",
    ],
  },
  {
    id: "c200-slide-model",
    kind: "diagram",
    tone: "grey",
    eyebrow: "The Uprise model",
    title: "Shared infrastructure, separate campaigns",
    hub: { label: "Climate 200", sublabel: "Administration and support" },
    nodes: [
      {
        label: "Candidate campaign",
        items: ["Own brand and users", "Separate campaign data", "Own electorate and field program", "Own permissions and reporting"],
      },
      {
        label: "Incumbent campaign",
        items: ["Own brand and users", "Separate campaign data", "Own electorate and field program", "Own permissions and reporting"],
      },
      {
        label: "Candidate campaign",
        items: ["Own brand and users", "Separate campaign data", "Own electorate and field program", "Own permissions and reporting"],
      },
    ],
  },
  {
    id: "c200-slide-connects",
    kind: "flow",
    tone: "light",
    eyebrow: "What the platform connects",
    title: "One campaign lifecycle, end to end",
    stages: ["Recruit", "Organise", "Contact", "Record", "Follow up", "Measure"],
    tagsLabel: "The capabilities underneath",
    tags: [
      "Supporters and volunteers",
      "Events and shifts",
      "Electoral mapping and turf",
      "Door-knocking",
      "Calling",
      "Peer-to-peer SMS",
      "Surveys and support scores",
      "Reporting and targeting",
    ],
  },
  // ── Prior art: KnockHQ, the tool this movement's campaigns knew last cycle. ──
  // The left column is reconstructed from campaign training material (Yes23's Warringah deck,
  // From the Heart's calls FAQ, Haines/Spender volunteer pages) – KnockHQ's own site was a single
  // page, now offline. A gap therefore means "no public evidence", never "didn't have it".
  {
    id: "c200-slide-compare-turf",
    kind: "compare",
    tone: "grey",
    eyebrow: "Prior art – cutting turf",
    title: "KnockHQ and Uprise, capability by capability",
    leftLabel: "KnockHQ",
    rightLabel: "Uprise",
    rows: [
      {
        capability: "Turf cutting",
        left: "Click-to-choose areas on a map; designed maps for volunteers",
        right: "Draw turf or pull it from meshblocks, divisions, ASGS areas or booth catchments – live address counts while you draw",
      },
      {
        capability: "Address data",
        left: "Could flag who is or is not on the electoral roll",
        right: "G-NAF geocoded national address file (16.9M addresses) as the canon – turf resolves to real doors",
      },
      {
        capability: "Walk lists",
        left: "Printed walk-sheets “in seconds” – the paper-first workflow was a first-class feature",
        right: "Optimised on real walking distance, grouped by street; re-optimisable on demand, even offline",
      },
    ],
    note: "KnockHQ's public footprint was one page, now offline – its column is reconstructed from campaign training material. A gap means no public evidence, not absence.",
  },
  {
    id: "c200-slide-compare-door",
    kind: "compare",
    tone: "light",
    eyebrow: "Prior art – at the door",
    title: "Where the engineering shows",
    leftLabel: "KnockHQ",
    rightLabel: "Uprise",
    rows: [
      {
        capability: "Data capture",
        left: "Mobile web interface for standardised data entry at the door",
        right: "Installable offline-first app; knocks queue to a device outbox and flush when signal returns",
      },
      {
        capability: "Offline",
        left: "Not evidenced – paper was the fallback by design",
        right: "Offline-first by design, including route re-optimisation mid-shift",
      },
      {
        capability: "Surveys",
        left: "Standardised entry fields; custom scripts unknown",
        right: "Branching surveys with skip logic; dispositions mapped to a five-point support scale, shared across doors and phones",
      },
    ],
    note: "Both Yes23 and the Haines campaign leaned on KnockHQ's paper pathway for less tech-comfortable volunteers – simplicity was its strength.",
  },
  {
    id: "c200-slide-compare-ops",
    kind: "compare",
    tone: "grey",
    eyebrow: "Prior art – running the operation",
    title: "From the knock to the follow-up",
    leftLabel: "KnockHQ",
    rightLabel: "Uprise",
    rows: [
      {
        capability: "Assignment",
        left: "Maps assigned to volunteers; process handled around the tool",
        right: "Turf assigned to pairs, reassignable live; partial-completion and attempted-vs-contacted kept auditable",
      },
      {
        capability: "Monitoring",
        left: "Real-time data feed back to campaign HQ",
        right: "Live ops room refreshing active canvassers about every 10 seconds, with broadcast push to the field",
      },
      {
        capability: "Recontact",
        left: "Call-backs queued for follow-up; a whole “KnockHQ for Calls” phone-banking mode on the same data",
        right: "Audience segmentation feeds follow-up via SMS, calling and app channels on the same platform",
      },
      {
        capability: "Analysis",
        left: "Trend analysis against census data; import and export to existing tools",
        right: "Contact rates, support distribution, pace-vs-target; choropleth electorate maps; Action Network integration",
      },
    ],
    note: "The instructive pipeline: turf → optimised walk list → offline outbox → disposition → support scale → segment for follow-up.",
  },
  {
    id: "c200-slide-scenario",
    kind: "checklist",
    tone: "grey",
    eyebrow: "The scenario",
    title: "What you are about to see",
    lede: "We will follow one Climate 200-supported campaign from setup through to volunteer mobilisation, voter contact, follow-up and reporting.",
    items: [
      "Candidate branding",
      "A configured electorate",
      "Campaign staff and volunteer users",
      "Sample supporters and contact records",
      "Prepared canvassing areas",
      "Upcoming volunteer shifts",
      "Example conversation history",
      "SMS and calling activity",
      "Reporting data",
    ],
    marker: "Every person and record in this demonstration is fictional",
  },
  {
    id: "c200-slide-look-for",
    kind: "numbered",
    tone: "light",
    eyebrow: "What to look for",
    title: "Four questions worth holding onto",
    questions: [
      "Could a new candidate campaign be launched faster?",
      "Could staff and volunteers work without juggling disconnected tools?",
      "Could Climate 200 offer better onboarding and technical support?",
      "Could the same infrastructure be reused across candidates and cycles?",
    ],
    outro: "Rather than talking through every capability, here it is from three points of view – Climate 200, a campaign organiser, and a volunteer at the door.",
  },
  {
    id: "c200-slide-pilot",
    kind: "columns",
    tone: "light",
    eyebrow: "A possible pilot",
    title: "Start contained, not network-wide",
    columns: [
      {
        heading: "Participants",
        items: [
          "One new or developing candidate campaign",
          "One established candidate or incumbent campaign",
          "Climate 200 campaign, analytics and technology staff",
        ],
      },
      {
        heading: "Workflows",
        items: [
          "Campaign setup and user onboarding",
          "Contact and volunteer management",
          "Electoral mapping and field organising",
          "Door-knocking",
          "Calling and peer-to-peer SMS",
          "Reporting and support",
        ],
      },
      {
        heading: "Success measures",
        items: [
          "Time to configure a campaign",
          "Staff and volunteer adoption",
          "Doors, calls and texts completed",
          "Quality of the data captured",
          "Reduction in manual administration",
          "Integration requirements surfaced",
        ],
      },
    ],
  },
  {
    id: "c200-slide-next-step",
    kind: "closing",
    tone: "blue",
    eyebrow: "Proposed next step",
    title: "A working session with your campaign, technology and analytics teams",
    lede: "The goal is to pick a suitable pilot campaign together, and define the workflows, integrations, permissions and success measures it would need.",
    path: [
      "Technical and campaign discovery workshop",
      "Selection of the pilot campaign or campaigns",
      "Confirmation of integrations and data requirements",
      "Pilot scope and commercial proposal",
      "Configured pilot environment and onboarding",
    ],
  },
];
