/**
 * Canonical demo/example data — the single source of truth shared by the product
 * tour, the demo-data seeder (SeedService) and tests. Framework-free (no Prisma,
 * no Nest) so it can be imported anywhere, including unit specs as fixture data.
 *
 * Web mirrors the tour-facing literals in apps/admin/src/lib/seed-constants.ts
 * (the web bundle can't import apps/api); keep the two in sync.
 */

// Tour/example campaign-of-record (owned here, was inline in uprise-tour.ts).
export const DEFAULT_TOUR_TEMPLATE =
  "Hi {{first_name}}! We're building our volunteer team in {{location}} and would love your help at an upcoming community action. Reply YES to join or STOP to opt out.";

export const EXAMPLE_AUDIENCE_NAME = "Tour Example Audience";
export const EXAMPLE_BLAST_TITLE = "Tour Example Blast";

// Stable marker stamped on demo rows so clearDemo() can find them and seedDemo()
// stays idempotent.
export const DEMO_TAG = "demo:uprise";

// Verified demo mobiles (E.164) so phone-first login (/v) and SMS 2FA work in dev
// without a real SMS — pair with the on-screen dev code hint on the code screen.
export const DEMO_LOGINS = {
  organiser: { email: "demo.organiser@uprise.test", password: "demo-organiser-pw", displayName: "Demo Organiser", mobile: "+61400000001" },
  volunteer: { email: "demo.volunteer@uprise.test", password: "demo-volunteer-pw", displayName: "Demo Volunteer", mobile: "+61400000002" },
  /**
   * OWNER, not ORGANISER. `read analytics.all` is owner/admin-only (packages/permissions roles),
   * so the dashboard's messaging card renders "Couldn't load — Missing permission: read
   * analytics.all" for an organiser. Marketing captures sign in as this account so every card on
   * the dashboard is populated.
   */
  owner: { email: "demo.owner@uprise.test", password: "demo-owner-pw", displayName: "Demo Owner", mobile: "+61400000003" },
} as const;

export const DEMO_CAMPAIGN = { name: "Demo — Spring Doorknock" } as const;

/**
 * The number demo inbox threads are sent from. Also in ACMA's drama-reserved range (see demoPhone),
 * so nothing in a seeded environment can text a real service.
 */
export const DEMO_SENDER_PHONE = "+61491570005";

// A small turf polygon over inner Sydney (GeoJSON [lng, lat] order). Real coords
// so Mapbox renders a meaningful boundary; the demo contacts sit inside it.
export const DEMO_TURF = {
  name: "Demo — Glebe blocks",
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [151.184, -33.879],
        [151.196, -33.879],
        [151.196, -33.889],
        [151.184, -33.889],
        [151.184, -33.879],
      ],
    ],
  },
};

export type DemoContactSeed = {
  firstName: string;
  lastName: string;
  address: string;
  /**
   * Undefined for the email-only tier. The drama range holds exactly 151 numbers, so once the
   * canvassable households have consumed it the remaining contacts are reachable by email only —
   * which is also what a real imported list looks like.
   */
  phoneE164?: string;
  email?: string;
  lat: number;
  lng: number;
  /** True for the households inside DEMO_TURF that the walk list and knocks are drawn from. */
  canvassable: boolean;
};

/**
 * Demo contact phone numbers come from the range ACMA reserves for use in film, TV and radio
 * drama (0491 570 006 – 0491 570 156 → +61491570006–156). Two reasons over the old
 * +6140000xxxx pattern: the range can never reach a real person, and it *looks* like a real
 * mobile, so marketing screenshots of the inbox don't read as obviously fabricated. 151 numbers
 * available, which caps the fixture size.
 *
 * DEMO_LOGINS keeps +61400000001/2 — those are sign-in credentials, not displayed contact data.
 */
const DRAMA_RANGE_START = 6;
const DRAMA_RANGE_END = 156;
export const demoPhone = (i: number): string => `+6149157${(DRAMA_RANGE_START + i).toString().padStart(4, "0")}`;

