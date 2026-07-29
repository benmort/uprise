/**
 * Copy and figures for every homepage section below the opening.
 *
 * Sources, so a change can be traced back: the bento tiles and the Atlas act come from
 * /homepage2, the numbered feature cards, teams mock, research partnerships, use cases and roadmap
 * from /homepage3, and the electorate row from the previous live homepage. Screenshot keys index
 * `public/images/marketing/screens/screens.json`, so alt text travels with the capture and can't
 * drift from the picture.
 *
 * Same two rules the opening holds itself to: no invented metrics (every figure is a coverage
 * number readable off the product's own Datasets screen), and any figure sitting on a capture must
 * be visible in that capture.
 */

/* ============================================================ toolkit (bento) */

export const TOOLKIT = {
  eyebrow: "The whole toolkit",
  title: "Everything your campaign runs on",
  lede: "From the first text to the last door knocked – every system your campaign runs on, in one platform.",
  /** The label over the numbered cards that follow the tiles. */
  alsoLabel: "Also included",
} as const;

export const CANVASS_TILE = {
  eyebrow: "Field canvassing",
  title: "Cut turf, then walk it",
  body: "Draw a boundary, split it into walkable blocks, and send route-ordered lists to volunteers' phones with real walking metrics.",
  badge: "18 blocks · route-ordered",
} as const;

export const INBOX_TILE = {
  eyebrow: "Multichannel outreach",
  title: "One inbox for every conversation",
  body: "SMS and WhatsApp land in a shared queue your whole team works, with claims so nobody doubles up.",
  thread: [
    { dir: "in" as const, who: "+61 4·· ··· 118", text: "What time does the Coburg door knock start?", d: 400 },
    {
      dir: "out" as const,
      who: "Claimed by Sam",
      text: "10am at the Bell St shops – I'll send the walk list through now.",
      d: 900,
    },
    { dir: "in" as const, who: "+61 4·· ··· 118", text: "Perfect, count me in 👍", d: 1500 },
  ],
} as const;

export const DISPOSITION_TILE = {
  eyebrow: "Engagement content",
  title: "Dispositions on a five-point scale",
  body: "Map custom outcome codes to strong support through strong oppose, and fire canned replies on the first inbound.",
} as const;

export type Tile = { eyebrow: string; title: string; body: string };

export const SMALL_TILES: Tile[] = [
  {
    eyebrow: "Reach",
    title: "P2P texting & browser calls",
    body: "A peer-to-peer SMS console with a live dual-channel preview, plus a WebRTC softphone that dials from the campaign's own number.",
  },
  {
    eyebrow: "Volunteers",
    title: "Shifts and a live action room",
    body: "Roles, invitations and approvals, a calendar volunteers can read, and a one-tap broadcast to every phone in the field.",
  },
  {
    eyebrow: "White-label",
    title: "Many brands, one account",
    body: "Each campaign gets an isolated portal at its own slug, with its own logo, colours and custom styling.",
  },
];

/**
 * The rest of the toolkit, as numbered cards. Deliberately only what the six tiles above DON'T
 * already state — the tiles cover canvassing, the inbox, dispositions, P2P texting and calls,
 * shifts and the action room, and white-label, so those are absent here rather than repeated.
 */
export const FEATURE_CARDS: Tile[] = [
  {
    eyebrow: "",
    title: "Branching surveys",
    body: "Skip-logic surveys that run on the doors and over SMS, with per-option canned replies and disposition mapping.",
  },
  {
    eyebrow: "",
    title: "Audiences & CSV imports",
    body: "Build audiences and segments, upload contacts by CSV with live import progress, and target the right channel.",
  },
  {
    eyebrow: "",
    title: "Action Network sync",
    body: "Connect and test Action Network, search lists and run sync jobs to keep your contacts in step.",
  },
  {
    eyebrow: "",
    title: "Australian data built in",
    body: "G-NAF addresses, ASGS geography, federal, state and local divisions, politicians, policies and demographics.",
  },
  {
    eyebrow: "",
    title: "Electorate polling",
    body: "Crosstabs, regional choropleth maps and canvassing targets – with public and embeddable views.",
  },
  {
    eyebrow: "",
    title: "Role-based team access",
    body: "Invitations, join-request approvals and per-plan feature flags, so organisers only see what their role needs.",
  },
  {
    eyebrow: "",
    title: "Events & RSVPs",
    body: "Run launches, phone banks and canvass days with RSVPs that write straight back to the contact record.",
  },
  {
    eyebrow: "",
    title: "Opt-out compliance",
    body: "Opt-outs are checked automatically before every send, and honoured across every channel you run.",
  },
];

