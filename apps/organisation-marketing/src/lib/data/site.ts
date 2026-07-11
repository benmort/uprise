// Site-wide content for the Uprise Labs organisation site – hero, stats, values,
// process, team, testimonials, docs nav, footer, contact and about.
//
// VOICE GUIDE (keep new copy on-brand):
//   • Warm, plain-spoken and participatory, but polished and precise – credible to a
//     foundation program officer, not swaggering. Conviction through competence, not slogans.
//   • Keep the movement lexicon: "the movement", "worker-owned cooperative", "solidarity",
//     "no corporate markup", "own your data and code", "Let's build power".
//   • en-GB / Australian spelling (organise, colour, programme, centre, licence, -ise).
//   • Spaced en-dash " – " for the rhetorical pivot; never the em-dash character.
//   • Headlines: sentence case, may end in a full stop. Eyebrows/labels/stats: ALL-CAPS mono.
//   • First-person plural "we"; direct "you"; contractions fine.
//   • Truth only: no invented numbers, names, quotes or logos. Mark gaps as [PLACEHOLDER].

import type { DocsGroup, ProcessStep, Stat, TeamMember, Testimonial, ValueItem } from "./types";

export const STATS: Stat[] = [
  { value: "16.9M", label: "ADDRESSES MAPPED" }, // real – the platform's geo layer
  { value: "100%", label: "WORKER-OWNED" },
  { value: "$0", label: "CORPORATE MARKUP" },
  { value: "800k+", label: "VOTERS CONTACTED" }, // real – Climate 200 peer-to-peer calling
];

export const CAPABILITIES: string[] = [
  "Organising Platforms",
  "Campaign Websites",
  "Fundraising",
  "Peer-to-Peer Contact",
  "Civic & Electoral Data",
  "Data & Analytics",
];

export const VALUES: ValueItem[] = [
  {
    no: "01",
    title: "Mission over metrics",
    desc: "We work only with the progressive movement. If it doesn't move the cause forward, we don't build it.",
  },
  {
    no: "02",
    title: "Ship at the speed of politics",
    desc: "Deadlines don't move for us, so we don't miss them. Filing dates, election days, the closing stretch – we're ready.",
  },
  {
    no: "03",
    title: "Accessible to everyone",
    desc: "Every voter, every supporter, every device. Accessibility isn't a feature we bolt on at the end – it's how we build from the first line.",
  },
  {
    no: "04",
    title: "Radically transparent",
    desc: "Open roadmaps, honest estimates and code you own. No black boxes, no lock-in, no surprises on the invoice.",
  },
];

export const PROCESS: ProcessStep[] = [
  {
    no: "01",
    title: "Discovery",
    desc: "We get to know your work, your people and your goals – and the deadlines that can't move.",
  },
  {
    no: "02",
    title: "Strategy",
    desc: "A clear plan for what to build, when to ship it and how we'll know it worked.",
  },
  {
    no: "03",
    title: "Design & build",
    desc: "Design and engineering in tight loops, with you in the room the whole way.",
  },
  {
    no: "04",
    title: "Launch & iterate",
    desc: "We ship, watch what happens and keep improving – long after launch day.",
  },
];

// The rotating hero words – each renders with a trailing full stop.
export const HERO_WORDS: string[] = ["campaigns.", "organising.", "causes.", "coalitions."];

export const TEAM: TeamMember[] = [
  { name: "Benjamin Mort", role: "DIRECTOR", image: "/team/benjamin-mort.jpg" },
  // [PLACEHOLDER] Add the real team here (name + role, optional /team/<name>.jpg). The prototype's
  // fictional roster (Dev Ramírez, Sana Whitfield, Theo Nakamura, Priya Anand, Marcus Bell) was removed.
];

export const TESTIMONIALS: Testimonial[] = [
  // DRAFT quotes for the client to approve; swap [NAME] for the real person once signed off.
  {
    quote: "Uprise gave our volunteers a tool that made sense on a doorstep. We knocked on the doors that mattered, and we always knew exactly where we stood.",
    name: "Larissa",
    org: "CEO, COMMON THREADS",
  },
  {
    // [SURNAME] to confirm – Gideon, Head of Politics at Climate 200 (surname not public).
    quote: "Their peer-to-peer calling scaled with us across the campaign – hundreds of thousands of real conversations about climate, powered by ordinary volunteers.",
    name: "Gideon",
    org: "HEAD OF POLITICS, CLIMATE 200",
  },
];

