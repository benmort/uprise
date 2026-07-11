// Service index and per-service detail for the Uprise Labs organisation site.
// en-GB spelling; spaced en-dashes; polished, plain-spoken voice. De-Americanised
// (no ActBlue). [PLACEHOLDER] Confirm this list is what you actually offer, and the
// two `hidden` services (rapid-response, brand-identity) – flip `hidden` to show them.

import type { Service, ServiceDetail } from "./types";

export const SERVICES: Service[] = [
  {
    no: "01",
    slug: "campaign-websites",
    title: "Campaign Websites",
    desc: "Fast, accessible sites that turn visitors into supporters.",
    long: "Sub-second load times, built to WCAG standards, and sturdy enough to stay up when a moment goes big. Modern stacks, no template lock-in.",
    tags: ["Next.js", "Design systems", "Accessibility", "CMS"],
  },
  {
    no: "02",
    slug: "fundraising-platforms",
    title: "Fundraising Platforms",
    desc: "Donation flows that protect every dollar of intent.",
    long: "Custom donation experiences with one-click recurring giving, clean payment integration, and steady conversion work built in.",
    tags: ["Payments", "Recurring giving", "A/B testing"],
  },
  {
    no: "03",
    slug: "digital-organising",
    title: "Digital Organising",
    desc: "Tools that move supporters to volunteers to action.",
    long: "Volunteer portals, peer-to-peer contact, event RSVPs, and CRM integrations that keep your data clean and your people activated.",
    tags: ["CRM", "Peer-to-peer", "Volunteer tools"],
  },
  {
    no: "04",
    slug: "data-analytics",
    title: "Data & Analytics",
    desc: "Live dashboards, so you always know what's working.",
    long: "Real-time fundraising and traffic dashboards, targeting, and honest experimentation to put every dollar where it counts.",
    tags: ["Dashboards", "Targeting", "Experimentation"],
  },
  {
    no: "05",
    slug: "rapid-response",
    title: "Rapid Response",
    desc: "Support for the moments that can't wait for a sprint.",
    long: "An on-call team that ships landing pages, statements and asks in hours, not days – because in politics, timing is everything.",
    tags: ["On-call", "Landing pages", "Same-day"],
    hidden: true,
  },
  {
    no: "06",
    slug: "brand-identity",
    title: "Brand & Identity",
    desc: "Names, logos and messaging that make people believe.",
    long: "Full brand systems, from naming and identity to messaging frameworks – the visual and verbal language that carries a movement.",
    tags: ["Naming", "Identity", "Messaging"],
    hidden: true,
  },
];

/** The services shown on the site – the catalogue minus anything flagged `hidden`.
 *  Every listing, nav, and the detail route's static params use this; `SERVICES`
 *  (the full catalogue) stays intact so hiding is a one-line, reversible flag. */
export const VISIBLE_SERVICES: Service[] = SERVICES.filter((s) => !s.hidden);

