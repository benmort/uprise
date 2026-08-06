/**
 * The three-way capability comparison behind /comparison.
 *
 * Every competitor claim carries a public source URL, and the whole table carries an as-at date,
 * because a comparison naming other vendors is only defensible if a reader can check it. Sources
 * were retrieved on AS_AT from support.nationbuilder.com, nationbuilder.com and the Action Network
 * help centre.
 *
 * The Uprise column is split deliberately. `today` is graded on what a customer can actually
 * reach: a capability that exists in the codebase but sits behind a flag defaulting off, or that
 * no plan grants, is NOT shipped — it is planned. That rule is what stops this page contradicting
 * the roadmap band on the homepage, and it is enforced by comparison.test.ts rather than trusted.
 *
 * Data lives in src/lib on purpose: vitest coverage includes only src/lib/**, so the invariants
 * below are covered by the repo's patch floor instead of relying on review.
 */

/** When the competitor sources were last retrieved. Shown on the page. */
export const AS_AT = "6 August 2026";

export type Status =
  | "shipped"
  /** Real, but thinner than the leader in this row. */
  | "partial"
  /** Only reachable through a third-party product. */
  | "via-integration"
  /** The vendor's own documentation confirms it is not offered. */
  | "absent"
  /** Could not be established from public sources — never a synonym for absent. */
  | "unclear";

export type Horizon =
  /** Built or specified; needs finishing or enabling. */
  | "next"
  /** A real build, not yet started. */
  | "later"
  /** Unscoped; we are thinking about it. */
  | "exploring"
  /** A deliberate decision not to compete here. */
  | "not-our-lane";

export interface VendorCell {
  status: Status;
  note: string;
  /** Public URL backing the claim. Required — an uncited competitor claim must not ship. */
  source: string;
}

export interface ComparisonRow {
  area: string;
  actionNetwork: VendorCell;
  nationBuilder: VendorCell;
  /** What a customer can reach today. Deliberately has no `source` — the codebase is the source. */
  upriseToday: { status: Status; note: string };
  /** Required whenever `upriseToday.status` is not "shipped". */
  uprisePlanned?: { horizon: Horizon; note: string };
}

const AN = "https://help.actionnetwork.org/hc/en-us";
const NB = "https://support.nationbuilder.com/en/articles";