export const DOCS_GROUPS: DocsGroup[] = [
  { label: "GETTING STARTED", items: ["Kickoff & discovery", "Access & credentials", "The build calendar"] },
  { label: "FUNDRAISING", items: ["Payment setup", "Recurring giving", "Testing a donation"] },
  { label: "CONTENT", items: ["Editing pages", "Publishing a post", "Rapid-response pages"] },
  { label: "DATA", items: ["Reading the dashboard", "Exporting your data", "Targeting"] },
];

export const SITEMAP: Array<{ label: string; href: string }> = [
  { label: "Work", href: "/work" },
  { label: "Services", href: "/services" },
  { label: "Funders", href: "/funders" },
  { label: "Impact", href: "/impact" },
  { label: "FAQs", href: "/faqs" },
  { label: "Dispatch", href: "/dispatch" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const SOCIALS: Array<{ label: string; href: string }> = [
  // [PLACEHOLDER] Replace "#" with real handles (or remove the ones you don't use).
  { label: "Twitter / X", href: "#" },
  { label: "Bluesky", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "LinkedIn", href: "#" },
];

export const CONTACT = {
  // The platform contact address (matches the API's PLATFORM_CONTACT_EMAIL).
  email: "contact@upriselabs.org",
  phone: "", // [PLACEHOLDER] real rapid-response number, or leave empty for email-only.
  basedIn: "SYDNEY NSW\n+ FULLY REMOTE",
};

export const LEGAL = {
  left: "© 2026 UPRISE LABS · A WORKER-OWNED COOPERATIVE STUDIO",
  right: "MADE WITH SOLIDARITY IN AUSTRALIA 🏴",
};

export const ACKNOWLEDGEMENT =
  "Uprise Labs acknowledges the Traditional Owners of the lands and waters on which we live and work, " +
  "who have cared for Country since time immemorial. We pay our respects to Elders past and present. " +
  "Sovereignty was never ceded – always was, always will be, Aboriginal land.";

export const FOOTER_BLURB =
  "A worker-owned cooperative building the digital backbone of the progressive movement.";

// The (01) WHO WE ARE block on the home page. `meta` renders as ALL-CAPS mono chips.
export const POSITIONING = {
  meta: ["EST. 2026", "WORKER-OWNED CO-OP", "MISSION-DRIVEN", "UNION SHOP"],
  statement:
    "We're a worker-owned cooperative that builds digital tools for the progressive movement – campaigns, community organisations and coalitions working for a fairer, more democratic Australia. We know the rhythm of a campaign, the weight of a deadline that won't move, and how to build software that holds up when everyone turns up at once.",
};

export const ABOUT = {
  heroTitle:
    "We started Uprise because the movement deserved better tools than the ones it was renting.",
  story: [
    "We started in 2026, tired of watching good campaigns lose donations, volunteers and momentum to slow, template-locked software – built by vendors who didn't share their values. So we built our own. Then we built it for everyone working towards a fairer Australia.",
    "Today we're a worker-owned cooperative of designers, engineers and strategists. We work only with the progressive movement, we share the work and the decisions between us, and we measure success in what our partners achieve – not in billable hours.",
  ] as [string, string],
  teamMeta: "EST. 2026 · WORKER-OWNED · AUSTRALIA-WIDE",
};

// Home hero – the H1 continues into the rotating HERO_WORDS after titlePrefix.
export const HERO = {
  eyebrow: "◆ A WORKER-OWNED STUDIO FOR THE MOVEMENT",
  titlePrefix: "We build the digital backbone of progressive",
  sub: "We're a worker-owned cooperative that designs and builds the platforms, tools and data Australian campaigns, community organisations and coalitions rely on – to reach people, raise funds and win. Built to be owned by the movement, not rented from it.",
};
