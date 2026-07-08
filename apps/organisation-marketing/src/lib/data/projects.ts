// Project index and case-study detail for the Uprise Labs organisation site.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/ –
// the Rivera for Senate case study is transcribed verbatim; the other seven
// details are patterned from it. Copy keeps the prototype's US spellings.

import type { CaseDetail, Project } from "./types";

export const PROJECTS: Project[] = [
  {
    slug: "rivera-for-senate",
    name: "Rivera for Senate",
    blurb: "A campaign platform that raised $18M",
    tag: "Campaigns",
    year: "2026",
  },
  {
    slug: "yes-on-prop-12",
    name: "Yes on Prop 12",
    blurb: "Ballot initiative hub with live vote tracking",
    tag: "Advocacy",
    year: "2025",
  },
  {
    slug: "frontline-workers-united",
    name: "Frontline Workers United",
    blurb: "Digital organizing for 240k members",
    tag: "Organizing",
    year: "2025",
  },
  {
    slug: "people-first-pac",
    name: "People First PAC",
    blurb: "Donation infrastructure at national scale",
    tag: "Fundraising",
    year: "2024",
  },
  {
    slug: "climate-forward",
    name: "Climate Forward",
    blurb: "Advocacy action network & rapid response",
    tag: "Advocacy",
    year: "2024",
  },
  {
    slug: "gotv-collective",
    name: "GOTV Collective",
    blurb: "Voter turnout toolkit used in 30 states",
    tag: "Organizing",
    year: "2023",
  },
  {
    slug: "housing-now-coalition",
    name: "Housing Now Coalition",
    blurb: "Statewide petition & pledge platform",
    tag: "Fundraising",
    year: "2023",
  },
  {
    slug: "chen-for-governor",
    name: "Chen for Governor",
    blurb: "Bilingual campaign site & volunteer portal",
    tag: "Campaigns",
    year: "2022",
  },
];

