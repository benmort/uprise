/**
 * /homepage3 content — every string and figure on the "editorial" homepage candidate, lifted from
 * the standalone design handoff (`Uprise Homepage (standalone).html`).
 *
 * Kept out of the component for the same reason homepage2 does it: the layout is long and the copy
 * is what actually gets argued over, so it should be readable without scrolling past markup.
 *
 * Screenshot keys index `public/images/marketing/screens/screens.json` (written by
 * `pnpm marketing:shots`), so alt text comes from the capture rather than from here and cannot
 * drift from the picture.
 */

export const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Platform", href: "#platform" },
  { label: "Data", href: "#data" },
  { label: "Use cases", href: "#usecases" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "Blog", href: "#blog" },
  { label: "Plans", href: "/plans" },
] as const;

export const HERO = {
  eyebrow: "Non-partisan · Australian data · Built by campaigners",
  titleLines: ["Every person.", "Every channel.", "One campaign."],
  lede:
    "Uprise puts texting, calls, doorknocking, surveys, audiences and Australian electoral data on one platform – so your organisers stop stitching tools together and start winning.",
} as const;

/** The band under the logo marquee. `value` is rendered as written; no counting animation. */
export const STATS = [
  { value: "15.6M", caption: "G-NAF addresses ready to cut" },
  { value: "151+", caption: "Federal, state & local divisions" },
  { value: "5", caption: "Channels in one inbox" },
  { value: "0", caption: "Bars of signal needed to knock" },
] as const;

export const FEATURES = [
  {
    title: "P2P text messaging",
    body:
      "Personalised one-to-one SMS with a live dual-channel preview, proof sends, schedule-or-send and an automatic opt-out check.",
  },
  {
    title: "Browser softphone calls",
    body:
      "Call from the campaign's own number in the browser – click-to-dial with a global call bar, no hardware.",
  },
  {
    title: "Unified team inbox",
    body:
      "One shared, claimable queue for SMS and WhatsApp replies – live, with folders, search and audible responder alerts.",
  },
  {
    title: "Doorknocking & turf",
    body:
      "Cut turf on the map or from geographic areas with live address-count estimates, then build optimised walk lists.",
  },
  {
    title: "Offline canvasser app",
    body:
      "An installable PWA that queues door knocks to an on-device outbox and auto-flushes the moment volunteers reconnect.",
  },
  {
    title: "Live action room",
    body:
      "Watch active canvassers refresh in real time and push a one-tap broadcast to every volunteer's phone.",
  },
  {
    title: "Branching surveys",
    body:
      "Skip-logic surveys that run on the doors and over SMS, with per-option canned replies and disposition mapping.",
  },
  {
    title: "Dispositions & 5-point scoring",
    body:
      "Custom outcome codes mapped to a five-point support scale, from strong support through to strong oppose.",
  },
  {
    title: "Audiences & CSV imports",
    body:
      "Build audiences and segments, upload contacts by CSV with live import progress, and target the right channel.",
  },
  {
    title: "Action Network sync",
    body: "Connect and test Action Network, search lists and run sync jobs to keep your contacts in step.",
  },
  {
    title: "Australian data built in",
    body:
      "G-NAF addresses, ASGS geography, federal, state and local divisions, politicians, policies and demographics.",
  },
  {
    title: "Electorate polling",
    body: "Crosstabs, regional choropleth maps and canvassing targets – with public and embeddable views.",
  },
  {
    title: "White-label multi-brand",
    body:
      "Run many campaigns from one account, each an isolated portal at your own slug with its own logo, colours and CSS.",
  },
  {
    title: "Role-based team access",
    body:
      "Invitations, join-request approvals and per-plan feature flags, so organisers only see what their role needs.",
  },
  {
    title: "Shift scheduling",
    body:
      "Publish shifts volunteers can claim, track who's rostered on, and see turnout against what you planned for.",
  },
  {
    title: "Events & RSVPs",
    body:
      "Run launches, phone banks and canvass days with RSVPs that write straight back to the contact record.",
  },
] as const;