// Households inside DEMO_TURF, route-orderable. The first eight are the original fixture and
// MUST keep their order — DEMO_KNOCKS and the e2e context address contacts by index.
const DEMO_HOUSEHOLDS: Array<[string, string, string, number, number]> = [
  ["Ada", "Nguyen", "12 Glebe Point Rd", -33.8805, 151.1855],
  ["Bao", "Tran", "27 Glebe Point Rd", -33.8812, 151.1868],
  ["Cleo", "Marsh", "4 Mitchell St", -33.8828, 151.1881],
  ["Dev", "Patel", "19 Mitchell St", -33.8836, 151.1894],
  ["Esra", "Yilmaz", "8 Wigram Rd", -33.8849, 151.1907],
  ["Finn", "O'Brien", "33 Wigram Rd", -33.8857, 151.1919],
  ["Grace", "Okafor", "2 Hereford St", -33.8868, 151.1872],
  ["Hugo", "Bianchi", "15 Hereford St", -33.8875, 151.1888],
  // Screenshot-grade volume from here down: enough to paginate lists, fill a walk list and
  // give the turf map a believable cluster of doors. All inside the DEMO_TURF polygon
  // (lat -33.879…-33.889, lng 151.184…151.196).
  ["Imogen", "Clarke", "41 Glebe Point Rd", -33.8809, 151.1861],
  ["Jarrah", "Williams", "58 Glebe Point Rd", -33.8817, 151.1849],
  ["Keira", "Mahoney", "63 Glebe Point Rd", -33.8822, 151.1876],
  ["Liam", "Fitzgerald", "7 St Johns Rd", -33.8831, 151.1852],
  ["Mei", "Zhang", "22 St Johns Rd", -33.8839, 151.1864],
  ["Noah", "Kelemete", "35 St Johns Rd", -33.8844, 151.1889],
  ["Olive", "Barrett", "48 St Johns Rd", -33.8852, 151.1901],
  ["Priya", "Raman", "3 Bridge Rd", -33.8861, 151.1856],
  ["Quinn", "Halloran", "16 Bridge Rd", -33.8866, 151.1867],
  ["Rosa", "Delgado", "29 Bridge Rd", -33.8871, 151.1898],
  ["Sione", "Tuilagi", "44 Bridge Rd", -33.8879, 151.1911],
  ["Tara", "Mitchell", "9 Ferry Rd", -33.8884, 151.1858],
  ["Umar", "Haddad", "24 Ferry Rd", -33.8801, 151.1902],
  ["Vera", "Kowalski", "37 Ferry Rd", -33.8807, 151.1915],
  ["Will", "Anderson", "52 Ferry Rd", -33.8814, 151.1927],
  ["Xanthe", "Papadopoulos", "5 Cowper St", -33.8825, 151.1846],
  ["Yuki", "Tanaka", "18 Cowper St", -33.8833, 151.1858],
  ["Zane", "Whitlam", "31 Cowper St", -33.8841, 151.1871],
  ["Amara", "Diallo", "46 Cowper St", -33.8847, 151.1883],
  ["Bruno", "Costa", "11 Boyce St", -33.8855, 151.1895],
  ["Cara", "Doyle", "26 Boyce St", -33.8863, 151.1908],
  ["Dinh", "Vo", "39 Boyce St", -33.8869, 151.1921],
  ["Elena", "Petrova", "54 Boyce St", -33.8877, 151.1934],
  ["Felix", "Nakamura", "6 Lyndhurst St", -33.8882, 151.1847],
  ["Gita", "Sharma", "21 Lyndhurst St", -33.8887, 151.1859],
  ["Hamish", "Fraser", "34 Lyndhurst St", -33.8803, 151.1872],
  ["Isla", "Brennan", "49 Lyndhurst St", -33.8811, 151.1884],
  ["Jonah", "Ah Kit", "13 Toxteth Rd", -33.8819, 151.1896],
  ["Kavya", "Iyer", "28 Toxteth Rd", -33.8827, 151.1909],
  ["Lucas", "Moreau", "43 Toxteth Rd", -33.8835, 151.1922],
  ["Maya", "Hassan", "58 Toxteth Rd", -33.8843, 151.1935],
  ["Nikau", "Rangi", "10 Bellevue St", -33.8851, 151.1851],
  ["Orla", "Kavanagh", "25 Bellevue St", -33.8859, 151.1863],
  ["Paolo", "Rizzo", "38 Bellevue St", -33.8865, 151.1875],
  ["Rania", "El-Masri", "53 Bellevue St", -33.8873, 151.1887],
  ["Seb", "Lindqvist", "14 Wigram Rd", -33.8881, 151.1899],
  ["Thandi", "Mabaso", "47 Wigram Rd", -33.8886, 151.1912],
  ["Uma", "Krishnan", "61 Wigram Rd", -33.8806, 151.1924],
  ["Viktor", "Novak", "17 Hereford St", -33.8815, 151.1937],
  ["Wren", "Baker", "30 Hereford St", -33.8823, 151.1868],
  ["Yasmin", "Karimi", "45 Hereford St", -33.8829, 151.1880],
];

// ── Generated tiers ───────────────────────────────────────────────────────────
// The 50 households above are hand-written because they carry the fixture's recognisable names
// and real Glebe street addresses. Volume past that is generated: index-driven and free of any
// RNG, because the seeder matches contacts BY ADDRESS — a value that shifted between runs would
// duplicate every contact instead of updating it.

const GIVEN_NAMES = [
  "Aroha", "Bilal", "Cormac", "Delphine", "Eamon", "Farida", "Gideon", "Halina", "Ibrahim",
  "Jacinta", "Kwame", "Lena", "Manaia", "Nadia", "Oskar", "Pia", "Rafael", "Saoirse", "Tomas",
  "Ulises", "Valentina", "Wiremu", "Ximena", "Yohan", "Zara", "Anouk", "Bodhi", "Celia", "Dario",
  "Elif", "Fabien", "Greta", "Hana", "Idris", "Juno", "Kiri", "Lorcan", "Mira", "Nikolai", "Ottilie",
];

