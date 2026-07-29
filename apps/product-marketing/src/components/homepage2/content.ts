/**
 * Content for /homepage2 (the "cinema" homepage candidate).
 *
 * Two rules this file exists to enforce, both of which were broken in an earlier draft:
 *
 * 1. NO INVENTED METRICS. Every figure here is a *coverage* number readable off the
 *    product's own Datasets screen (16,905,838 addresses; 150 federal divisions;
 *    415 + 23 state seats; 547 LGAs). There are deliberately no usage or growth
 *    stats ("184k doors knocked") — those need a real source before they go on a
 *    public page.
 * 2. SATELLITES QUOTE THEIR CAPTURE. Each stage satellite states a number that is
 *    visible in the screenshot behind it. If the capture set is ever re-shot, these
 *    move with it or they become fiction.
 */

export type Act = { id: string; label: string };

export const ACTS: Act[] = [
  { id: "hp2-act0", label: "Open" },
  { id: "hp2-act1", label: "One shift" },
  { id: "hp2-act2", label: "Toolkit" },
  { id: "hp2-act3", label: "Atlas" },
  { id: "hp2-act4", label: "Campaigns" },
  { id: "hp2-act5", label: "Close" },
];

export type Stat = { to: number; dp?: number; suffix?: string; label: string };

export const TICKER: Stat[] = [
  { to: 16.9, dp: 1, suffix: "M", label: "Australian addresses" },
  { to: 150, label: "Federal divisions" },
  { to: 438, label: "State electorates" },
  { to: 547, label: "Local councils" },
];

export const ATLAS_STATS: Stat[] = [
  { to: 16905838, label: "G-NAF addresses" },
  { to: 150, label: "Federal divisions" },
  { to: 547, label: "Local government areas" },
  { to: 438, label: "State electorates" },
];

export type Satellite = {
  pos: "tl" | "tr" | "bl" | "br";
  cap: string;
  /** A counted number, or a five-point support meter. */
  to?: number;
  suffix?: string;
  meter?: boolean;
  /** Progress bar width, e.g. "67%". */
  bar?: string;
};

export type Scene = {
  no: string;
  heading: string;
  body: string;
  facts: string[];
  /** screens.json key, or null when the scene has no screenshot. */
  shotKey: string | null;
  /** Frame width the scene settles at — the frame narrows and widens between beats. */
  frameWidth: number;
  url: string;
  satellites: Satellite[];
};

export const SCENES: Scene[] = [
  {
    no: "01",
    heading: "Cut the turf before anyone leaves the office.",
    body: "Draw a boundary on the map, split it into walkable blocks by door count, and watch the address estimate update as you go.",
    facts: ["Mapbox turf cutter", "Live address counts"],
    shotKey: "turf",
    frameWidth: 1000,
    url: "app.uprise.org.au/canvass/turf",
    satellites: [
      { pos: "tl", cap: "Doors in this turf", to: 150 },
      { pos: "br", cap: "Doors knocked", to: 67, suffix: "%", bar: "67%" },
    ],
  },
  {
    // No walk-list capture exists that is usable (field-walk@2x is the field
    // sign-in screen), so this beat has no screenshot at all: the desktop frame
    // recedes and the drawn phone takes the stage. It is the better beat anyway.
    no: "02",
    heading: "Hand every volunteer a route, not a spreadsheet.",
    body: "Walk lists come route-optimised and land on the phone. The app queues knocks to an on-device outbox and flushes the moment signal comes back.",
    facts: ["Installable PWA", "Offline outbox"],
    shotKey: null,
    frameWidth: 600,
    url: "field.uprise.org.au/walk/coburg-14",
    satellites: [],
  },
  {
    no: "03",
    heading: "Every reply lands in one claimable queue.",
    body: "SMS and WhatsApp arrive in a shared inbox the whole team works, live over SSE, with claims so nobody doubles up on the same conversation.",
    facts: ["Shared + claimable", "Live over SSE", "Shown in dark theme"],
    shotKey: "inbox-dark",
    frameWidth: 900,
    url: "app.uprise.org.au/inbox",
    satellites: [{ pos: "tr", cap: "Unified inbox", to: 24 }],
  },
  {
    no: "04",
    heading: "Turn the conversation into a number you can target on.",
    body: "Custom dispositions map to a five-point support scale, so a night of doorknocking becomes a targeting decision by the morning.",
    facts: ["Custom dispositions", "5-point scoring"],
    shotKey: "results",
    frameWidth: 920,
    url: "app.uprise.org.au/canvass/insights",
    satellites: [
      { pos: "bl", cap: "Support · 5-point", meter: true },
      { pos: "tr", cap: "Doors attempted", to: 90 },
    ],
  },
  {
    no: "05",
    heading: "Then reshape the turf around what you learned.",
    body: "Every boundary set is already ingested – federal, state and local divisions, ASGS statistical areas, 16.9 million addresses – so the next round of turf is a better one.",
    facts: ["ABS + G-NAF built in", "No data project first"],
    shotKey: "datasets",
    frameWidth: 1000,
    url: "app.uprise.org.au/data/datasets",
    satellites: [{ pos: "tr", cap: "Local government areas", to: 547 }],
  },
];