export const SERVICE_DETAILS: Record<string, ServiceDetail> = {
  "campaign-websites": {
    lede: "Fast, accessible campaign sites built to turn a visit into a supporter – and to stay standing when everyone shows up at once.",
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
      "Your website is the one front door every supporter walks through. A slow page, a broken layout or an inaccessible form turns people away before your message lands. We build on modern stacks with no template lock-in, tuned to load in under a second on a cheap phone and a bad connection.",
      "Every site ships to WCAG standards and holds up under a spike – static-first pages served from the edge, a CMS your comms team can drive without a ticket, and load tests that simulate the surge before the news does.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your message, your audience and where your current site loses people." },
      { no: "02", title: "Design", desc: "A site system built mobile-first, on brand, for conversion." },
      { no: "03", title: "Build", desc: "Engineered for sub-second loads and a CMS you can actually use." },
      { no: "04", title: "Launch", desc: "Load-tested, monitored and supported through the closing stretch." },
    ],
    cta: { heading: "Your site is your front door.", button: "Start a build →" },
  },

  "fundraising-platforms": {
    lede: "Donation flows built to protect every dollar of intent – from the first click to the recurring confirmation.",
    heroCaption: "DONATION FLOW — SCREENSHOT",
    deliverables: [
      "Custom donation UI",
      "One-click recurring",
      "Payment & processor integration",
      "A/B testing harness",
      "Upsell & ask-string logic",
      "Receipt & compliance flows",
    ],
    body: [
      "The moment someone decides to give is the most fragile point in your whole funnel. A slow page, a confusing form or a broken mobile layout leaks dollars you'll never win back. We treat the donation flow as the highest-stakes surface a campaign owns.",
      "We build custom donation experiences with one-click recurring giving, clean payment integration, saved payment methods and steady conversion work. Then we test the details – button copy, ask amounts, upsell timing – because the gap between a 2% and a 3% conversion rate can be an entire field programme.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your current flow and find every leak." },
      { no: "02", title: "Design", desc: "A donation surface built mobile-first, for speed." },
      { no: "03", title: "Integrate", desc: "Wired into your processor and CRM cleanly." },
      { no: "04", title: "Optimise", desc: "Continuous testing through the closing stretch." },
    ],
    cta: { heading: "Protect every dollar of intent.", button: "Start a build →" },
  },

  "digital-organising": {
    lede: "Organising tools that move a supporter from a sign-up form to a shift – and keep your data clean and your people activated the whole way.",
    heroCaption: "VOLUNTEER PORTAL — SCREENSHOT",
    deliverables: [
      "Volunteer portal",
      "Event & RSVP flows",
      "Peer-to-peer phone & text",
      "CRM integrations",
      "Data hygiene & sync",
      "Supporter journey design",
    ],
    body: [
      "A sign-up isn't the finish line – it's the top of a journey that ends with a volunteer showing up. We design every step in between: the portal, the event flows, the reminders and the follow-up asks that turn a curious supporter into a regular.",
      "Underneath, we wire it into your CRM so your data stays clean without a data team: deduped records, synced tags, and peer-to-peer contact your organisers can launch in minutes, not meetings.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your supporter journey and find where people fall away." },
      { no: "02", title: "Design", desc: "A volunteer experience built for phones, shifts and follow-through." },
      { no: "03", title: "Integrate", desc: "Wired into your CRM with clean, two-way sync." },
      { no: "04", title: "Optimise", desc: "Continuous tuning of asks and reminders through the campaign." },
    ],
    cta: { heading: "Turn supporters into organisers.", button: "Plan your stack →" },
  },

  "data-analytics": {
    lede: "Live dashboards and honest experimentation, so decisions get made on today's numbers – not last week's export.",
    heroCaption: "DASHBOARD — SCREENSHOT",
    deliverables: [
      "Real-time fundraising dashboard",
      "Traffic & conversion analytics",
      "Targeting models",
      "Experimentation programme",
      "Alerting & anomaly detection",
      "Warehouse & exports",
    ],
    body: [
      "Campaigns drown in vanity metrics and starve for the few numbers that actually decide the race. We build live fundraising and traffic dashboards that show your team exactly what's working – every email, every ask, every hour of the closing stretch.",
      "Beyond the dashboard, we bring rigour: targeting models, structured A/B tests, and alerts that page a human when a number moves that shouldn't. Put every dollar where it counts, and know why.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your data sources and the decisions they need to feed." },
      { no: "02", title: "Design", desc: "Dashboards built around the numbers that win." },
      { no: "03", title: "Integrate", desc: "Wired into your processor, CRM and ad platforms cleanly." },
      { no: "04", title: "Optimise", desc: "A standing experimentation programme through the campaign." },
    ],
    cta: { heading: "Decisions on live numbers.", button: "Start a data sprint →" },
  },

  "rapid-response": {
    lede: "An on-call team that puts a page live before the story cools – statements, landing pages and asks in hours, not days.",
    heroCaption: "RAPID-RESPONSE PAGE — SCREENSHOT",
    deliverables: [
      "On-call cover",
      "Same-day landing pages",
      "Statement & fundraising asks",
      "Pre-approved page templates",
      "Escalation runbook",
      "Post-moment reporting",
    ],
    body: [
      "The news cycle won't wait for a two-week sprint. When a clip hits a million views at 10pm, the campaigns that win the moment are the ones with a page live before midnight. We build the practice that makes that routine: pre-approved templates, a publishing pipeline and a team that answers.",
      "Every engagement comes with an escalation runbook, so your comms lead knows exactly who to call and what ships in the first hour – and a short post-moment write-up, so the next response is faster than the last.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your approval chain and everything that slows a page down." },
      { no: "02", title: "Design", desc: "Pre-approved templates ready to fill and ship in minutes." },
      { no: "03", title: "Integrate", desc: "Wired into your site, your list and your donation flow." },
      { no: "04", title: "Optimise", desc: "Drills, on-call cover and faster ship times every cycle." },
    ],
    cta: { heading: "When the moment can't wait.", button: "Put us on call →" },
  },

  "brand-identity": {
    lede: "Full brand systems – naming, identity and messaging – the visual and verbal language that carries a movement.",
    heroCaption: "BRAND SYSTEM — SCREENSHOT",
    deliverables: [
      "Naming & identity",
      "Logo & visual system",
      "Messaging framework",
      "Typography & colour",
      "Brand guidelines",
      "Collateral & templates",
    ],
    body: [
      "A movement's brand is shorthand for everything it believes. We build names, logos and messaging that make people believe – coherent from the corflute to the donation receipt, and sturdy enough for a hundred volunteers to use without a designer in the room.",
      "Every system ships with the practical kit: guidelines, templates and a component library wired into your site, so the brand survives contact with the campaign trail.",
    ],
    steps: [
      { no: "01", title: "Audit", desc: "We map your story, your audience and the field you're running in." },
      { no: "02", title: "Design", desc: "Identity and messaging developed together, not bolted on." },
      { no: "03", title: "Integrate", desc: "Rolled out across your site, collateral and channels." },
      { no: "04", title: "Optimise", desc: "Guidelines and templates that keep the system coherent as you grow." },
    ],
    cta: { heading: "The language that carries a movement.", button: "Start a brand sprint →" },
  },
};

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getServiceDetail(slug: string): ServiceDetail | undefined {
  return SERVICE_DETAILS[slug];
}