const FAMILY_NAMES = [
  "Abbott", "Baptiste", "Chen", "Donnelly", "Eriksen", "Ferreira", "Gallagher", "Hakim", "Ivanov",
  "Jelic", "Kaur", "Laurent", "Mbeki", "Nascimento", "Ortega", "Pereira", "Quereshi", "Rahman",
  "Solomon", "Tupou", "Ueda", "Vasquez", "Wong", "Yildiz", "Zielinski",
];

/** Glebe/Forest Lodge streets that are not already used above, so addresses cannot collide. */
const TURF_STREETS = [
  "Arcadia Rd", "Bay St", "Catherine St", "Derwent St", "Eglinton Rd", "Forsyth St",
  "Hordern St", "Junction Rd", "Leichhardt St", "Mansfield St", "Oxley St", "Pendrill St",
];

/** Nearby suburbs for the email-only tier — deliberately OUTSIDE the turf polygon. */
const WIDER_STREETS = [
  ["Enmore Rd", "Enmore"], ["King St", "Newtown"], ["Norton St", "Leichhardt"],
  ["Darling St", "Balmain"], ["Marrickville Rd", "Marrickville"], ["Erskineville Rd", "Erskineville"],
] as const;

/**
 * A deterministic point inside DEMO_TURF. The polygon spans lat −33.879…−33.889 and
 * lng 151.184…151.196; this walks an inset grid so no generated door lands on the boundary
 * (`insideTurf` in the spec is a strict test).
 */
function turfPoint(i: number): { lat: number; lng: number } {
  const cols = 12;
  const row = Math.floor(i / cols);
  const col = i % cols;
  return {
    lat: Number((-33.8795 - (row % 10) * 0.00095).toFixed(6)),
    lng: Number((151.1845 + col * 0.00092).toFixed(6)),
  };
}

/** How many households sit inside the turf and carry a drama-range mobile. */
const TURF_HOUSEHOLD_TARGET = 150;
/** Contacts reachable by email only — list volume past the phone range. */
const EMAIL_ONLY_TARGET = 90;

function generatedTurfHouseholds(): DemoContactSeed[] {
  const out: DemoContactSeed[] = [];
  for (let n = DEMO_HOUSEHOLDS.length; n < TURF_HOUSEHOLD_TARGET; n++) {
    const i = n - DEMO_HOUSEHOLDS.length;
    const street = TURF_STREETS[i % TURF_STREETS.length];
    // Stride the house number by the lap through the street list so each street's numbers climb.
    const number = 2 + Math.floor(i / TURF_STREETS.length) * 3 + (i % 2);
    const { lat, lng } = turfPoint(i);
    out.push({
      firstName: GIVEN_NAMES[i % GIVEN_NAMES.length],
      lastName: FAMILY_NAMES[(i * 7) % FAMILY_NAMES.length],
      address: `${number} ${street}`,
      phoneE164: demoPhone(n),
      lat,
      lng,
      canvassable: true,
    });
  }
  return out;
}

function emailOnlyContacts(): DemoContactSeed[] {
  const out: DemoContactSeed[] = [];
  for (let i = 0; i < EMAIL_ONLY_TARGET; i++) {
    const [street, suburb] = WIDER_STREETS[i % WIDER_STREETS.length];
    const firstName = GIVEN_NAMES[(i * 3) % GIVEN_NAMES.length];
    const lastName = FAMILY_NAMES[(i * 11) % FAMILY_NAMES.length];
    out.push({
      firstName,
      lastName,
      address: `${4 + i * 2} ${street}, ${suburb}`,
      // example.org is IANA-reserved (RFC 2606) — it can never route to a real inbox.
      email: `${firstName}.${lastName}${i}`.toLowerCase() + "@example.org",
      // Sits outside DEMO_TURF on purpose: these are list contacts, not doors on the walk.
      lat: Number((-33.895 - (i % 12) * 0.0011).toFixed(6)),
      lng: Number((151.17 + (i % 15) * 0.0013).toFixed(6)),
      canvassable: false,
    });
  }
  return out;
}

/** The demo households as contact seeds. Deterministic — same order, same phones, every run. */
export function buildDemoContacts(): DemoContactSeed[] {
  const core: DemoContactSeed[] = DEMO_HOUSEHOLDS.map(([firstName, lastName, address, lat, lng], i) => ({
    firstName,
    lastName,
    address,
    phoneE164: demoPhone(i),
    lat,
    lng,
    canvassable: true,
  }));
  return [...core, ...generatedTurfHouseholds(), ...emailOnlyContacts()];
}

/** Total fixture size, and the phone-bearing slice that must fit the drama range. */
export const DEMO_CONTACT_COUNT = TURF_HOUSEHOLD_TARGET + EMAIL_ONLY_TARGET;
export const DEMO_PHONE_CONTACT_COUNT = TURF_HOUSEHOLD_TARGET;
export const DEMO_PHONE_CAPACITY = DRAMA_RANGE_END - DRAMA_RANGE_START + 1;

/**
 * How many of the turf households the demo walk list covers. Deliberately a slice, not all 150 —
 * a walk list is one volunteer's shift, and a 150-stop route reads as fake in the field capture.
 */
export const DEMO_WALK_LIST_SIZE = 42;

export const DEMO_WALK_LIST = { name: "Demo — Glebe walk list" } as const;