export const CASE_DETAILS: Record<string, CaseDetail> = {
  // Transcribed verbatim from the prototype's case-study view.
  "rivera-for-senate": {
    meta: "CAMPAIGNS · 2026 · US SENATE",
    title: "Rivera for Senate: a campaign platform that raised $18M",
    heroCaption: "RIVERA FOR SENATE — HERO SCREENSHOT",
    client: "Rivera for Senate",
    services: "Web, Fundraising, Data",
    timeline: "14 months",
    team: "6 people",
    lede: "A first-time statewide candidate needed to out-raise a two-term incumbent — without a corporate PAC dollar in sight.",
    body: [
      "We rebuilt the campaign's entire digital stack from scratch: a lightning-fast marketing site, a custom small-dollar donation flow with one-click recurring giving, and a real-time dashboard that let the finance team watch every fundraising email land.",
      "When the debate went viral at 10pm, the site absorbed a 40x traffic spike without dropping a single donation. By election night, grassroots donors had powered the biggest small-dollar haul in the state's history.",
    ],
    results: [
      { value: "$18M", label: "RAISED ONLINE" },
      { value: "3.2M", label: "INDIVIDUAL DONORS" },
      { value: "+41%", label: "CONVERSION LIFT" },
      { value: "0.4s", label: "MEDIAN LOAD TIME" },
    ],
    gallery: ["DONATION FLOW — SCREENSHOT", "FINANCE DASHBOARD — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "ActBlue API", "Supabase", "Vercel Edge"],
    quote: {
      text: "Uprise didn't build us a website. They built us a fundraising machine that ran itself while we were out knocking doors.",
      attribution: "— J. RIVERA, CAMPAIGN MANAGER",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "yes-on-prop-12": {
    meta: "ADVOCACY · 2025 · BALLOT INITIATIVE",
    title: "Yes on Prop 12: a ballot initiative hub with live vote tracking",
    heroCaption: "YES ON PROP 12 — HERO SCREENSHOT",
    client: "Yes on Prop 12",
    services: "Web, Advocacy, Data",
    timeline: "9 months",
    team: "4 people",
    lede: "A statewide ballot initiative needed one place to explain the measure, collect pledges, and show the count moving in real time.",
    body: [
      "We built a single campaign hub: plain-language explainers on the measure, a pledge-to-vote flow tuned for mobile, and a live results tracker wired straight to the county feeds so supporters watched the count come in together.",
      "On election night the tracker became the state's unofficial scoreboard, and the pledge list became the backbone of the final-week turnout program.",
    ],
    results: [
      { value: "58%", label: "YES VOTE" },
      { value: "310k", label: "PLEDGES TO VOTE" },
      { value: "2.4M", label: "TRACKER PAGE VIEWS" },
      { value: "0.5s", label: "MEDIAN LOAD TIME" },
    ],
    gallery: ["VOTE TRACKER — SCREENSHOT", "PLEDGE FLOW — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "Postgres", "Vercel Edge"],
    quote: {
      text: "The tracker turned a ballot measure into a spectator sport. Our volunteers refreshed it all night — and so did the press.",
      attribution: "— CAMPAIGN DIRECTOR, YES ON PROP 12",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "frontline-workers-united": {
    meta: "ORGANIZING · 2025 · NATIONAL UNION",
    title: "Frontline Workers United: digital organizing for 240k members",
    heroCaption: "FRONTLINE WORKERS UNITED — HERO SCREENSHOT",
    client: "Frontline Workers United",
    services: "Web, Organizing, CRM",
    timeline: "11 months",
    team: "5 people",
    lede: "A national union with 240k members needed organizing tools that met workers where they were — on their phones, between shifts.",
    body: [
      "We shipped a member portal with shift-friendly onboarding, distributed phone and text banking, event RSVP, and a CRM integration that kept every local's list clean and activated without a data team.",
      "Within two cycles of contract fights, the portal had become the union's default organizing surface — actions launched in minutes, not meetings.",
    ],
    results: [
      { value: "240k", label: "MEMBERS ONBOARDED" },
      { value: "38k", label: "NEW VOLUNTEER SIGN-UPS" },
      { value: "3.5x", label: "ACTION RATE LIFT" },
      { value: "52", label: "LOCALS LAUNCHED" },
    ],
    gallery: ["MEMBER PORTAL — SCREENSHOT", "TEXT BANK — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "Postgres", "Twilio"],
    quote: {
      text: "Our locals used to wait weeks for a list pull. Now a steward can launch an action from the break room.",
      attribution: "— ORGANIZING DIRECTOR, FRONTLINE WORKERS UNITED",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "people-first-pac": {
    meta: "FUNDRAISING · 2024 · NATIONAL PAC",
    title: "People First PAC: donation infrastructure at national scale",
    heroCaption: "PEOPLE FIRST PAC — HERO SCREENSHOT",
    client: "People First PAC",
    services: "Fundraising, Web, Data",
    timeline: "12 months",
    team: "5 people",
    lede: "A national PAC moving money to hundreds of races needed donation infrastructure that never blinked — on any night, for any candidate.",
    body: [
      "We built a multi-race donation platform: one checkout, hundreds of destinations, with one-click recurring giving, split-gift asks, and compliance flows baked in from the first commit.",
      "Through two peak fundraising nights the platform processed record volume without dropping a gift, and the recurring program became the PAC's steadiest revenue line.",
    ],
    results: [
      { value: "$62M", label: "PROCESSED ONLINE" },
      { value: "410", label: "RACES SUPPORTED" },
      { value: "+29%", label: "RECURRING OPT-IN LIFT" },
      { value: "99.99%", label: "CHECKOUT UPTIME" },
    ],
    gallery: ["SPLIT-GIFT CHECKOUT — SCREENSHOT", "COMPLIANCE DASHBOARD — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "ActBlue API", "Postgres", "Vercel Edge"],
    quote: {
      text: "On our biggest night of the cycle the platform did not so much as hiccup. That is the whole job, and they nailed it.",
      attribution: "— FINANCE DIRECTOR, PEOPLE FIRST PAC",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "climate-forward": {
    meta: "ADVOCACY · 2024 · ACTION NETWORK",
    title: "Climate Forward: an advocacy action network & rapid response",
    heroCaption: "CLIMATE FORWARD — HERO SCREENSHOT",
    client: "Climate Forward",
    services: "Web, Rapid Response, Advocacy",
    timeline: "10 months",
    team: "4 people",
    lede: "A national climate organization needed to turn breaking news into action — petitions, statements, and asks live before the story cooled.",
    body: [
      "We built an action network with pre-approved page templates, a same-day publishing pipeline, and an on-call rota, so a statement page could go from draft to live in under an hour.",
      "When a live crisis broke, the team shipped a statement page in under an hour — and that page raised six figures before midnight.",
    ],
    results: [
      { value: "1.8M", label: "ACTIONS TAKEN" },
      { value: "<1 HR", label: "STATEMENT TO LIVE PAGE" },
      { value: "$100k+", label: "RAISED BEFORE MIDNIGHT" },
      { value: "120k", label: "NEW SUPPORTERS" },
    ],
    gallery: ["ACTION CENTER — SCREENSHOT", "RAPID-RESPONSE PAGE — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "Supabase", "Vercel Edge"],
    quote: {
      text: "They shipped a statement page during a live crisis in under an hour. That page raised six figures before midnight.",
      attribution: "— A. OKAFOR, DIGITAL DIRECTOR",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "gotv-collective": {
    meta: "ORGANIZING · 2023 · MULTI-STATE",
    title: "GOTV Collective: a voter turnout toolkit used in 30 states",
    heroCaption: "GOTV COLLECTIVE — HERO SCREENSHOT",
    client: "GOTV Collective",
    services: "Web, Organizing, Data",
    timeline: "8 months",
    team: "5 people",
    lede: "A turnout coalition needed one toolkit any partner could deploy — polling place lookup, vote plans, and reminders — in any state, under any rules.",
    body: [
      "We built a white-label turnout toolkit: polling place lookup, vote-plan builders, and SMS reminders, all configurable per state so partners could launch without an engineering team.",
      "By election day the toolkit was live in 30 states, and the vote-plan pledges it collected drove the final-week reminder program across the whole coalition.",
    ],
    results: [
      { value: "30", label: "STATES DEPLOYED" },
      { value: "4.2M", label: "VOTERS CONTACTED" },
      { value: "620k", label: "VOTE PLANS MADE" },
      { value: "92%", label: "PARTNER RETENTION" },
    ],
    gallery: ["VOTE PLAN BUILDER — SCREENSHOT", "POLLING LOOKUP — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Postgres", "Twilio", "Vercel Edge"],
    quote: {
      text: "Thirty states, thirty rulebooks, one toolkit. Our partners launched in days instead of months.",
      attribution: "— PROGRAM LEAD, GOTV COLLECTIVE",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "housing-now-coalition": {
    meta: "FUNDRAISING · 2023 · STATEWIDE COALITION",
    title: "Housing Now Coalition: a statewide petition & pledge platform",
    heroCaption: "HOUSING NOW COALITION — HERO SCREENSHOT",
    client: "Housing Now Coalition",
    services: "Web, Fundraising, Advocacy",
    timeline: "7 months",
    team: "4 people",
    lede: "A statewide housing coalition needed to turn petition energy into pledged dollars and repeat action — on a deadline set by the legislature.",
    body: [
      "We built a petition and pledge platform that chained the two together: sign the petition, pledge to the fight, and get routed into the next action — with recurring giving offered at the moment of peak conviction.",
      "The platform carried the coalition through a full legislative session, converting one-time signers into a durable base of small-dollar sustainers across fourteen cities.",
    ],
    results: [
      { value: "310k", label: "PETITION SIGNATURES" },
      { value: "$2.1M", label: "PLEDGED TO THE FIGHT" },
      { value: "+34%", label: "PLEDGE CONVERSION" },
      { value: "14", label: "CITIES ACTIVATED" },
    ],
    gallery: ["PETITION FLOW — SCREENSHOT", "PLEDGE DASHBOARD — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "ActBlue API", "Supabase"],
    quote: {
      text: "The only vendor we've worked with who understands a filing deadline is not a suggestion.",
      attribution: "— M. LINDQVIST, EXEC DIRECTOR",
    },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "chen-for-governor": {
    meta: "CAMPAIGNS · 2022 · GOVERNOR'S RACE",
    title: "Chen for Governor: a bilingual campaign site & volunteer portal",
    heroCaption: "CHEN FOR GOVERNOR — HERO SCREENSHOT",
    client: "Chen for Governor",
    services: "Web, Organizing, Brand",
    timeline: "10 months",
    team: "4 people",
    lede: "A governor's race in a majority-bilingual state needed a campaign site and volunteer program that treated both languages as first-class.",
    body: [
      "We built the campaign site and volunteer portal bilingual from the first commit — parallel content workflows, language-aware volunteer matching, and a design system that held up in both scripts.",
      "The bilingual volunteer program became the campaign's signature: sign-ups split almost evenly across languages, and shift attendance held through the final weekend.",
    ],
    results: [
      { value: "2", label: "LANGUAGES AT PARITY" },
      { value: "18k", label: "VOLUNTEER SIGN-UPS" },
      { value: "$4.6M", label: "RAISED ONLINE" },
      { value: "0.6s", label: "MEDIAN LOAD TIME" },
    ],
    gallery: ["BILINGUAL HOME PAGE — SCREENSHOT", "VOLUNTEER PORTAL — SCREENSHOT"],
    stack: ["Next.js", "TypeScript", "Tailwind", "Postgres", "Twilio"],
    quote: {
      text: "For the first time our volunteers saw a campaign speak to them in their own language — not as an afterthought, but by design.",
      attribution: "— VOLUNTEER DIRECTOR, CHEN FOR GOVERNOR",
    },
  },
};

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function getCaseDetail(slug: string): CaseDetail | undefined {
  return CASE_DETAILS[slug];
}
