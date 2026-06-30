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
  "Hi {{first_name}}! We're building our volunteer team in {{city}} and would love your help at an upcoming community action. Reply YES to join or STOP to opt out.";

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

// Eight households inside DEMO_TURF, route-orderable. Phones are obviously fake.
export function buildDemoContacts(): DemoContactSeed[] {
  const base: Array<[string, string, string, number, number]> = [
    ["Ada", "Nguyen", "12 Glebe Point Rd", -33.8805, 151.1855],
    ["Bao", "Tran", "27 Glebe Point Rd", -33.8812, 151.1868],
    ["Cleo", "Marsh", "4 Mitchell St", -33.8828, 151.1881],
    ["Dev", "Patel", "19 Mitchell St", -33.8836, 151.1894],
    ["Esra", "Yilmaz", "8 Wigram Rd", -33.8849, 151.1907],
    ["Finn", "O'Brien", "33 Wigram Rd", -33.8857, 151.1919],
    ["Grace", "Okafor", "2 Hereford St", -33.8868, 151.1872],
    ["Hugo", "Bianchi", "15 Hereford St", -33.8875, 151.1888],
  ];
  return base.map(([firstName, lastName, address, lat, lng], i) => ({
    firstName,
    lastName,
    address,
    phoneE164: `+6140000${(1000 + i).toString()}`,
    lat,
    lng,
  }));
}

export const DEMO_WALK_LIST = { name: "Demo — Glebe walk list" } as const;

// A few door knocks against the first contacts so results / QA / timeline have data.
// dispositionCode values match the seeded default taxonomy (engagement-defaults).
export const DEMO_KNOCKS: Array<{ contactIndex: number; dispositionCode: string }> = [
  { contactIndex: 0, dispositionCode: "spoke_to_target" },
  { contactIndex: 1, dispositionCode: "not_home" },
  { contactIndex: 2, dispositionCode: "spoke_to_other" },
  { contactIndex: 3, dispositionCode: "refused" },
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