/**
 * Door knocks so results / QA / timeline / the dashboard tiles have data. dispositionCode values
 * match the seeded default taxonomy (engagement-defaults).
 *
 * The spread is deliberately campaign-shaped rather than uniform — roughly half not-home, a third
 * spoken-to, the rest refused/other. A uniform split makes the contact-rate tiles read as fake,
 * and the first four entries are the original fixture (indices 0-3), kept so anything addressing
 * them by position still resolves.
 */
export type DemoKnockSeed = {
  contactIndex: number;
  dispositionCode: string;
  /**
   * Age of the knock at seed time. Knocks used to land at whatever instant the seeder ran, so
   * the dashboard's "doors today" tile read 0 from the day after seeding onwards — it counts
   * `DoorKnock.createdAt >= startOfToday()`. Dating relative to run time keeps every
   * time-scoped tile alive no matter when the seed last ran.
   */
  hoursAgo: number;
};

/**
 * Knocks under this age are the "today" cohort. The seeder does not date them by subtracting
 * hours — it spreads them across the part of today that has actually elapsed, so the dashboard's
 * doors-today tile is non-zero no matter what time the seed runs. Subtracting a fixed 1-9 hours
 * would put every one of them in YESTERDAY if you seeded at 00:30.
 */
export const DEMO_KNOCK_TODAY_WINDOW_HOURS = 12;

/** Campaign-shaped rather than uniform — a flat split makes the contact-rate tiles read as fake. */
const DISPOSITION_CYCLE = [
  "not_home",
  "spoke_to_target",
  "not_home",
  "spoke_to_other",
  "not_home",
  "spoke_to_target",
  "refused",
  "not_home",
  "spoke_to_target",
  "not_home",
];

/**
 * Which of the walk list's stops have been knocked. Deliberately short of DEMO_WALK_LIST_SIZE so
 * the turf reads as a walk IN PROGRESS: the field capture's whole point is the next doors, and a
 * fully-knocked list renders "All stops done. Nice work." with every stop greyed out.
 */
const WALK_STOPS_KNOCKED = 28;
/** Doors knocked elsewhere in the turf, off this walk list. */
const OFF_LIST_KNOCKS = 62;

function buildDemoKnocks(): DemoKnockSeed[] {
  const out: DemoKnockSeed[] = [];
  // Today's doors first (0-11h) so "doors today" is never zero, then back through ~10 days.
  const hoursFor = (n: number): number => (n < 9 ? 1 + n : Math.round((n - 8) * 2.6));
  for (let n = 0; n < WALK_STOPS_KNOCKED; n++) {
    out.push({
      contactIndex: n,
      dispositionCode: DISPOSITION_CYCLE[n % DISPOSITION_CYCLE.length],
      hoursAgo: hoursFor(n),
    });
  }
  for (let i = 0; i < OFF_LIST_KNOCKS; i++) {
    const contactIndex = DEMO_WALK_LIST_SIZE + i;
    if (contactIndex >= TURF_HOUSEHOLD_TARGET) break;
    out.push({
      contactIndex,
      dispositionCode: DISPOSITION_CYCLE[(i + 3) % DISPOSITION_CYCLE.length],
      hoursAgo: 6 + Math.round(i * 3.7),
    });
  }
  return out;
}

/**
 * Door knocks so results / QA / timeline / the dashboard tiles have data. dispositionCode values
 * match the seeded default taxonomy (engagement-defaults). Indices 0-3 are the original fixture,
 * kept so anything addressing them by position still resolves.
 */
export const DEMO_KNOCKS: DemoKnockSeed[] = buildDemoKnocks();

export const DEMO_SURVEY = {
  name: "Demo — Support survey",
  questions: [
    {
      prompt: "How likely are you to support the campaign?",
      type: "single_choice" as const,
      options: [
        { value: "very", label: "Very likely", cannedReplyText: "Brilliant — thank you!", dispositionCode: "spoke_to_target", supportLevel: "STRONG_SUPPORT" as const },
        { value: "maybe", label: "Maybe", cannedReplyText: "No worries — we'll keep you posted.", dispositionCode: "spoke_to_target", supportLevel: "UNDECIDED" as const },
        { value: "no", label: "Not likely", cannedReplyText: "Thanks for your time.", dispositionCode: "refused", supportLevel: "LEAN_OPPOSE" as const },
      ],
    },
  ],
};

export const DEMO_SCRIPT = {
  name: "Demo — Door script",
  steps: [
    { bodyText: "Hi, I'm a local volunteer — do you have a moment to chat about the campaign?", orderIndex: 0 },
    { bodyText: "Brilliant — can we count on your support?", outcomeKey: "interested", orderIndex: 1 },
    { bodyText: "No worries, thanks for your time. Have a good one!", outcomeKey: "not_interested", orderIndex: 2 },
  ],
};

export const DEMO_JOURNEY = {
  name: "Demo — Not-home follow-up",
  triggerType: "disposition_set" as const,
  triggerConfig: { code: "not_home" },
  rungs: [
    { type: "wait" as const, config: { minutes: 2880 } },
    { type: "action" as const, config: { kind: "send_text" } },
  ],
};