/** The alternating screenshot/prose pillars. `screen` is a `screens.json` key. */
export const PILLARS = [
  {
    id: "platform",
    eyebrow: "01 — Multichannel outreach",
    title: "One inbox for every reply your campaign gets",
    body: [
      "Peer-to-peer SMS with live dual-channel preview and automatic opt-out checks. A browser softphone that dials from your campaign's own number. Every SMS and WhatsApp reply lands in one claimable queue, live, with audible alerts so nothing waits.",
    ],
    chips: ["P2P texting", "WebRTC softphone", "Claimable queue", "Canned replies"],
    screen: "inbox",
    /** Screenshot on the right of the prose (`false` puts it on the left). */
    shotFirst: false,
  },
  {
    id: "canvassing",
    eyebrow: "02 — Field canvassing",
    title: "Cut turf at breakfast. Knock it by lunch.",
    body: [
      "Draw turf on the map or pull it straight from meshblocks with live address counts, then build walk lists optimised on real walking distance. Volunteers work offline in an installable app that flushes the outbox the second signal returns.",
    ],
    chips: ["Meshblock turf", "Offline PWA", "Live action room", "Route optimisation"],
    screen: "turf",
    shotFirst: true,
  },
  {
    id: "data",
    eyebrow: "03 — Data & insight",
    title: "Australian civic data, already loaded",
    body: [
      "G-NAF addresses, ASGS geography, every federal, state and local division, sitting members and their policies – no procurement, no import. Layer your own audiences on top and read the electorate back through crosstabs and choropleth polling maps.",
    ],
    chips: ["G-NAF + ASGS", "Electorate polling", "CSV imports", "Action Network sync"],
    screen: "datasets",
    shotFirst: false,
  },
] as const;

export const ENGAGEMENT = {
  id: "engagement",
  eyebrow: "04 — Engagement content",
  title: "Turn conversations into data you can act on",
  body: [
    "Build surveys with per-option skip logic and terminal branches that work on the doors and over SMS, backed by step-based scripts for every channel.",
    "Map custom outcome codes to a five-point support scale, and fire canned replies automatically on the first inbound reply – from an org-wide or personal library.",
  ],
  mock: {
    label: "Branching survey builder",
    meta: "3 steps · 2 branches",
    q1: "Q1 · How do you feel about the proposal?",
    options: ["Strong support", "Lean support", "Undecided", "Lean oppose", "Strong oppose"],
    branch: "IF STRONG SUPPORT →",
    q2: "Q2 · Would you volunteer for a shift?",
    q2Note: "Auto canned-reply fires on first inbound · disposition mapped to",
    q2Disposition: "Supporter — recruit",
    chips: ["Skip logic", "Door + SMS", "Auto canned-reply", "Disposition mapping"],
  },
} as const;

export const DEMOGRAPHICS = {
  eyebrow: "Where to knock first",
  title: "Census demographics, mapped to your turf",
  body:
    "Shade SA1s by a blended where-to-knock score – doors, persuadability, supporters, fit, walkability and coverage freshness – and send volunteers where the movement actually is.",
  /** The dark capture, because this section is on ink rather than paper. */
  screen: "demographics-dark",
} as const;

export const TEAMS = {
  id: "teams",
  eyebrow: "05 — Teams & white-label",
  title: "Built for teams — and for many brands",
  body: [
    "Role-based team access with invitations and join-request approvals, per-plan feature flags and a getting-started checklist for every new organiser.",
    "Run many campaigns and brands from one account – each an isolated white-label portal at your own slug, with its own logo, colours and CSS.",
  ],
  mock: {
    label: "White-label workspace",
    meta: "yourname.uprise.org.au",
    members: [
      { name: "Jess Callahan", role: "Field director", badge: "Admin", tone: "accent" },
      { name: "Sam Okonkwo", role: "Data lead", badge: "Organiser", tone: "neutral" },
    ],
    pending: { email: "danielle@campaign.org.au", note: "Join request · pending", action: "Approve" },
    chips: ["Your logo & colours", "Isolated data", "Per-plan features", "Shift scheduling"],
  },
} as const;