/* ======================================================== the data arc */

/** The light beat: the previous homepage's "Know your electorate" row, kept verbatim. */
export const ELECTORATE = {
  eyebrow: "AUDIENCE, DATA & INSIGHTS",
  title: "Know your electorate",
  subFeatures: [
    {
      title: "Audiences, imports & Action Network sync",
      description:
        "Build audiences and segments, upload CSVs with live import progress, target by channel, and connect Action Network for two-way list sync.",
    },
    {
      title: "Australian data & electorate polling",
      description:
        "G-NAF addresses, ASGS geography, federal, state and local divisions, politicians and policies built in – plus electorate polling with crosstabs and choropleth maps.",
    },
  ],
} as const;

export type Stat = { to: number; dp?: number; suffix?: string; label: string };

export const ATLAS = {
  eyebrow: "Audience, data & insights",
  titleLines: ["The whole country,", "already loaded."],
  lede: "G-NAF addresses, ASGS geography, every federal, state and local division, politicians, policies and census demographics – in the workspace on day one, not a data project you have to run first.",
  legend: "ABS Census 2021 · median age",
  /**
   * Same combined boundary count as the hero ticker (150 federal + 438 state + 547 LGA = 1,135),
   * so the two do not contradict each other on the one page. The freed slots go to data this
   * section is actually about rather than repeating the ticker: SA2s are the level the choropleth
   * shades at, and the ABS Indigenous structure is 40 Regions + 412 Areas = 452.
   */
  stats: [
    { to: 16905838, label: "G-NAF addresses" },
    { to: 1135, label: "Electorates & councils" },
    { to: 2472, label: "SA2 statistical areas" },
    { to: 452, label: "Indigenous areas & regions" },
  ] as Stat[],
} as const;

export const DEMOGRAPHICS = {
  eyebrow: "Where to knock first",
  title: "Census demographics, mapped to your turf",
  body: "Shade SA1s by a blended where-to-knock score – doors, persuadability, supporters, fit, walkability and coverage freshness – and send volunteers where the movement actually is.",
  /** The dark capture, because this beat sits on ink. */
  screen: "demographics-dark",
} as const;

/**
 * Australia as a 32 × 22 boolean grid, '#' = land. Coarse on purpose: a stylised low-res
 * silhouette (Cape York, the Gulf of Carpentaria notch, the Great Australian Bight scoop,
 * Tasmania) reads as a deliberate data grid rather than an inaccurate map, and needs no vector
 * path.
 */
export const AU_GRID: string[] = [
  "......................##........",
  ".............####....####.......",
  "............#######...###.......",
  ".........##########...####......",
  "........############..#####.....",
  ".......####################.....",
  "......######################....",
  "....#########################...",
  "..############################..",
  ".##############################.",
  ".###############################",
  ".###############################",
  "..##############################",
  "..#############################.",
  "..##########......#############.",
  "..########........#############.",
  "...####..........#############..",
  "....................##########..",
  ".....................#######....",
  ".........................###....",
  "........................####....",
  ".........................##.....",
];

/* ============================================================ teams & research */

export const TEAMS = {
  eyebrow: "Teams & white-label",
  title: "Built for teams — and for many brands",
  body: [
    "Role-based team access with invitations and join-request approvals, per-plan feature flags and a getting-started checklist for every new organiser.",
    "Run many campaigns and brands from one account – each an isolated white-label portal at your own slug, with its own logo, colours and CSS.",
  ],
  mock: {
    label: "White-label workspace",
    meta: "yourname.uprise.org.au",
    members: [
      { name: "Jess Callahan", role: "Field director", badge: "Admin", tone: "accent" as const },
      { name: "Sam Okonkwo", role: "Data lead", badge: "Organiser", tone: "neutral" as const },
    ],
    pending: { email: "danielle@campaign.org.au", note: "Join request · pending", action: "Approve" },
    chips: ["Your logo & colours", "Isolated data", "Per-plan features", "Shift scheduling"],
  },
} as const;