export const DEMO_CANNED = [
  { title: "Thanks for chatting", body: "Thanks so much for your time today — we really appreciate it.", dispositionCode: "spoke_to_target" },
  { title: "Sorry we missed you", body: "Sorry we missed you at the door! We'll try again soon.", dispositionCode: "not_home" },
];

/**
 * Inbox threads. The seeder previously created NONE, which is why the shared inbox always rendered
 * "Showing 1–2 of 2" — there was nothing to list but stray messages from other tests.
 *
 * Each thread is a real exchange against a demo contact (`contactIndex` → buildDemoContacts()), with
 * `direction` ordering the messages oldest-first. `minutesAgo` is relative so the list sorts and the
 * "2h ago" style timestamps stay plausible whenever the seed runs. `unread` / `resolved` / `claimed`
 * drive the ConversationState row so the folder counts, the claim badges and the filters all have
 * something to show.
 */
export type DemoThreadSeed = {
  contactIndex: number;
  unread: number;
  resolved: boolean;
  /** Claimed by the demo organiser — exercises the "mine" folder and the owner badge. */
  claimed: boolean;
  /**
   * Defaults to SMS. ConversationState is unique on [tenantId, contactPhone, channel], so the same
   * contact can hold parallel threads on both — which is the point worth showing: one person, one
   * record, two channels, rather than two disconnected tools.
   *
   * A WHATSAPP thread also gets a ContactConsent row at OPTED_IN (see seedThreads). That is not
   * decoration: WhatsApp requires recorded opt-in, and seeding conversations without it would model
   * something the platform is not allowed to do.
   */
  channel?: "SMS" | "WHATSAPP";
  messages: Array<{ direction: "in" | "out"; body: string; minutesAgo: number }>;
};

