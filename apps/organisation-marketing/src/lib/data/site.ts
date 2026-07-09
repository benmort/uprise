// Site-wide content for the Uprise Labs organisation site – hero, stats,
// values, process, team, testimonials, docs nav, footer, contact and about.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/ –
// all copy is verbatim from the prototype unless noted. Copy keeps the
// prototype's US spellings.

import type { DocsGroup, ProcessStep, Stat, TeamMember, Testimonial, ValueItem } from "./types";

export const STATS: Stat[] = [
  { value: "$180M+", label: "RAISED ONLINE" },
  { value: "92%", label: "WIN RATE" },
  { value: "120+", label: "CAMPAIGNS SHIPPED" },
  { value: "14M", label: "VOTERS REACHED" },
];

export const CAPABILITIES: string[] = [
  "Campaign Websites",
  "Fundraising Platforms",
  "Voter Tools",
  "Rapid Response",
  "Data & Analytics",
  "Brand Systems",
];

export const VALUES: ValueItem[] = [
  {
    no: "01",
    title: "Mission over metrics",
    desc: "We only work with the progressive movement. If it does not move the cause forward, we do not build it.",
  },
  {
    no: "02",
    title: "Ship at the speed of politics",
    desc: "Deadlines do not move for us, so we do not miss them. Filing dates, debate nights, election days — we are ready.",
  },
  {
    no: "03",
    title: "Accessible to everyone",
    desc: "Every voter, every donor, every device. Accessibility is not a feature we add — it is how we build from line one.",
  },
  {
    no: "04",
    title: "Radically transparent",
    desc: "Open roadmaps, honest estimates, and code you own. No black boxes, no lock-in, no surprises on the invoice.",
  },
];

export const PROCESS: ProcessStep[] = [
  {
    no: "01",
    title: "Discovery",
    desc: "We learn your race, your list, your goals, and your deadlines — fast.",
  },
  {
    no: "02",
    title: "Strategy",
    desc: "A clear plan for what to build, when to ship, and how to measure a win.",
  },
  {
    no: "03",
    title: "Design & Build",
    desc: "Rapid design and engineering in tight loops, with you in the room.",
  },
  {
    no: "04",
    title: "Launch & Iterate",
    desc: "We ship, watch the data, and keep optimizing through election day.",
  },
];

// The rotating hero words – the prototype renders each with a trailing period.
export const HERO_WORDS: string[] = ["campaigns.", "movements.", "causes.", "coalitions."];

export const TEAM: TeamMember[] = [
  { name: "Maya Okonkwo", role: "FOUNDER & PRINCIPAL" },
  { name: "Dev Ramírez", role: "ENGINEERING LEAD" },
  { name: "Sana Whitfield", role: "DESIGN DIRECTOR" },
  { name: "Theo Nakamura", role: "DATA & GROWTH" },
  { name: "Priya Anand", role: "CLIENT STRATEGY" },
  { name: "Marcus Bell", role: "RAPID RESPONSE LEAD" },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Uprise didn’t build us a website. They built us a fundraising machine that ran itself while we were out knocking doors.",
    name: "J. RIVERA",
    org: "CAMPAIGN MANAGER, RIVERA FOR SENATE",
  },
  {
    quote:
      "They shipped a statement page during a live crisis in under an hour. That page raised six figures before midnight.",
    name: "A. OKAFOR",
    org: "DIGITAL DIRECTOR, CLIMATE FORWARD",
  },
  {
    quote:
      "The only vendor we’ve worked with who understands a filing deadline is not a suggestion.",
    name: "M. LINDQVIST",
    org: "EXEC DIRECTOR, HOUSING NOW",
  },
];

export const DOCS_GROUPS: DocsGroup[] = [
  { label: "GETTING STARTED", items: ["Kickoff & discovery", "Access & credentials", "The build calendar"] },
  { label: "DONATIONS", items: ["ActBlue setup", "Recurring giving", "Testing a donation"] },
  { label: "CONTENT", items: ["Editing pages", "Publishing a post", "Rapid-response pages"] },
  { label: "DATA", items: ["Reading the dashboard", "Exporting your list", "Targeting models"] },
];

export const SITEMAP: Array<{ label: string; href: string }> = [
  { label: "Work", href: "/work" },
  { label: "Services", href: "/services" },
  { label: "FAQs", href: "/faqs" },
  { label: "Dispatch", href: "/dispatch" },
  { label: "About", href: "/about" },
  { label: "Docs", href: "/docs" },
  { label: "Contact", href: "/contact" },
];

export const SOCIALS: Array<{ label: string; href: string }> = [
  { label: "Twitter / X", href: "#" },
  { label: "Bluesky", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "LinkedIn", href: "#" },
];

export const CONTACT = {
  // The prototype reads hello@upriselabs.co – deliberately corrected to the
  // .org TLD for the real site.
  email: "hello@upriselabs.org",
  phone: "+1 (202) 555-0148",
  basedIn: "WASHINGTON DC\nOAKLAND CA\n+ FULLY REMOTE",
};

export const LEGAL = {
  left: "© 2026 UPRISE LABS · A WORKER-OWNED COOPERATIVE STUDIO",
  right: "MADE WITH SOLIDARITY IN AUSTRALIA ✊",
};

export const FOOTER_BLURB =
  "The web development studio for progressive campaigns, causes, and coalitions.";

// The (01) WHO WE ARE block. The prototype renders the segment
// "exclusively with candidates, causes, and coalitions on the progressive left."
// in the accent colour – the statement is stored here as one string.
export const POSITIONING = {
  meta: ["EST. 2016", "DISTRIBUTED TEAM", "MISSION-DRIVEN", "UNION SHOP"],
  statement:
    "We're a web development studio working exclusively with candidates, causes, and coalitions on the progressive left. We know the rhythm of a campaign cycle, the stakes of a filing deadline, and how to ship software that holds up when a million people show up at once.",
};

export const ABOUT = {
  heroTitle:
    "We started Uprise because the movement deserved better tools than the ones it was renting.",
  story: [
    "In 2016, a handful of engineers and organizers got tired of watching campaigns lose donations to slow, template-locked platforms. So we built our own — and then we built them for everyone fighting for a fairer country.",
    "Today we're a distributed, unionized studio of designers, engineers, and strategists. We only work with the progressive movement, and we measure our success in wins — not billable hours.",
  ] as [string, string],
  teamMeta: "22 PEOPLE · 14 STATES",
};

// Home hero – the H1 continues into the rotating HERO_WORDS after titlePrefix.
// In the prototype the prefix breaks after "digital": "We build the digital<br>backbone of progressive".
export const HERO = {
  eyebrow: "◆ WEB STUDIO FOR THE MOVEMENT",
  titlePrefix: "We build the digital backbone of progressive",
  sub: "From first-in-the-nation ballot initiatives to Senate campaigns, we design and engineer the platforms that turn organizing energy into votes, dollars, and wins.",
};