export const RESEARCH = {
  id: "polling",
  eyebrow: "06 — Research partnerships",
  title: "Built with the people who poll this country",
  body:
    "We work directly with Australia's leading polling and research houses so their fieldwork lands inside your campaign, not in an inbox attachment. Seat-level and national waves flow in on a schedule, weighted and ready – the same records your organisers are already texting and doorknocking.",
  points: [
    {
      lead: "Integrated feeds.",
      body: "Partner waves arrive as governed datasets – versioned, weighted, joined to division and SA1.",
    },
    {
      lead: "Field-to-research loop.",
      body: "Your door and phone responses can be blended with partner samples to sharpen local estimates.",
    },
    {
      lead: "Reports that ship themselves.",
      body:
        "Crosstabs, trend lines and choropleths generated on each wave and shared with your board or funder.",
    },
  ],
  cta: "Talk to us about a research partnership",
  wave: {
    label: "Wave 14 · Partner feed",
    synced: "SYNCED 06:00 AEST",
    title: "Two-party preferred · Division of Bennelong",
    meta: "n = 1,204 · MoE ±2.8",
    /** `bar` is the fill colour, deliberately stepping down in weight with support. */
    rows: [
      { label: "Strong support", pct: 34, bar: "#2F6BFF" },
      { label: "Lean support", pct: 21, bar: "#6E9BFF" },
      { label: "Undecided", pct: 18, bar: "#C9CFDA" },
      { label: "Opposed", pct: 27, bar: "#9AA0AA" },
    ],
    chips: ["Weighted to ABS", "Crosstabs ready", "Trend vs wave 13"],
  },
  facts: [
    { value: "Weekly", caption: "Wave cadence during campaign periods" },
    { value: "SA1", caption: "Smallest geography estimates are modelled to" },
    { value: "Board-ready", caption: "Reports exported for funders and committees" },
  ],
} as const;

export const USE_CASES = [
  {
    title: "Electoral & candidate",
    body:
      "Turf, doors and texts from the candidate's own number – with the electorate's data already in the account.",
  },
  {
    title: "Advocacy & issue",
    body:
      "P2P SMS and calls, support captured on a five-point scale, every contact synced back to Action Network.",
  },
  {
    title: "Community organising",
    body: "Shifts, a shared claimable inbox and a live action room that shows who's out there right now.",
  },
  {
    title: "Union & member",
    body: "Reach members by text and phone, survey them at the door, segment by workplace or region.",
  },
  {
    title: "GOTV & field",
    body:
      "Optimised walk lists, an offline-first canvasser app and pace-vs-target goals on the day that counts.",
  },
  {
    title: "Referendum & ballot",
    body: "Map the electorate, canvass yes/no with branching surveys, watch the contact funnel close.",
  },
] as const;

export const ROADMAP = [
  { title: "Email broadcasts", body: "Campaign-wide email alongside SMS and voice outreach." },
  { title: "Social media DMs", body: "Reach and reply to supporters in their social inboxes." },
  { title: "WhatsApp", body: "Outbound WhatsApp conversations from your unified inbox." },
  { title: "Journeys & automation", body: "Multi-step sequences triggered off actions and dispositions." },
  { title: "Advanced segmentation", body: "Layered rules and behavioural filters for sharper targeting." },
] as const;

export const GALLERY = {
  eyebrow: "See it working",
  title: "The whole campaign, on one screen at a time",
  lede:
    "Real screens from the product – not mockups. Every capture comes from a live Uprise workspace running on demo data.",
  wide: {
    screen: "dashboard",
    caption: "Campaign dashboard — doors knocked, contact rate and volunteer activity on a live doorknock.",
  },
  phone: {
    screen: "field-walk",
    caption: "The canvasser app — the next doors on a walk list, offline-ready.",
  },
} as const;

export const CLOSING = {
  title: "Your next campaign shouldn't need six logins",
  lede: "Set up an organisation, import a list and send your first message this afternoon.",
} as const;

// FOOTER moved to src/lib/footer.ts — the footer design was promoted out of this
// candidate to become the site-wide footer, so its content can no longer live in a
// folder that gets deleted when a winner is picked. See components/Footer.tsx.