export const DEMO_THREADS: DemoThreadSeed[] = [
  {
    contactIndex: 0,
    unread: 2,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Ada! We're building our volunteer team in Glebe and would love your help at an upcoming community action. Reply YES to join or STOP to opt out.", minutesAgo: 190 },
      { direction: "in", body: "YES — happy to help. What sort of time commitment are we talking?", minutesAgo: 168 },
      { direction: "in", body: "Also is it just doorknocking or are there phone shifts too?", minutesAgo: 166 },
    ],
  },
  {
    contactIndex: 9,
    unread: 1,
    resolved: false,
    claimed: true,
    messages: [
      { direction: "out", body: "Hi Jarrah! Are you free for a two-hour doorknock shift this Saturday morning?", minutesAgo: 320 },
      { direction: "in", body: "Saturday's no good sorry, but I could do Sunday arvo if that helps?", minutesAgo: 295 },
    ],
  },
  {
    contactIndex: 12,
    unread: 0,
    resolved: false,
    claimed: true,
    messages: [
      { direction: "out", body: "Hi Mei, thanks for signing up! Your first shift is Saturday 10am at the Glebe Point Rd meeting point.", minutesAgo: 480 },
      { direction: "in", body: "Got it, see you there. Should I bring anything?", minutesAgo: 455 },
      { direction: "out", body: "Just comfy shoes and a water bottle — we'll have clipboards and scripts ready for you.", minutesAgo: 450 },
    ],
  },
  {
    contactIndex: 16,
    unread: 3,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Priya! We're door-knocking in Bridge Rd this week — can we count on your support?", minutesAgo: 95 },
      { direction: "in", body: "Definitely. I've been meaning to ask about the housing policy though", minutesAgo: 72 },
      { direction: "in", body: "Is there somewhere I can read the full position?", minutesAgo: 70 },
      { direction: "in", body: "Sorry, one more — can I bring a friend to the Saturday shift?", minutesAgo: 66 },
    ],
  },
  {
    contactIndex: 20,
    unread: 0,
    resolved: true,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Tara, just confirming you're right for the Ferry Rd walk list on Sunday?", minutesAgo: 1450 },
      { direction: "in", body: "All confirmed, thanks!", minutesAgo: 1430 },
      { direction: "out", body: "Perfect — see you Sunday at 2pm.", minutesAgo: 1425 },
    ],
  },
  {
    contactIndex: 23,
    unread: 1,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Will! Volunteer shifts are open for next weekend — interested?", minutesAgo: 240 },
      { direction: "in", body: "What areas are you covering? I'm only free if it's close to home.", minutesAgo: 205 },
    ],
  },
  {
    contactIndex: 27,
    unread: 0,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Amara, thanks for chatting at the door today — here's the link we mentioned.", minutesAgo: 55 },
      { direction: "in", body: "Thanks, got it 👍", minutesAgo: 40 },
    ],
  },
  {
    contactIndex: 31,
    unread: 0,
    resolved: true,
    claimed: true,
    messages: [
      { direction: "out", body: "Hi Elena! Would you be up for a phone-banking shift on Thursday evening?", minutesAgo: 2900 },
      { direction: "in", body: "STOP", minutesAgo: 2880 },
    ],
  },
  {
    contactIndex: 34,
    unread: 2,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Hamish, we're short a few volunteers for the Lyndhurst St blocks — any chance you're free?", minutesAgo: 130 },
      { direction: "in", body: "Possibly! Which day?", minutesAgo: 112 },
      { direction: "in", body: "And how many doors roughly?", minutesAgo: 110 },
    ],
  },
  {
    contactIndex: 38,
    unread: 0,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Maya! Reminder that the volunteer briefing is tonight at 6:30pm over Zoom.", minutesAgo: 700 },
      { direction: "in", body: "Thanks for the reminder — I'll be there.", minutesAgo: 660 },
    ],
  },
  {
    contactIndex: 41,
    unread: 1,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Orla, are you still keen to help with the Bellevue St walk list?", minutesAgo: 380 },
      { direction: "in", body: "Yes! Sorry for the slow reply, work's been hectic.", minutesAgo: 350 },
    ],
  },
  {
    contactIndex: 45,
    unread: 0,
    resolved: true,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Thandi, thanks for volunteering on Saturday — 41 doors between us, great work.", minutesAgo: 4300 },
      { direction: "in", body: "Was a good day! Count me in for the next one.", minutesAgo: 4260 },
    ],
  },

  // ── WhatsApp ────────────────────────────────────────────────────────────────
  // A second channel in the same shared inbox, deliberately including two contacts who also have
  // an SMS thread above (indexes 0 and 12) — the same person reachable two ways, on one record,
  // which is the thing a stitched-together stack cannot show.
  {
    contactIndex: 0,
    channel: "WHATSAPP",
    unread: 1,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Ada, it's Priya from the Kooyong campaign. You asked about phone shifts — we run them Tuesday and Thursday evenings, 6pm to 8pm, all from home. Would either suit?", minutesAgo: 140 },
      { direction: "in", body: "Thursday works better for me. Do I need to install anything?", minutesAgo: 115 },
    ],
  },
  {
    contactIndex: 12,
    channel: "WHATSAPP",
    unread: 0,
    resolved: false,
    claimed: true,
    messages: [
      { direction: "in", body: "Hi, a neighbour forwarded me your message about the Glebe Point Rd doorknock. Can I bring my teenager along? She's doing a civics unit at school.", minutesAgo: 260 },
      { direction: "out", body: "Absolutely — under-18s are welcome as long as they're paired with an adult. I'll put you both on Saturday's list.", minutesAgo: 240 },
      { direction: "in", body: "Perfect, thank you.", minutesAgo: 236 },
    ],
  },
  {
    contactIndex: 21,
    channel: "WHATSAPP",
    unread: 3,
    resolved: false,
    claimed: false,
    messages: [
      { direction: "out", body: "Hi Sione, thanks for signing the integrity petition. We're hosting a community forum on the federal integrity commission next Wednesday evening — would you like the details?", minutesAgo: 95 },
      { direction: "in", body: "Yes please.", minutesAgo: 74 },
      { direction: "in", body: "Is it accessible? My father uses a wheelchair and would like to come.", minutesAgo: 72 },
      { direction: "in", body: "Also is there parking nearby?", minutesAgo: 70 },
    ],
  },
  {
    contactIndex: 33,
    channel: "WHATSAPP",
    unread: 0,
    resolved: true,
    claimed: true,
    messages: [
      { direction: "in", body: "Hello — I spoke to one of your volunteers at my door on the weekend about climate policy. She said someone would send through the candidate's position paper?", minutesAgo: 2900 },
      { direction: "out", body: "Hi Marcus, yes — apologies for the delay. Sending it through now. The short version: net zero by 2035 with an interim 2030 target, and no new coal or gas approvals.", minutesAgo: 2840 },
      { direction: "in", body: "Appreciated. That's clearer than what I've had from the other candidates.", minutesAgo: 2790 },
    ],
  },
];

/**
 * WhatsApp templates, as synced from Twilio's Content API.
 *
 * Business-initiated WhatsApp conversations must open with an approved template, so the composer's
 * WhatsApp mode is unusable without at least one. Statuses are mixed on purpose: an APPROVED
 * template to send with, and one still PENDING, because "waiting on Meta approval" is the state a
 * real campaign spends much of its time in.
 */
export const DEMO_WHATSAPP_TEMPLATES: Array<{
  friendlyName: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  /** Lowercase, matching the schema's documented `approved | pending | rejected`. */
  status: string;
  variables: string[];
  bodyPreview: string;
}> = [
  {
    friendlyName: "volunteer_shift_invite",
    category: "MARKETING",
    language: "en_AU",
    status: "approved",
    variables: ["first_name", "organiser", "suburb", "day"],
    bodyPreview:
      "Hi {{1}}, it's {{2}} from the campaign. We're doorknocking in {{3}} on {{4}} — would you like to join us? Reply STOP to opt out.",
  },
  {
    friendlyName: "event_reminder",
    category: "UTILITY",
    language: "en_AU",
    status: "approved",
    variables: ["event_name", "start_time", "location"],
    bodyPreview: "Reminder: {{1}} starts at {{2}} tomorrow at {{3}}. Reply STOP to opt out.",
  },
  {
    friendlyName: "policy_followup",
    category: "MARKETING",
    language: "en_AU",
    // Left pending on purpose: waiting on Meta approval is the state a real campaign spends much
    // of its time in, and the composer should be seen handling it.
    status: "pending",
    variables: ["first_name", "topic"],
    bodyPreview: "Hi {{1}}, following up on your question about {{2}}. Here's where the candidate stands.",
  },
];

