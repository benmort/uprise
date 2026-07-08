// Service index and per-service detail for the Uprise Labs organisation site.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/ –
// the six service cards are verbatim; the Fundraising Platforms detail is
// transcribed verbatim from the prototype's service-detail view and the other
// five details are patterned from it. Copy keeps the prototype's US spellings.

import type { Service, ServiceDetail } from "./types";

export const SERVICES: Service[] = [
  {
    no: "01",
    slug: "campaign-websites",
    title: "Campaign Websites",
    desc: "Fast, accessible sites that convert visitors into supporters.",
    long: "Sub-second load times, WCAG-compliant, and built to survive the traffic spike after a viral moment. Modern stacks, no template lock-in.",
    tags: ["Next.js", "Design systems", "Accessibility", "CMS"],
  },
  {
    no: "02",
    slug: "fundraising-platforms",
    title: "Fundraising Platforms",
    desc: "Small-dollar donation flows optimized for every dollar.",
    long: "Custom donation experiences with one-click recurring giving, ActBlue integration, and relentless conversion optimization built in.",
    tags: ["ActBlue", "Recurring giving", "A/B testing"],
  },
  {
    no: "03",
    slug: "digital-organizing",
    title: "Digital Organizing",
    desc: "Tools that turn supporters into volunteers into voters.",
    long: "Volunteer portals, distributed phone and text banking, event RSVP, and CRM integrations that keep your list clean and activated.",
    tags: ["CRM", "SMS / Email", "Volunteer tools"],
  },
  {
    no: "04",
    slug: "data-analytics",
    title: "Data & Analytics",
    desc: "Real-time dashboards so you always know what is working.",
    long: "Live fundraising and traffic dashboards, voter targeting models, and rigorous experimentation to spend every dollar where it counts.",
    tags: ["Dashboards", "Targeting", "Experimentation"],
  },
  {
    no: "05",
    slug: "rapid-response",
    title: "Rapid Response",
    desc: "War-room support when the news cycle will not wait.",
    long: "A 24/7 on-call team that ships landing pages, statements, and fundraising asks in hours, not days — because in politics, timing is everything.",
    tags: ["24/7 on-call", "Landing pages", "Same-day"],
  },
  {
    no: "06",
    slug: "brand-identity",
    title: "Brand & Identity",
    desc: "Names, logos, and messaging that make people believe.",
    long: "Full brand systems from naming and identity to messaging frameworks — the visual and verbal language that carries a movement.",
    tags: ["Naming", "Identity", "Messaging"],
  },
];

