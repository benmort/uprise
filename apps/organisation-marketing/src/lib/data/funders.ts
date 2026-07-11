// Funders page content for the Uprise Labs organisation site. Audience: democracy /
// civic-participation philanthropy (Mannifera-type funders). en-GB; spaced en-dashes.
// The dual ask: a broad case for support, and the client/partner ask.

import type { Faq, FundingUse, ValueItem } from "./types";

export const FUNDERS_HERO = {
  eyebrow: "◆ FOR FUNDERS",
  title: "Fund the infrastructure the movement builds on.",
  intro: [
    "Philanthropy backs the people doing the work – the organisers, the campaigners, the advocates building a fairer and more democratic Australia. We build the digital infrastructure they depend on to do it: the organising platforms, the peer-to-peer contact tools, the civic and electoral data.",
    "We're a worker-owned cooperative, so what your support builds stays owned by the movement – not locked inside a vendor who'll raise the rent. Fund the shared backbone, and every organisation you already support can stand on it.",
  ],
};

export const FUNDERS_THESIS = {
  label: "THE THESIS",
  heading: "The movement should own its infrastructure, not rent it.",
  body: [
    "Every campaign, community organisation and coalition runs on software – to reach people, raise funds, coordinate volunteers and make sense of the data. Almost all of it is rented from vendors who don't share the movement's values, take a corporate margin, and hold the data on the way through.",
    "We think that's backwards. The tools a democratic movement depends on should be shared, open and owned by the movement itself. That's what a worker-owned cooperative is built to do: build the infrastructure once, build it well, and put it within reach of everyone doing the work.",
  ],
};

export const FUNDERS_WHY = {
  label: "WHY PHILANTHROPY",
  heading: "The market won't fund shared infrastructure. Funders can.",
  body: [
    "You already back the organisers, and the civic-tech that helps people understand and take part in our democracy. The layer beneath them – the shared platforms and data those tools rely on – is exactly the kind of public good the market won't build: too collaborative to sell as a product, too essential to leave to a vendor.",
    "That's the gap philanthropy is made for. A grant that builds shared infrastructure doesn't reach one campaign; it reaches every organisation that stands on it, for years after the grant is spent.",
  ],
};

export const FUNDING_USES: FundingUse[] = [
  {
    label: "Build shared tools",
    desc: "Fund the development of open, reusable infrastructure – organising platforms, peer-to-peer contact, civic and electoral data – that the whole sector can use, not just one campaign.",
  },
  {
    label: "The Access Fund",
    desc: "Our flagship: raising the software licences that put our organising tools in the hands of grassroots and First Nations organisations – so they can organise on the issues in their own communities, whatever their budget.",
  },
  {
    label: "Keep it movement-owned",
    desc: "Maintain the infrastructure as a shared, worker-owned public good – no corporate markup, no lock-in, and data that stays with the movement.",
  },
];

// The co-op as a feature, framed for a funder's due diligence (governance, alignment, sustainability).
export const FUNDERS_COOP: ValueItem[] = [
  {
    no: "01",
    title: "Worker-owned & union",
    desc: "A worker-owned cooperative and union shop. The people who build the tools own the organisation and share the decisions – governance that matches the mission.",
  },
  {
    no: "02",
    title: "You own the data and code",
    desc: "Everything we build is open and owned by the organisation using it. No black boxes, no lock-in – the value your grant creates stays in the movement.",
  },
  {
    no: "03",
    title: "No corporate markup",
    desc: "We price to reach, not to profit. Every dollar goes further because there's no shareholder margin sitting on top of it.",
  },
  {
    no: "04",
    title: "Data-sovereignty-aware",
    desc: "We handle sensitive data carefully and take data sovereignty seriously – including First Nations data – so the tools respect the communities they serve.",
  },
];

export const FUNDERS_FAQS: Faq[] = [
  {
    q: "What would a grant actually fund?",
    a: "Right now our flagship is the Access Fund: raising the software licences that put our organising tools in the hands of grassroots and First Nations organisations, so they can organise on the issues in their own communities. More broadly, funding builds and maintains shared infrastructure the whole sector can use. We'll scope a specific piece of work – with clear outcomes and a budget – to whatever you're able to support.",
  },
  {
    q: "How is this different from funding a software vendor?",
    a: "We're a worker-owned cooperative, not a company with shareholders to pay. The tools are open, the data stays with the movement, and there's no corporate margin. You're funding shared infrastructure, not a product licence.",
  },
  {
    q: "Who benefits?",
    a: "The organisations already doing the work – campaigns, community organisations, unions and coalitions – and the people they reach. Fund the shared layer once and it serves many organisations, for years.",
  },
  {
    q: "Can you partner with our grantees directly?",
    a: "Yes. Many funders resource digital in their grants and point their grantees to us as a values-aligned build partner. We're happy to work either way – or both.",
  },
  {
    q: "How do you measure impact?",
    a: "Honestly, and in the terms that matter: organisations supported, people reached and contacted, and the tools shipped and shared. [PLACEHOLDER: add your real headline outcomes once confirmed.]",
  },
];

export const FUNDERS_CTA = {
  heading: "Let's build power together.",
  body: "Whether you'd fund the infrastructure, resource your grantees to build with us, or just want to talk it through – we'd love to hear from you.",
  buttons: [
    { label: "Talk to us about funding", href: "/contact" },
    { label: "See the impact", href: "/impact" },
  ],
};