export type Chip = { icon: string; title: string; sub: string };

export const CHIPS: Chip[] = [
  { icon: "◆", title: "Audiences & CSV", sub: "Live import progress" },
  { icon: "↻", title: "Action Network", sub: "Two-way list sync" },
  { icon: "✓", title: "Opt-out compliance", sub: "Checked automatically" },
  { icon: "◈", title: "Quality assurance", sub: "Review every shift" },
];

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

export type CampaignType = { no: string; title: string; body: string };

export const CAMPAIGN_TYPES: CampaignType[] = [
  {
    no: "01",
    title: "Electoral & candidate",
    body: "Cut turf, knock doors and text voters from the candidate's own number – with electorate data and polling built in.",
  },
  {
    no: "02",
    title: "Advocacy & issue",
    body: "Run P2P SMS and calls, capture support on a five-point scale, and sync every contact to Action Network.",
  },
  {
    no: "03",
    title: "Community organising",
    body: "Coordinate volunteers with shifts, a shared claimable inbox and a live action room that updates in real time.",
  },
  {
    no: "04",
    title: "Union & member",
    body: "Reach members by SMS and phone, survey them at the door or over text, and segment by workplace or region.",
  },
  {
    no: "05",
    title: "GOTV & field",
    body: "Optimised walk lists, an offline-first canvasser app and pace-vs-target goals to get the vote out on the day.",
  },
  {
    no: "06",
    title: "Referendum & ballot",
    body: "Map the electorate, canvass yes/no support with branching surveys, and track the contact funnel to polling day.",
  },
];

export type Post = { category: string; minutes: string; title: string; body: string; href: string };

export const POSTS: Post[] = [
  {
    category: "Organising",
    minutes: "8 min",
    title: "Build a volunteer team that actually shows up",
    body: "Invitations and roles, a calendar volunteers can read, shifts that stick, and a live action room with one-tap broadcast.",
    href: "/blog",
  },
  {
    category: "Data",
    minutes: "7 min",
    title: "Your electorate, mapped before you knock a single door",
    body: "G-NAF addresses, ASGS geography, every electoral division and electorate polling on a choropleth – ready to turn into turf.",
    href: "/blog",
  },
  {
    category: "Playbook",
    minutes: "8 min",
    title: "Turn every door knock into a targeting decision",
    body: "Custom dispositions on a five-point support scale, an honest results read, and turf that reshapes around what you learn.",
    href: "/blog",
  },
];

/**
 * Australia as a 32 × 22 boolean grid, '#' = land. Coarse on purpose: a stylised
 * low-res silhouette (Cape York, the Gulf of Carpentaria notch, the Great
 * Australian Bight scoop, Tasmania) reads as a deliberate data grid rather than an
 * inaccurate map, and needs no vector path.
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