export const RESEARCH = {
  eyebrow: "Research partnerships",
  title: "Built with the people who poll this country",
  body: "We work directly with Australia's leading polling and research houses so their fieldwork lands inside your campaign, not in an inbox attachment. Seat-level and national waves flow in on a schedule, weighted and ready – the same records your organisers are already texting and doorknocking.",
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
      body: "Crosstabs, trend lines and choropleths generated on each wave and shared with your board or funder.",
    },
  ],
  cta: "Talk to us about a research partnership",
  wave: {
    label: "Wave 14 · Partner feed",
    synced: "SYNCED 06:00 AEST",
    title: "Two-party preferred · Division of Bennelong",
    meta: "n = 1,204 · MoE ±2.8",
    /** Fill weights step down with support, so the bars read as a scale rather than a palette. */
    rows: [
      { label: "Strong support", pct: 34, tone: "s1" as const },
      { label: "Lean support", pct: 21, tone: "s2" as const },
      { label: "Undecided", pct: 18, tone: "s3" as const },
      { label: "Opposed", pct: 27, tone: "s4" as const },
    ],
    chips: ["Weighted to ABS", "Crosstabs ready", "Trend vs wave 13"],
  },
  facts: [
    { value: "Weekly", caption: "Wave cadence during campaign periods" },
    { value: "SA1", caption: "Smallest geography estimates are modelled to" },
    { value: "Board-ready", caption: "Reports exported for funders and committees" },
  ],
} as const;

/* ============================================================ use cases, roadmap */

export const USE_CASES = {
  eyebrow: "Built for the work",
  title: "Whatever kind of campaign you're running",
  cards: [
    {
      title: "Electoral & candidate",
      body: "Turf, doors and texts from the candidate's own number – with the electorate's data already in the account.",
    },
    {
      title: "Advocacy & issue",
      body: "P2P SMS and calls, support captured on a five-point scale, every contact synced back to Action Network.",
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
      body: "Optimised walk lists, an offline-first canvasser app and pace-vs-target goals on the day that counts.",
    },
    {
      title: "Referendum & ballot",
      body: "Map the electorate, canvass yes/no with branching surveys, watch the contact funnel close.",
    },
  ],
} as const;

export const ROADMAP = {
  eyebrow: "On the roadmap",
  title: "What's coming next",
  lede: "We build in the open. These are in active development – not available yet.",
  items: [
    { title: "Email broadcasts", body: "Campaign-wide email alongside SMS and voice outreach." },
    { title: "Social media DMs", body: "Reach and reply to supporters in their social inboxes." },
    { title: "WhatsApp", body: "Outbound WhatsApp conversations from your unified inbox." },
    { title: "Journeys & automation", body: "Multi-step sequences triggered off actions and dispositions." },
    { title: "Advanced segmentation", body: "Layered rules and behavioural filters for sharper targeting." },
  ],
} as const;

/* ============================================================ gallery, closing */

export const GALLERY = {
  eyebrow: "See it working",
  title: "The canvassing app, in your hand",
  lede: "The app volunteers actually use – route-ordered doors, a disposition pad, and an on-device outbox that queues knocks while the signal is gone. This is the real thing running on demo data, not a mockup.",
  facts: [
    "Installs to the home screen",
    "Works with no signal",
    "Route-ordered walk lists",
    "Photos + contacts queue offline",
  ],
  /** Behind the phone: what the shift produced, read back on the organiser's insights screen. */
  wideScreen: "results",
  /**
   * The phone's fallback, used until the live demo embed is available. `field-walk-dark` rather
   * than `field-walk`: the light capture is the field SIGN-IN screen despite its alt text, while
   * the "dark" one is the actual route-ordered walk list (and renders light anyway — the capture's
   * theme metadata is wrong, its picture is right).
   */
  phoneScreen: "field-walk-dark",
} as const;

export const CLOSING = {
  eyebrow: "Ready when you are",
  title: "Ready to organise?",
  lede: "Every channel, every door, every volunteer – run your whole campaign from one place.",
} as const;

/**
 * The blog strip, adopted from the homepage2 candidate's "From the blog" section. Its heading is
 * that candidate's ("Playbooks from the field") rather than the old strip's "Latest from the blog".
 * The posts themselves are read live in LatestPosts.tsx — nothing about them is hardcoded here.
 */
export const BLOG = {
  eyebrow: "From the blog",
  title: "Playbooks from the field",
} as const;
