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
  phoneE164: string;
  lat: number;
  lng: number;
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

/** The demo households as contact seeds. Deterministic — same order, same phones, every run. */
export function buildDemoContacts(): DemoContactSeed[] {
  return DEMO_HOUSEHOLDS.map(([firstName, lastName, address, lat, lng], i) => ({
    firstName,
    lastName,
    address,
    phoneE164: demoPhone(i),
    lat,
    lng,
  }));
}

/** How many drama-range numbers the fixture consumes — guards against silently overflowing it. */
export const DEMO_CONTACT_COUNT = DEMO_HOUSEHOLDS.length;
export const DEMO_PHONE_CAPACITY = DRAMA_RANGE_END - DRAMA_RANGE_START + 1;

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
export const DEMO_KNOCKS: Array<{ contactIndex: number; dispositionCode: string }> = [
  { contactIndex: 0, dispositionCode: "spoke_to_target" },
  { contactIndex: 1, dispositionCode: "not_home" },
  { contactIndex: 2, dispositionCode: "spoke_to_other" },
  { contactIndex: 3, dispositionCode: "refused" },
  { contactIndex: 4, dispositionCode: "not_home" },
  { contactIndex: 5, dispositionCode: "spoke_to_target" },
  { contactIndex: 6, dispositionCode: "not_home" },
  { contactIndex: 7, dispositionCode: "spoke_to_target" },
  { contactIndex: 8, dispositionCode: "not_home" },
  { contactIndex: 9, dispositionCode: "spoke_to_target" },
  { contactIndex: 10, dispositionCode: "not_home" },
  { contactIndex: 11, dispositionCode: "spoke_to_other" },
  { contactIndex: 12, dispositionCode: "not_home" },
  { contactIndex: 13, dispositionCode: "spoke_to_target" },
  { contactIndex: 14, dispositionCode: "refused" },
  { contactIndex: 15, dispositionCode: "not_home" },
  { contactIndex: 16, dispositionCode: "spoke_to_target" },
  { contactIndex: 17, dispositionCode: "not_home" },
  { contactIndex: 18, dispositionCode: "spoke_to_target" },
  { contactIndex: 19, dispositionCode: "not_home" },
  { contactIndex: 20, dispositionCode: "spoke_to_other" },
  { contactIndex: 21, dispositionCode: "spoke_to_target" },
  { contactIndex: 22, dispositionCode: "not_home" },
  { contactIndex: 23, dispositionCode: "not_home" },
  { contactIndex: 24, dispositionCode: "spoke_to_target" },
  { contactIndex: 25, dispositionCode: "refused" },
  { contactIndex: 26, dispositionCode: "not_home" },
  { contactIndex: 27, dispositionCode: "spoke_to_target" },
  { contactIndex: 28, dispositionCode: "not_home" },
  { contactIndex: 29, dispositionCode: "spoke_to_target" },
  { contactIndex: 30, dispositionCode: "not_home" },
  { contactIndex: 31, dispositionCode: "spoke_to_other" },
];

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
];
