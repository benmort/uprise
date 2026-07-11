// Project index and case-study detail for the Uprise Labs organisation site.
// Real work only. The `uprise` flagship is finished; Common Threads and Climate 200 are real
// engagements with specifics marked [PLACEHOLDER] for the owner to fill. The prototype's seven
// fictional US case studies (Rivera for Senate, Prop 12, GOTV Collective, …) have been removed.
// en-GB spelling; spaced en-dashes.

import type { CaseDetail, Project } from "./types";

export const PROJECTS: Project[] = [
  {
    slug: "uprise",
    name: "Uprise",
    blurb: "The organising platform for the Australian movement",
    tag: "Platform",
    year: "2026",
  },
  {
    slug: "common-threads",
    name: "Common Threads",
    blurb: "A canvassing app for the 2026 Victorian election",
    tag: "Organising",
    year: "2026",
  },
  {
    slug: "climate-200",
    name: "Climate 200",
    blurb: "Peer-to-peer calling to 800k voters",
    tag: "Campaigns",
    year: "2025",
  },
];

export const CASE_DETAILS: Record<string, CaseDetail> = {
  // Uprise Labs' own flagship – uprise.org.au, the movement's shared campaigning platform. Real.
  uprise: {
    meta: "PLATFORM · 2026 · AUSTRALIA-WIDE",
    title: "uprise.org.au: the organising platform for the Australian movement",
    heroCaption: "UPRISE — HERO SCREENSHOT",
    client: "Uprise Labs",
    services: "Product, Web, Data, Canvassing, Messaging",
    timeline: "Ongoing",
    team: "The cooperative",
    lede: "The tool we always wished existed, so we built it ourselves – a shared campaigning platform owned by the movement, not rented from a vendor.",
    body: [
      "uprise.org.au is one platform for the whole organising cycle: cut turf straight from Australia's national address universe, build and assign walk lists, run SMS and WhatsApp broadcasts, and work every reply from a shared inbox – with audiences, volunteers and multi-org networks wired through the middle.",
      "Because it's built by a worker-owned cooperative, every campaign on it owns its own data and pays no corporate markup. It's the movement's infrastructure, run for the movement.",
    ],
    results: [
      { value: "16.9M", label: "ADDRESSES MAPPED" },
      { value: "AU-WIDE", label: "EVERY STATE & TERRITORY" },
      { value: "SMS + WA", label: "TWO-WAY INBOX" },
      { value: "$0", label: "CORPORATE MARKUP" },
    ],
    gallery: ["TURF-CUTTING MAP — SCREENSHOT", "SHARED INBOX — SCREENSHOT"],
    stack: ["Next.js", "NestJS", "TypeScript", "PostGIS", "Prisma", "Twilio", "BullMQ"],
    quote: {
      text: "We were tired of renting our movement's own infrastructure from vendors who didn't share our values. So we built it – and we own it together.",
      attribution: "— UPRISE LABS",
    },
  },

  // 2026 Victorian election canvassing app. 120k doors is real. The quote is a DRAFT for Common Threads to approve.
  "common-threads": {
    meta: "ORGANISING · 2026 · VICTORIA",
    title: "Common Threads: a canvassing app for the 2026 Victorian election",
    heroCaption: "COMMON THREADS — CANVASSING APP",
    client: "Common Threads",
    services: "Canvassing app, Field data, Targeting & modelling",
    timeline: "2026 Victorian state election",
    team: "The cooperative",
    lede: "For the 2026 Victorian state election, Common Threads needed to put volunteers on the doors that mattered – not just any doors. We built the canvassing app that made it happen.",
    body: [
      "We cut turf straight from Australia's national address universe and used modelling to target the areas most worth the walk, so every volunteer shift landed where it counted. Canvassers picked up their walk lists on their phones, recorded each conversation at the door, and synced back to a shared, real-time picture of the ground game.",
      "The result was door-knocking at scale, aimed by data: volunteers knocked on more than 120,000 doors across the seats that mattered, with every shift landing where it counted.",
    ],
    results: [
      { value: "120k", label: "DOORS KNOCKED" },
      { value: "MODELLED", label: "TARGETED TURF" },
      { value: "VIC 2026", label: "STATE ELECTION" },
      { value: "MOBILE", label: "FIELD CANVASSING APP" },
    ],
    gallery: ["CANVASSING APP — WALK LIST", "TARGETING MAP — SCREENSHOT"],
    stack: ["Next.js (PWA)", "NestJS", "TypeScript", "PostGIS", "Prisma"],
    quote: {
      // DRAFT for Common Threads to approve; swap [NAME] for the real person.
      text: "We didn't just knock on more doors – we knocked on the right ones. The modelling put our volunteers where they'd make the difference, and the app made the whole programme easy to run.",
      attribution: "— LARISSA, CEO, COMMON THREADS",
    },
  },

  // Scaled peer-to-peer calling for the 2025 federal-election climate push. 800k voters is real; quote pending.
  "climate-200": {
    meta: "CAMPAIGNS · 2025 · AUSTRALIA",
    title: "Climate 200: peer-to-peer calling for the climate election",
    heroCaption: "CLIMATE 200 — PEER-TO-PEER CALLING",
    client: "Climate 200",
    services: "Peer-to-peer calling, Remote phone banks, Data",
    timeline: "Federal election campaign",
    team: "The cooperative",
    lede: "Climate 200 backs community independents pushing for stronger climate policy. We built the peer-to-peer calling that let their campaigns reach voters, person to person, at national scale.",
    body: [
      "We implemented scaled peer-to-peer calling – a dedicated progressive dialler wired into remote phone banks – so volunteers anywhere in the country could have real conversations with voters about the climate stakes of the election. An independent's campaign could stand up a phone bank and start dialling, without building the infrastructure themselves.",
      "Across the campaign, the phone banks reached up to 800,000 voters – conversations that helped independent candidates make the case for stronger climate action, one call at a time.",
    ],
    results: [
      { value: "800k", label: "VOTERS CALLED" },
      { value: "P2P", label: "PROGRESSIVE DIALLER" },
      { value: "REMOTE", label: "PHONE BANKS" },
      { value: "FEDERAL", label: "ELECTION CAMPAIGN" },
    ],
    gallery: ["PHONE BANK — DIALLER", "CALL SCRIPT — SCREENSHOT"],
    stack: ["Next.js", "NestJS", "TypeScript", "Twilio", "BullMQ"],
    quote: {
      // DRAFT for Climate 200 to approve; swap [NAME] for the real person.
      text: "Their peer-to-peer calling let volunteers anywhere in the country have hundreds of thousands of real conversations about climate – at a scale we could never have built ourselves.",
      attribution: "— GIDEON, HEAD OF POLITICS, CLIMATE 200", // [SURNAME] to confirm
    },
  },
};

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function getCaseDetail(slug: string): CaseDetail | undefined {
  return CASE_DETAILS[slug];
}