/**
 * A deterministic, obviously-fake Twilio Content SID.
 *
 * `contentSid` is globally @unique, so a fixed literal would let the first tenant seeded on a
 * database claim it and every later tenant collide — the same trap the thread sid fell into.
 * Keyed on the tenant, so each workspace gets its own.
 */
export const demoContentSid = (tenantId: string, index: number): string =>
  `HXdemo${tenantId.slice(-24)}${String(index).padStart(2, "0")}`;

// ── Surfaces that previously photographed empty ───────────────────────────────
// Everything below exists because a dashboard card or a nav destination rendered its
// zero-state in the marketing captures: "No searches yet.", "0 opted out", "1 audiences",
// an empty calendar. Each is dated relative to run time for the same reason the knocks are.

/** Saved searches (AudienceSegment). Definitions use the @uprise/segmentation v2 envelope. */
export type DemoSearchSeed = {
  name: string;
  /** Leaves from the closed Condition union — see packages/segmentation condition.types.ts. */
  conditions: Array<Record<string, unknown>>;
};

export const DEMO_SEARCHES: DemoSearchSeed[] = [
  {
    name: "Glebe — spoke to target",
    conditions: [
      { type: "contact.locality", op: "in", values: ["Glebe"] },
      { type: "canvass.dispositionCode", op: "in", values: ["spoke_to_target"] },
    ],
  },
  {
    name: "Undecided — follow up",
    conditions: [{ type: "canvass.dispositionCode", op: "in", values: ["spoke_to_other", "not_home"] }],
  },
  {
    name: "Active in the last 30 days",
    conditions: [{ type: "activity.lastActiveWithin", op: "within", days: 30 }],
  },
];

/**
 * Opt-outs, so the compliance card is not a flat zero.
 *
 * These point at real seeded households rather than spare numbers, because that is what an
 * opt-out actually is — someone on your list who replied STOP. It also means the compliance
 * surface shows names and numbers consistent with the rest of the fixture instead of orphans.
 */
export const DEMO_SUPPRESSIONS: Array<{ contactIndex: number; reason: string; source: string }> = [
  { contactIndex: 137, reason: "Replied STOP", source: DEMO_TAG },
  { contactIndex: 121, reason: "Replied STOP", source: DEMO_TAG },
  { contactIndex: 108, reason: "Asked at the door", source: DEMO_TAG },
  { contactIndex: 96, reason: "Replied UNSUBSCRIBE", source: DEMO_TAG },
  { contactIndex: 83, reason: "Requested removal by email", source: DEMO_TAG },
  { contactIndex: 71, reason: "Replied STOP", source: DEMO_TAG },
];

/** Calendar entries. Negative daysFromNow is in the past, so the calendar has history and future. */
export const DEMO_EVENTS: Array<{
  title: string;
  description: string;
  category: string;
  location: string;
  daysFromNow: number;
  startHour: number;
  durationHours: number;
  capacity: number | null;
  published: boolean;
  goingCount: number;
}> = [
  { title: "Glebe doorknock — Saturday morning", description: "Meet at the Glebe Point Rd shops. Turf, scripts and clipboards provided.", category: "Canvass", location: "Glebe Point Rd shops", daysFromNow: 3, startHour: 9, durationHours: 3, capacity: 24, published: true, goingCount: 11 },
  { title: "Volunteer induction", description: "An hour on the doorstep conversation, the app, and staying safe on a shift.", category: "Training", location: "Uprise Labs office", daysFromNow: 6, startHour: 18, durationHours: 1, capacity: 30, published: true, goingCount: 17 },
  { title: "Phone bank — undecided voters", description: "Calling everyone we marked undecided at the door.", category: "Phone bank", location: "Online", daysFromNow: 9, startHour: 17, durationHours: 2, capacity: 15, published: true, goingCount: 6 },
  { title: "Community BBQ — Bicentennial Park", description: "Low-key listening event. Bring the banner and the sign-up clipboard.", category: "Community", location: "Bicentennial Park, Glebe", daysFromNow: 14, startHour: 11, durationHours: 4, capacity: null, published: true, goingCount: 38 },
  { title: "Campaign planning", description: "Where we are against the door target, and what the next fortnight looks like.", category: "Meeting", location: "Uprise Labs office", daysFromNow: 21, startHour: 18, durationHours: 2, capacity: 12, published: false, goingCount: 0 },
  { title: "Forest Lodge doorknock", description: "Second pass on the streets we missed.", category: "Canvass", location: "Ross St corner", daysFromNow: -4, startHour: 10, durationHours: 3, capacity: 20, published: true, goingCount: 14 },
  { title: "Street stall — Glebe Markets", description: "Petition and volunteer sign-ups.", category: "Community", location: "Glebe Public School", daysFromNow: -11, startHour: 10, durationHours: 5, capacity: null, published: true, goingCount: 22 },
];