export const COMPARISON_GROUPS: Array<{ group: string; rows: ComparisonRow[] }> = [
  {
    group: "Reaching people",
    rows: [
      {
        area: "Email broadcasts",
        actionNetwork: {
          status: "shipped",
          note: "The centre of the product, and what you are billed on. Visual editor, targeting, A/B testing.",
          source: `${AN}/articles/203846575-Targeting-emails`,
        },
        nationBuilder: {
          status: "shipped",
          note: "Blast builder with scheduling, A/B testing on Pro and above, and drip automations.",
          source: `${NB}/2344088-how-to-optimize-your-email-deliverability`,
        },
        upriseToday: {
          status: "absent",
          note: "Transactional email only – invites, reminders and alerts. There is no campaign email.",
        },
        uprisePlanned: {
          horizon: "later",
          note: "Email joins the same audience and segment model the other channels use.",
        },
      },
      {
        area: "SMS broadcasts",
        actionNetwork: {
          status: "partial",
          note: "Broadcast SMS and MMS on a leased number. Documented for the US, Canada and the UK.",
          source: `${AN}/articles/360042202532-Getting-started-with-mobile-messaging-and-call-campaigns`,
        },
        nationBuilder: {
          status: "partial",
          note: "Text blasts with personalisation. Documented as US and Canada; a May 2026 release note also lists the UK.",
          source: `${NB}/2344046-send-and-receive-text-messages`,
        },
        upriseToday: {
          status: "shipped",
          note: "Draft, proof, schedule, send and retry, with opt-outs and authorisation checked before anything leaves.",
        },
      },
      {
        area: "Peer-to-peer texting",
        actionNetwork: {
          status: "absent",
          note: "The documentation states mobile messaging is broadcast and explicitly not peer-to-peer.",
          source: `${AN}/articles/360042202532-Getting-started-with-mobile-messaging-and-call-campaigns`,
        },
        nationBuilder: {
          status: "partial",
          note: "One-to-one messages sent by a staff user, rather than a volunteer sending queue.",
          source: `${NB}/2344046-send-and-receive-text-messages`,
        },
        upriseToday: {
          status: "shipped",
          note: "Volunteers claim recipients in batches and press send themselves, with scripts, canned replies and dispositions.",
        },
      },
      {
        area: "WhatsApp",
        actionNetwork: {
          status: "absent",
          note: "No WhatsApp capability appears anywhere in the published help centre.",
          source: `${AN}/categories/360004352752-Mobile-Messaging`,
        },
        nationBuilder: {
          status: "unclear",
          note: "The vendor markets a WhatsApp integration; native send and receive is not confirmed in the support documentation.",
          source: "https://nationbuilder.com/nationbuilder_and_whatsapp",
        },
        upriseToday: {
          status: "absent",
          note: "Modelled end to end and seeded for demonstration, but not switched on for customers.",
        },
        uprisePlanned: {
          horizon: "next",
          note: "Templates, opt-in consent and the shared inbox are built; it needs enabling and Twilio configuration.",
        },
      },
      {
        area: "Calling",
        actionNetwork: {
          status: "partial",
          note: "Constituent-to-target advocacy calls, where a supporter is connected to a decision-maker. Not volunteer phone banking.",
          source: `${AN}/articles/360042303512-What-are-call-campaigns`,
        },
        nationBuilder: {
          status: "partial",
          note: "A virtual number that receives calls, forwards and captures voicemail. Inbound only.",
          source: `${NB}/2343653-create-a-phone-number-and-access-voicemail`,
        },
        upriseToday: {
          status: "shipped",
          note: "A browser softphone dialling from the campaign's own number, with recordings and call history.",
        },
      },
      {
        area: "Automated calling and IVR",
        actionNetwork: {
          status: "partial",
          note: "Click-to-call places an automated call and transfers to a matched target. No campaign dialler.",
          source: `${AN}/articles/360042303532-Creating-call-campaigns`,
        },
        nationBuilder: {
          status: "via-integration",
          note: "No native dialler or IVR builder; the vendor points to CallHub.",
          source: "https://nationbuilder.com/callhubio",
        },
        upriseToday: {
          status: "shipped",
          note: "Voice broadcast, robo-polling with a question graph, and electorate-matched transfers. Paid plans.",
        },
        uprisePlanned: {
          horizon: "exploring",
          note: "Predictive and agent-connected dialling are not built.",
        },
      },
    ],
  },
  {
    group: "Organising in the field",
    rows: [
      {
        area: "Door-knocking app",
        actionNetwork: {
          status: "absent",
          note: "No canvassing app, contact-attempt logging or offline capture appears in the published documentation.",
          source: `${AN}/categories/360004340851-Getting-Started`,
        },
        nationBuilder: {
          status: "via-integration",
          note: "No first-party app. The vendor routes canvassing to Ecanvasser, Qomon and VoteRockIt.",
          source: "https://nationbuilder.com/ecanvasser",
        },
        upriseToday: {
          status: "shipped",
          note: "An installable app that queues knocks offline and syncs on reconnect, with photos and a safety flag.",
        },
      },
      {
        area: "Turf cutting",
        actionNetwork: {
          status: "absent",
          note: "No turf, walk-list or precinct capability appears in the published documentation.",
          source: `${AN}/categories/360004340851-Getting-Started`,
        },
        nationBuilder: {
          status: "shipped",
          note: "A long-standing strength. Draw boundaries on a map and select everyone inside. Pro and above.",
          source: `${NB}/2291371-how-to-use-the-turf-cutter`,
        },
        upriseToday: {
          status: "shipped",
          note: "Draw turf or pull it from electoral divisions and statistical areas, with live address counts.",
        },
      },
      {
        area: "Walk lists",
        actionNetwork: {
          status: "absent",
          note: "Not offered; the vendor's own guidance is to use a partner tool for field work.",
          source: `${AN}/categories/360004340851-Getting-Started`,
        },
        nationBuilder: {
          status: "shipped",
          note: "Printed walk sheets with a cover script. The doorstep itself is paper or a partner app.",
          source: `${NB}/2291371-how-to-use-the-turf-cutter`,
        },
        upriseToday: {
          status: "shipped",
          note: "Optimised on real walking distance rather than straight lines, and reassignable on the day.",
        },
      },
      {
        area: "Volunteer shifts",
        actionNetwork: {
          status: "shipped",
          note: "Events with RSVP, reminders and caps; shift events on the higher tier.",
          source: `${AN}/articles/203496760-Creating-an-event`,
        },
        nationBuilder: {
          status: "shipped",
          note: "Event pages with RSVP, ticketing, attendance and volunteer shift sign-up.",
          source: `${NB}/2291266-how-to-create-an-event`,
        },
        upriseToday: {
          status: "shipped",
          note: "Shifts carry a time, a place, a team leader and assigned turf, with attendance recorded against them.",
        },
      },
    ],
  },
  {
    group: "Knowing your electorate",
    rows: [
      {
        area: "Supporter records",
        actionNetwork: {
          status: "shipped",
          note: "Activist records keyed on email address, which is mandatory on every record.",
          source: `${AN}/articles/203850675-Viewing-and-editing-an-activist-s-record`,
        },
        nationBuilder: {
          status: "shipped",
          note: "A deep CRM with custom fields, relationships, memberships and an activity stream.",
          source: `${NB}/2291229-how-support-status-is-determined`,
        },
        upriseToday: {
          status: "shipped",
          note: "Phone and address matching with merge, tags, per-channel consent and a combined contact timeline.",
        },
        uprisePlanned: {
          horizon: "later",
          note: "User-defined custom fields; today anything extra goes in an untyped metadata bag.",
        },
      },
      {
        area: "Australian electoral data",
        actionNetwork: {
          status: "partial",
          note: "Native districts are United States congressional and state level.",
          source: `${AN}/articles/203846575-Targeting-emails`,
        },
        nationBuilder: {
          status: "partial",
          note: "Strong United States electoral plumbing; the voter file is customer-supplied.",
          source: `${NB}/2291371-how-to-use-the-turf-cutter`,
        },
        upriseToday: {
          status: "shipped",
          note: "The national geocoded address file, statistical geography, and federal, state and local divisions, built in.",
        },
      },
      {
        area: "Surveys and support scoring",
        actionNetwork: {
          status: "partial",
          note: "Multi-page surveys with conditional logic; scoring is done with tags.",
          source: `${AN}/articles/4407860908315-Creating-a-survey`,
        },
        nationBuilder: {
          status: "shipped",
          note: "Survey pages that tag respondents differentially by answer, feeding support status.",
          source: `${NB}/2291229-how-support-status-is-determined`,
        },
        upriseToday: {
          status: "shipped",
          note: "Branching surveys that work at the door and over SMS, mapping to a five-point support scale.",
        },
      },
      {
        area: "Reporting",
        actionNetwork: {
          status: "partial",
          note: "Strong extraction – scheduled reports, exports and a paid read-only data mirror.",
          source: `${AN}/articles/360042303752-Using-reports`,
        },
        nationBuilder: {
          status: "partial",
          note: "Operational reporting, with a separate analytics product on the higher tiers.",
          source: `${NB}/2291229-how-support-status-is-determined`,
        },
        upriseToday: {
          status: "partial",
          note: "Operational reporting on doors, conversations, support identified and volunteer activity.",
        },
        uprisePlanned: {
          horizon: "later",
          note: "Scheduled exports and a data mirror, which both other platforms offer and we do not.",
        },
      },
    ],
  },
  {
    group: "Everything else a campaign runs on",
    rows: [
      {
        area: "Petitions and forms",
        actionNetwork: {
          status: "shipped",
          note: "The deepest part of the product alongside email – petitions, forms, letters and surveys.",
          source: `${AN}/articles/203534496-Creating-a-petition`,
        },
        nationBuilder: {
          status: "shipped",
          note: "Petition, signup, survey and volunteer page types are native to the website builder.",
          source: `${NB}/2291266-how-to-create-an-event`,
        },
        upriseToday: {
          status: "absent",
          note: "Two narrow action-page types exist – click-to-call and event RSVP. There is no petition or generic form.",
        },
        uprisePlanned: {
          horizon: "later",
          note: "Petitions and forms that write to the same supporter record as a door knock.",
        },
      },
      {
        area: "Fundraising",
        actionNetwork: {
          status: "shipped",
          note: "One-off and recurring giving through Stripe, with ticketed events.",
          source: `${AN}/articles/203474620-Creating-a-fundraising-page`,
        },
        nationBuilder: {
          status: "shipped",
          note: "A core strength, with its own payments product and recurring giving.",
          source: "https://nationbuilder.com/payments",
        },
        upriseToday: {
          status: "absent",
          note: "Not built. The payment code in Uprise bills organisations for their own subscription.",
        },
        uprisePlanned: {
          horizon: "not-our-lane",
          note: "Campaigns already have a donation processor and it is rarely the thing that is failing them.",
        },
      },
      {
        area: "Hosted campaign website",
        actionNetwork: {
          status: "partial",
          note: "Branded action pages and email wrappers, rather than a full site builder.",
          source: `${AN}/articles/203474620-Creating-a-fundraising-page`,
        },
        nationBuilder: {
          status: "shipped",
          note: "A full templated content management system. This is the platform's differentiator.",
          source: `${NB}/2291266-how-to-create-an-event`,
        },
        upriseToday: {
          status: "absent",
          note: "Not built. Uprise brands the organiser and supporter surfaces, not a public website.",
        },
        uprisePlanned: {
          horizon: "not-our-lane",
          note: "Campaign websites are a solved problem, and a poor use of our effort against the doorstep.",
        },
      },
      {
        area: "Automation",
        actionNetwork: {
          status: "shipped",
          note: "A visual journey builder with a wide set of triggers.",
          source: `${AN}/articles/360042303772-What-are-ladders`,
        },
        nationBuilder: {
          status: "partial",
          note: "Automations and drip series, metered by tier and sold in packs.",
          source: "https://nationbuilder.com/pricing",
        },
        upriseToday: {
          status: "absent",
          note: "Built but switched off, and granted by no plan – so no customer can reach it.",
        },
        uprisePlanned: {
          horizon: "next",
          note: "Cross-channel sequences triggered by a door answer or a reply.",
        },
      },
      {
        area: "Shared team inbox",
        actionNetwork: {
          status: "partial",
          note: "A mobile message inbox for texting, separate from other channels.",
          source: `${AN}/articles/360042202532-Getting-started-with-mobile-messaging-and-call-campaigns`,
        },
        nationBuilder: {
          status: "partial",
          note: "Per-channel inboxes rather than one cross-channel queue.",
          source: `${NB}/2344046-send-and-receive-text-messages`,
        },
        upriseToday: {
          status: "shipped",
          note: "A live SMS inbox the whole team claims from, showing what happened at the door beside the message.",
        },
        uprisePlanned: {
          horizon: "next",
          note: "One queue across SMS, WhatsApp and voice as those channels open up.",
        },
      },
      {
        area: "Multiple campaigns under one body",
        actionNetwork: {
          status: "shipped",
          note: "Federated groups where data flows up to a parent, on a separate plan.",
          source: `${AN}/articles/360042303812-What-is-a-network`,
        },
        nationBuilder: {
          status: "shipped",
          note: "A headquarters nation over networked nations, at the enterprise tier.",
          source: "https://nationbuilder.com/pricing",
        },
        upriseToday: {
          status: "shipped",
          note: "Each campaign is an isolated workspace with its own branding, team and data, grouped under a network.",
        },
        uprisePlanned: {
          horizon: "exploring",
          note: "Aggregated cross-campaign reporting, which has to respect each campaign's permissions first.",
        },
      },
      {
        area: "Public API",
        actionNetwork: {
          status: "shipped",
          note: "A documented REST API covering the main resources.",
          source: "https://actionnetwork.org/docs",
        },
        nationBuilder: {
          status: "shipped",
          note: "A documented REST API with token authentication.",
          source: "https://nationbuilder.com/api-documentation",
        },
        upriseToday: {
          status: "absent",
          note: "Keys can be issued but nothing authenticates with them yet.",
        },
        uprisePlanned: {
          horizon: "next",
          note: "Verification for the keys that already exist, then a documented surface.",
        },
      },
      {
        area: "Syncing with the tools you already run",
        actionNetwork: {
          status: "shipped",
          note: "A documented API and a wide integration ecosystem.",
          source: "https://actionnetwork.org/docs",
        },
        nationBuilder: {
          status: "shipped",
          note: "A documented API and an integration directory.",
          source: "https://nationbuilder.com/api-documentation",
        },
        upriseToday: {
          status: "partial",
          note: "Reads lists and contacts from both Action Network and NationBuilder, one connection per group or nation.",
        },
        uprisePlanned: {
          horizon: "next",
          note: "Writing results back, so a door knock recorded here appears in the platform you already use.",
        },
      },
    ],
  },
];

export const ALL_ROWS: ComparisonRow[] = COMPARISON_GROUPS.flatMap((g) => g.rows);

/** Human labels for the roadmap bands. */
export const HORIZON_LABEL: Record<Horizon, string> = {
  next: "Next",
  later: "Later",
  exploring: "Exploring",
  "not-our-lane": "Not our lane",
};

/** Rows Uprise plans to move on, grouped for the roadmap section. Excludes deliberate opt-outs. */
export function plannedByHorizon(horizon: Horizon): ComparisonRow[] {
  return ALL_ROWS.filter((r) => r.uprisePlanned?.horizon === horizon);
}
