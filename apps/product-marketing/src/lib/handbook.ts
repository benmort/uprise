/**
 * The Uprise handbook – the user-facing docs at /docs, covering how organisers actually run
 * a campaign. Deliberately separate from the developer/architecture docs under /developers:
 * nothing here is about how the software is built.
 *
 * Markdown lives in `docs/handbook/<slug>.md` and is read at build time by the route; this
 * module is the single registry the index page, the detail route and the sidebar all read,
 * so a new page is added in exactly one place.
 */

export interface HandbookDoc {
  /** URL segment under /docs, and the markdown filename stem. */
  slug: string;
  title: string;
  description: string;
}

export interface HandbookSection {
  title: string;
  /** One-line summary of what the whole track is for, shown on the index. */
  blurb: string;
  docs: HandbookDoc[];
}

export const HANDBOOK_SECTIONS: HandbookSection[] = [
  {
    title: "Scenarios",
    blurb: "End-to-end walkthroughs of the things a campaign actually does.",
    docs: [
      {
        slug: "from-network-to-doorstep",
        title: "From network to doorstep",
        description:
          "The whole pipeline in one place – network, campaign, turf, shift, doorstep, data, follow-up – and where it leaks.",
      },
      {
        slug: "your-first-30-days",
        title: "Your first 30 days",
        description: "What to do, in what order, when the account is new and nobody has knocked a door yet.",
      },
      {
        slug: "running-a-doorknock-weekend",
        title: "Running a doorknock weekend",
        description: "Getting twenty volunteers onto the right doors with the right script, and the data back clean.",
      },
      {
        slug: "launching-an-sms-program",
        title: "Launching an SMS program",
        description: "Standing up a texting program so the first send is one you trust and the hundredth is still welcome.",
      },
      {
        slug: "building-a-branching-survey",
        title: "Building a branching survey",
        description: "An instrument that follows the conversation and still produces comparable data.",
      },
      {
        slug: "growing-a-volunteer-team",
        title: "Growing a volunteer team",
        description: "Closing the gap between the people who said yes and the people in the room on Saturday.",
      },
      {
        slug: "election-day-operations",
        title: "Election day operations",
        description: "One day, no second chances – and the fortnight of preparation that makes it calm.",
      },
    ],
  },
  {
    title: "Managing",
    blurb: "The ongoing work of keeping a campaign's people, data and obligations in order.",
    docs: [
      {
        slug: "team-roles-and-access",
        title: "Team, roles and access",
        description: "Who can see what, who can do what, and keeping both correct as the team changes shape.",
      },
      {
        slug: "audiences-and-segments",
        title: "Audiences and segments",
        description: "Building lists you trust, and the difference between an audience and a rule for finding one.",
      },
      {
        slug: "turf-and-walk-lists",
        title: "Turf and walk lists",
        description: "Sizing turf to a shift, optimising the walk, and knowing your real coverage.",
      },
      {
        slug: "compliance-and-opt-outs",
        title: "Compliance and opt-outs",
        description: "What the platform handles for you, and the judgement that is still yours.",
      },
      {
        slug: "reading-your-results",
        title: "Reading your results",
        description: "Reading a week of field data honestly, and turning it into next week's plan.",
      },
      {
        slug: "integrations-and-data",
        title: "Integrations and your data",
        description: "Where data comes from, where it goes, and the habits that keep one source of truth.",
      },
    ],
  },
];

/** Every doc, flattened – for static params and for "next/previous" style lookups. */
export function getAllHandbookDocs(): HandbookDoc[] {
  return HANDBOOK_SECTIONS.flatMap((section) => section.docs);
}

/** The doc for a URL slug, or undefined when nothing matches (the route 404s). */
export function getHandbookDoc(slug: string): HandbookDoc | undefined {
  return getAllHandbookDocs().find((doc) => doc.slug === slug);
}

/** Sidebar tree for `DocumentationLayout`, with the index page pinned at the top. */
export function handbookNavigation(): Array<{
  title: string;
  href: string;
  children: Array<{ title: string; href: string }>;
}> {
  return [
    {
      title: "Handbook",
      href: "#handbook",
      children: [{ title: "Overview", href: "/docs" }],
    },
    ...HANDBOOK_SECTIONS.map((section) => ({
      title: section.title,
      href: `#${section.title.toLowerCase()}`,
      children: section.docs.map((doc) => ({ title: doc.title, href: `/docs/${doc.slug}` })),
    })),
  ];
}