/** Canvass shifts, so the shifts board and the calendar's shift layer are populated. */
export const DEMO_SHIFTS: Array<{
  name: string;
  type: "CANVASS" | "POLLING_BOOTH" | "EVENT" | "GENERAL";
  location: string;
  daysFromNow: number;
  startHour: number;
  durationHours: number;
  capacity: number;
}> = [
  { name: "Saturday AM — Glebe blocks", type: "CANVASS", location: "Glebe Point Rd shops", daysFromNow: 3, startHour: 9, durationHours: 3, capacity: 8 },
  { name: "Saturday PM — Glebe blocks", type: "CANVASS", location: "Glebe Point Rd shops", daysFromNow: 3, startHour: 13, durationHours: 3, capacity: 8 },
  { name: "Sunday AM — Forest Lodge", type: "CANVASS", location: "Ross St corner", daysFromNow: 4, startHour: 10, durationHours: 3, capacity: 6 },
  { name: "Weeknight phone bank", type: "GENERAL", location: "Online", daysFromNow: 9, startHour: 17, durationHours: 2, capacity: 15 },
  { name: "Induction session", type: "EVENT", location: "Uprise Labs office", daysFromNow: 6, startHour: 18, durationHours: 1, capacity: 30 },
  { name: "Last Saturday — Glebe blocks", type: "CANVASS", location: "Glebe Point Rd shops", daysFromNow: -4, startHour: 9, durationHours: 3, capacity: 8 },
];

/** Contact tags, so the audience filters and contact chips are not empty. */
export const DEMO_TAGS: Array<{ key: string; label: string; color: string; everyNth: number }> = [
  { key: "volunteer", label: "Volunteer", color: "#2563eb", everyNth: 11 },
  { key: "supporter", label: "Supporter", color: "#16a34a", everyNth: 4 },
  { key: "needs-follow-up", label: "Needs follow-up", color: "#f59e0b", everyNth: 7 },
  { key: "donor", label: "Donor", color: "#9333ea", everyNth: 17 },
];

/**
 * Extra audiences beyond the tour example. `contactStride` picks members deterministically —
 * every nth contact — so membership counts are stable across runs.
 */
export const DEMO_AUDIENCES: Array<{ name: string; contactStride: number }> = [
  { name: "Glebe households", contactStride: 2 },
  { name: "Spoke to at the door", contactStride: 5 },
  { name: "Email list — inner west", contactStride: 3 },
];

/** Sent blasts, so the texting surfaces and the messaging card have history. */
export const DEMO_BLASTS: Array<{
  title: string;
  body: string;
  audienceName: string;
  daysAgo: number;
  recipientStride: number;
}> = [
  {
    title: "Saturday doorknock — can you make it?",
    body: "Hi {{first_name}}, we're knocking Glebe on Saturday 9am. Can you join us? Reply YES and we'll send the meeting spot. Reply STOP to opt out.",
    audienceName: "Glebe households",
    daysAgo: 6,
    recipientStride: 2,
  },
  {
    title: "Thanks for Saturday",
    body: "Thanks for coming out {{first_name}} — 412 doors between us. Next one is in a fortnight. Reply STOP to opt out.",
    audienceName: "Spoke to at the door",
    daysAgo: 2,
    recipientStride: 5,
  },
];

/** Additional content, so Surveys/Scripts/Canned responses list more than one row each. */
export const DEMO_EXTRA_SURVEYS: Array<{ name: string; prompt: string; options: string[] }> = [
  { name: "Cost of living — top issue", prompt: "Which of these worries you most right now?", options: ["Rent or mortgage", "Groceries", "Energy bills", "Health costs"] },
  { name: "Volunteer availability", prompt: "When could you help out?", options: ["Weekday evenings", "Saturday", "Sunday", "Not right now"] },
];

export const DEMO_EXTRA_SCRIPTS: Array<{ name: string; steps: string[] }> = [
  {
    name: "Demo — Phone bank script",
    steps: [
      "Hi, is that {{first_name}}? I'm a volunteer with the campaign — have you got two minutes?",
      "We're asking people what matters most to them this year. What's top of your list?",
      "Thanks, that's really useful. Can we let you know when we're doorknocking nearby?",
    ],
  },
  {
    name: "Demo — Volunteer recruitment",
    steps: [
      "Hi {{first_name}}, you signed our petition a while back — thanks again.",
      "We're building a team for the Glebe doorknock. Could you spare three hours on a Saturday?",
      "Brilliant. I'll text you the details and a link to the induction.",
    ],
  },
];

export const DEMO_EXTRA_CANNED: Array<{ title: string; body: string; dispositionCode: string }> = [
  { title: "Send the shift link", body: "Here's the sign-up for Saturday: {{shift_link}}. Meeting at the Glebe Point Rd shops at 9.", dispositionCode: "spoke_to_target" },
  { title: "Not right now", body: "No worries at all {{first_name}} — thanks for hearing me out. Reply STOP if you'd rather we didn't get in touch.", dispositionCode: "refused" },
  { title: "Follow up later", body: "Thanks {{first_name}} — I'll check back after the holidays.", dispositionCode: "spoke_to_other" },
];