export const SERVICE_DETAILS: Record<string, ServiceDetail> = {
  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "campaign-websites": {
    lede: "Fast, accessible campaign sites engineered to turn a visit into a supporter — and to stay standing when the whole country shows up at once.",
    heroCaption: "CAMPAIGN SITE — SCREENSHOT",
    deliverables: [
      "Marketing site design & build",
      "Design system & components",
      "CMS & editor workflows",
      "WCAG AA accessibility",
      "Sub-second performance budget",
      "Launch-day load testing",
    ],
    body: [
      "Your website is the one field office every voter walks through. A slow page, a broken layout, an inaccessible form — each one turns a supporter away before your message lands. We build campaign sites on modern stacks with no template lock-in, tuned to load in under a second on the worst phone on the worst connection.",
      "Every site ships WCAG-compliant and battle-tested for the viral moment: static-first pages served from the edge, a CMS your comms team can drive without a ticket, and load tests that simulate the spike before the news does.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your message, your audience, and your current site's leaks." },
      { no: "02", title: "Design", desc: "A site system built mobile-first, on brand, for conversion." },
      { no: "03", title: "Build", desc: "Engineered for sub-second loads and a hands-on CMS." },
      { no: "04", title: "Launch", desc: "Load-tested, monitored, and supported through election day." },
    ],
    cta: { heading: "Your site is your field office.", button: "Book a build sprint →" },
  },

  // Transcribed verbatim from the prototype's service-detail view.
  "fundraising-platforms": {
    lede: "Small-dollar donation flows engineered to protect every single dollar of intent — from the first click to the recurring confirmation.",
    heroCaption: "DONATION FLOW — SCREENSHOT",
    deliverables: [
      "Custom donation UI",
      "One-click recurring",
      "ActBlue / Stripe integration",
      "A/B testing harness",
      "Upsell & ask-string logic",
      "Receipt & compliance flows",
    ],
    body: [
      "The moment a supporter decides to give is the most fragile moment in your entire funnel. A slow page, a confusing form, a broken mobile layout — each one leaks dollars you will never win back. We treat the donation flow as the highest-stakes surface a campaign owns.",
      "We build custom donation experiences with one-click recurring giving, native ActBlue integration, saved payment methods, and relentless conversion optimization baked in. Then we test everything — button copy, ask amounts, upsell timing — because the difference between a 2% and a 3% conversion rate is an entire field program.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your current flow and find every leak." },
      { no: "02", title: "Design", desc: "A donation surface built mobile-first, for speed." },
      { no: "03", title: "Integrate", desc: "Wired into your processor and CRM cleanly." },
      { no: "04", title: "Optimize", desc: "Continuous testing through election day." },
    ],
    cta: { heading: "Stop leaking donations.", button: "Book a build sprint →" },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "digital-organizing": {
    lede: "Organizing tools that move a supporter from a sign-up form to a shift sheet — and keep your list clean and activated the whole way.",
    heroCaption: "VOLUNTEER PORTAL — SCREENSHOT",
    deliverables: [
      "Volunteer portal",
      "Event & RSVP flows",
      "Distributed phone & text banking",
      "CRM integrations",
      "List hygiene & sync",
      "Supporter journey design",
    ],
    body: [
      "Sign-up is not the finish line — it is the top of a funnel that ends with a volunteer showing up for a shift. We design every step in between: the portal, the event flows, the reminders, and the follow-up asks that turn a curious supporter into a regular.",
      "Under the hood, we wire it all into your CRM so the list stays clean without a data team: deduped records, synced tags, and phone and text banking your organizers can launch in minutes, not meetings.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your supporter journey and find where people fall out." },
      { no: "02", title: "Design", desc: "A volunteer experience built for phones, shifts, and follow-through." },
      { no: "03", title: "Integrate", desc: "Wired into your CRM with clean, two-way sync." },
      { no: "04", title: "Optimize", desc: "Continuous tuning of asks and reminders through election day." },
    ],
    cta: { heading: "Turn supporters into voters.", button: "Plan your organizing stack →" },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "data-analytics": {
    lede: "Real-time dashboards and rigorous experimentation, so every decision in the war room is made on live numbers — not last week's export.",
    heroCaption: "FINANCE DASHBOARD — SCREENSHOT",
    deliverables: [
      "Real-time fundraising dashboard",
      "Traffic & conversion analytics",
      "Voter targeting models",
      "Experimentation program",
      "Alerting & anomaly detection",
      "Warehouse & exports",
    ],
    body: [
      "Campaigns drown in vanity metrics and starve for the four numbers that actually decide a race. We build live fundraising and traffic dashboards that show your finance director exactly what is working — every email, every ask, every hour of the closing stretch.",
      "Beyond the dashboard, we bring rigor: voter targeting models, structured A/B tests, and anomaly alerts that page a human when a number moves that should not. Spend every dollar where it counts, and know why.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your data sources and the decisions they need to feed." },
      { no: "02", title: "Design", desc: "Dashboards built around the numbers that win races." },
      { no: "03", title: "Integrate", desc: "Wired into your processor, CRM, and ad platforms cleanly." },
      { no: "04", title: "Optimize", desc: "A standing experimentation program through election day." },
    ],
    cta: { heading: "Know what is working.", button: "Book a data sprint →" },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "rapid-response": {
    lede: "A 24/7 war room that puts a page live before the story breaks — statements, landing pages, and fundraising asks in hours, not days.",
    heroCaption: "RAPID-RESPONSE PAGE — SCREENSHOT",
    deliverables: [
      "24/7 war-room on-call",
      "Same-day landing pages",
      "Statement & fundraising asks",
      "Pre-approved page templates",
      "Escalation runbook",
      "Post-moment reporting",
    ],
    body: [
      "The news cycle will not wait for a two-week sprint. When the debate clip hits two million views at 10pm, the campaigns that win the moment are the ones with a page live before midnight. We build the practice that makes that routine: pre-approved templates, a publishing pipeline, and an on-call team that answers.",
      "Every engagement comes with an escalation runbook, so your comms lead knows exactly who to call and what ships in the first hour — and a post-moment report, so the next response is faster than the last.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your approval chain and everything that slows a page down." },
      { no: "02", title: "Design", desc: "Pre-approved templates ready to fill and ship in minutes." },
      { no: "03", title: "Integrate", desc: "Wired into your site, your list, and your donation flow." },
      { no: "04", title: "Optimize", desc: "Drills, on-call cover, and faster ship times every cycle." },
    ],
    cta: { heading: "The news will not wait.", button: "Put the war room on call →" },
  },

  // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
  "brand-identity": {
    lede: "Full brand systems — naming, identity, and messaging frameworks — the visual and verbal language that carries a movement.",
    heroCaption: "BRAND SYSTEM — SCREENSHOT",
    deliverables: [
      "Naming & identity",
      "Logo & visual system",
      "Messaging framework",
      "Typography & color",
      "Brand guidelines",
      "Collateral & templates",
    ],
    body: [
      "A movement's brand is the shorthand for everything it believes. We build names, logos, and messaging frameworks that make people believe — coherent from the yard sign to the donation receipt, and sturdy enough for a hundred volunteers to use without a designer in the room.",
      "Every system ships with the practical kit: guidelines, templates, and a component library wired into your site, so the brand survives contact with the campaign trail.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your story, your audience, and the field you are running in." },
      { no: "02", title: "Design", desc: "Identity and messaging developed together, not bolted on." },
      { no: "03", title: "Integrate", desc: "Rolled out across your site, collateral, and channels." },
      { no: "04", title: "Optimize", desc: "Guidelines and templates that keep the system coherent as you grow." },
    ],
    cta: { heading: "Make people believe.", button: "Start a brand sprint →" },
  },
};

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getServiceDetail(slug: string): ServiceDetail | undefined {
  return SERVICE_DETAILS[slug];
}
