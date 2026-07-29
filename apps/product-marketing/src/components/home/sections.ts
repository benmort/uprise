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

/** A run of the composer's message body. `tag` is a merge tag rendered as a chip. */
export type Run = { d: number; pre: string; tag: string | null; post: string };

/**
 * The outreach tile. Copy is the former SMALL_TILES[0], unchanged — see the accuracy note below.
 *
 * Two panels, in the order the copy's own two clauses read: the composer with its live preview,
 * then the softphone. Every string is copied from the product, not recalled:
 *   composer  apps/admin/src/app/(main)/blasts/[id]/composer/page.tsx — :825 panel title,
 *             :318 maxCharacters, :46 the two tags, :401 the warning, :1090 the pass,
 *             :721/:729 the buttons, :747-769 the channel toggle
 *   call bar  apps/admin/src/components/softphone/call-bar.tsx — :24/:26 the statuses,
 *             :47 the from-number appended to EVERY state, :55 mute disabled unless open
 *   log rows  CallStatus, packages/db/prisma/schema.prisma:2291-2300
 *
 * ACCURACY, knowingly kept: there is no organiser-facing "P2P SMS console". On the organiser side
 * P2P is a checkbox on this composer ("P2P text bank — volunteers press-send each message",
 * composer/page.tsx:984-993); the real console is a volunteer app in packages/field. The decision
 * was to leave the copy, so the VISUAL is grounded in the composer — which genuinely is an
 * organiser SMS surface with a live dual-channel preview, i.e. what the first clause describes.
 * Nothing here asserts a console exists.
 */
export const OUTREACH_TILE = {
  eyebrow: "Reach",
  title: "P2P texting & browser calls",
  body: "A peer-to-peer SMS console with a live dual-channel preview, plus a WebRTC softphone that dials from the campaign's own number.",
  composer: {
    panel: "Message content",
    /**
     * 141 is `template.length` with the tags UNRENDERED, which is what the composer counts. The
     * rendered preview below is 126 characters — shorter on purpose, and that gap is the counter's
     * whole point. Do not "fix" it to match.
     */
    chars: { to: 141, max: 160 },
    runs: [
      { d: 220, pre: "Hi ", tag: "{{first_name}}", post: ", it's Sam from the campaign — " },
      {
        d: 520,
        pre: "we're knocking doors in ",
        tag: "{{location}}",
        post: " on Saturday 10am. Can you make it? ",
      },
      { d: 820, pre: "Reply STOP to opt out", tag: null, post: "" },
    ] as Run[],
    /** The draggable chip palette. Server-side fallbacks are "friend" / "your area". */
    tags: [
      { text: "{{first_name}}", d: 340 },
      { text: "{{location}}", d: 400 },
    ],
    /**
     * The flip is the tile. It is literally true — the composer re-runs its opt-out check on every
     * keystroke, so the warning is genuinely what the card shows until the third run lands.
     */
    compliance: {
      warn: "Missing opt-out language. Include 'Reply STOP to opt out'.",
      ok: "No compliance warnings detected.",
      d: 1100,
    },
    actions: [
      { label: "Send Proof", tone: "ghost" as const, d: 1200 },
      { label: "Send Now", tone: "solid" as const, d: 1260 },
    ],
    /**
     * The channel toggle is STATIC. The WhatsApp path renders an approved template (contentSid),
     * not the SMS body, so animating a swap between them would compare templates while pretending
     * to compare channels.
     */
    preview: {
      channels: ["SMS", "WhatsApp"],
      rendered:
        "Hi Priya, it's Sam from the campaign — we're knocking doors in Coburg on Saturday 10am. Can you make it? Reply STOP to opt out",
      deviceD: 900,
      bubbleD: 1020,
    },
  },
  call: {
    who: "Priya Raman",
    /** The bar appends this to EVERY state, so it sits outside the state swap. */
    from: "· from +61 3 7003 ····",
    d: 1300,
    /** CallState, in order. The last is what a reduced-motion visitor is left with. */
    states: [
      { text: "Connecting…", d: 0, live: false },
      { text: "Ringing…", d: 1600, live: false },
      { text: "0:02", d: 1900, live: true },
    ],
    /** Mute is disabled until the leg is open. */
    muteD: 2050,
    /**
     * Two rows, not three: one call at a time is a real softphone constraint
     * (softphone-provider.tsx:126) — the third call is the one in the bar. There is no post-call
     * disposition anywhere in the product, so the tile does not imply one.
     */
    log: [
      { num: "+61 4·· ··· 118", status: "COMPLETED", dur: "1:42", ok: true, d: 2150 },
      { num: "+61 4·· ··· 402", status: "NO_ANSWER", dur: "—", ok: false, d: 2230 },
    ],
  },
} as const;

/**
 * The blasts tile. Two figures, both CONFIGURATION rather than usage: the worker claims PENDING
 * recipients in batches of BLAST_SEND_BATCH_SIZE (default 475, apps/api/src/blasts/blasts.service.ts
 * :500-503) against the provider's 500-per-request cap. Nothing here counts anything.
 *
 * The board is a SHAPE, not a count — 18 × 8 = 144 cells against a 475 batch. Coarse on purpose,
 * same spirit as AU_GRID below. Do not try to make the cell count equal 475.
 *
 * Rail is BlastStatus (schema.prisma:59-67); the legend is BlastRecipientStatus (:69-80).
 */
export const BLAST_TILE = {
  eyebrow: "Broadcast",
  title: "Send to a whole audience",
  body: "Compose once, proof it to your own phone, then send in batches — with every recipient's state tracked from queued through delivered and replied.",
  /** The path a send-now blast walks; SCHEDULED is the branch a timed send takes. */
  rail: [
    { label: "DRAFTED", d: 140, on: false },
    { label: "PROOFED", d: 210, on: false },
    { label: "SENDING", d: 280, on: true },
    { label: "SENT", d: 350, on: false },
  ],
  /** The rail fills to the active stop: three of four. */
  railFill: { w: "67%", d: 260 },
  batch: { to: 475, note: "per send batch · 500 cap" },
  legend: [
    { label: "QUEUED", c: "--home-brand-100" },
    { label: "SENT", c: "--home-brand-300" },
    { label: "DELIVERED", c: "--home-brand" },
    { label: "RESPONDED", c: "--home-sup-1" },
    { label: "SKIPPED", c: "--home-seq-1" },
    { label: "FAILED", c: "--home-sup-5" },
  ],
  legendD: 1300,
  board: { cols: 18, rows: 8, arriveD: 220, resolveD: 800 },
} as const;

/** The two text tiles that close the bento, as a 2-up t6 row. */
export const SMALL_TILES: Tile[] = [
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
 * The rest of the toolkit, as numbered cards. Deliberately only what the seven tiles above DON'T
 * already state — the tiles cover canvassing, the inbox, dispositions, P2P texting and calls, blasts,
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
  /**
   * The poster behind the live phone embed (CanvassDemoFrame), so the frame is never empty before
   * the iframe lands. Light, matching the rest of the page and the embed itself.
   *
   * KNOWN ISSUE, not introduced here: the `field-walk` shot is mis-captured. Its route resolves
   * unauthenticated to the field app's public "Become a volunteer" page, so the image is that
   * landing page rather than a walk list — and the manifest's alt text still claims "the next doors
   * on a walk list", which is what a screen reader will announce. The dark variant has exactly the
   * same problem. Needs a fix in the capture script's field-app session, not a key swap here.
   */
  phoneScreen: "field-walk",
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
