/**
 * Content for /homepage4 — the live homepage with a cinema opening.
 *
 * The page below the fold is the live `/` set of sections, unchanged. Only the opening
 * (glass header → animated hero → coverage ticker → pinned stage) is new, and its copy
 * and figures live here.
 *
 * Two rules carried over from /homepage2, both of which were broken in an earlier draft:
 *
 * 1. NO INVENTED METRICS. Every figure is a *coverage* number readable off the product's
 *    own Datasets screen (16,905,838 addresses; 150 federal divisions; 415 + 23 state
 *    seats; 547 LGAs). There are deliberately no usage or growth stats ("184k doors
 *    knocked") — those need a real source before they go on a public page.
 * 2. SATELLITES QUOTE THEIR CAPTURE. Each stage satellite states a number visible in the
 *    screenshot behind it. If the capture set is re-shot, these move with it or they
 *    become fiction.
 */

/**
 * The homepage's section anchors, in page order.
 *
 * One source of truth for two things that have to agree: the `id` each section carries in its
 * markup, and the rail stop that scrolls to it. The rail resolves its stops from the document, so
 * a stop whose id is absent simply never activates — silently. Importing the id rather than
 * repeating the string in each section is what stops that drifting.
 *
 * These are public URL fragments (uprise.org.au/#toolkit), so they say what the section is. The
 * old `home-` prefix named the candidate this page was built as, and the labels had drifted from
 * the ids besides ("Open" pointing at `#home-hero`); the CSS keeps `home-` on its classes, which are
 * internal.
 */
export const SECTION = {
  overview: "overview",
  oneShift: "one-shift",
  toolkit: "toolkit",
  data: "data",
  teams: "teams",
  campaigns: "campaigns",
  getStarted: "get-started",
} as const;

/** The left rail's stops. Each label is its section's id in words – they name the same thing. */
export const RAIL = [
  { id: SECTION.overview, label: "Overview" },
  { id: SECTION.oneShift, label: "One shift" },
  { id: SECTION.toolkit, label: "Toolkit" },
  { id: SECTION.data, label: "Data" },
  { id: SECTION.teams, label: "Teams" },
  { id: SECTION.campaigns, label: "Campaigns" },
  { id: SECTION.getStarted, label: "Get started" },
] as const;

export const HERO = {
  eyebrow: "Australian · Multichannel Organising · Built by campaigners",
  /** Two lines; the last is accented. */
  titleLines: ["Every channel.", "One campaign."],
  lede: "The all-in-one campaigning platform for progressive organisations.",
} as const;

export type Stat = { to: number; dp?: number; suffix?: string; label: string };

/**
 * Two kinds of figure, neither an invented growth stat: data coverage readable off the product's
 * own Datasets screen, and the shape of the platform itself. Sources:
 *   16.9M  16,905,838 Australian addresses
 *   1,135  150 federal divisions + 438 state electorates (415 lower + 23 upper) + 547 LGAs.
 *          Was three separate cells; one number says "we have every boundary" better than three
 *          competing for the same glance.
 *   7      the channels a campaign runs from one platform: SMS, WhatsApp, voice calls, the doors,
 *          branching surveys, action pages and push to volunteers' phones.
 *          KEEP IN STEP WITH <RoadmapBand />, which states on this same page that email
 *          broadcasts, social DMs and outbound WhatsApp are NOT available yet — nothing still on
 *          the roadmap may be counted here, or the page contradicts itself.
 *   3      the member-facing apps: the organiser workspace (apps/admin), the offline canvasser app
 *          (apps/field) and supporter action pages (apps/action). api, auth, worker and the two
 *          marketing sites aren't member-facing, so they aren't counted.
 *
 * The statistical-area count and the "0 bars of signal" line these replaced are both still made
 * elsewhere: the ASGS hierarchy in ATLAS.stats, and the offline story in SCENES[1] and
 * GALLERY.facts.
 */
export const TICKER: Stat[] = [
  { to: 16.9, dp: 1, suffix: "M", label: "Australian addresses" },
  { to: 1135, label: "Electorates & councils" },
  { to: 7, label: "Comms channels" },
  { to: 3, label: "Member apps" },
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
    // No walk-list capture exists that is usable (field-walk@2x is the field sign-in
    // screen), so this beat has no screenshot at all: the desktop frame recedes and the
    // drawn phone takes the stage. It is the better beat anyway.
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
    facts: ["Shared + claimable", "Live over SSE"],
    shotKey: "inbox",
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
