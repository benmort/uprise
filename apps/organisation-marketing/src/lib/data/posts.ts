// Dispatch (blog) posts for the Uprise Labs organisation site.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/ –
// all six card entries (tag/date/read time/title/excerpt) are verbatim, and the
// first post's body is transcribed verbatim from the prototype's post view.
// The other five bodies are patterned placeholders. Copy is converted from the prototype to Australian (en-GB) spelling.

import type { Post } from "./types";

export const POSTS: Post[] = [
  {
    slug: "one-click-recurring-donation",
    tag: "FUNDRAISING",
    date: "JUN 2026",
    readMins: 6,
    title: "The one-click recurring donation is still your biggest untapped lever",
    excerpt:
      "Most campaigns leave money on the table at the exact moment a donor is most motivated. Here is the flow we ship every time.",
    author: { name: "Benjamin Mort", role: "FOUNDER & PRINCIPAL" },
    // Body transcribed verbatim from the prototype's post view.
    body: [
      {
        type: "p",
        text: 'Every campaign obsesses over acquisition — the ad spend, the email list, the door knocks. Far fewer sweat the ten seconds between "I want to give" and "thank you for your donation." That gap is where races are quietly lost.',
      },
      {
        type: "p",
        text: "The single highest-leverage change we make on almost every engagement is the same: a genuine one-click recurring donation, offered at the exact moment intent peaks. Not a checkbox buried in a form. A first-class, thumb-friendly choice.",
      },
      { type: "h2", text: "Why the moment matters more than the ask" },
      {
        type: "p",
        text: "A donor who just watched a two-minute stump video is a different person than the one who opens your fundraising email three days later. Capture the recurring commitment while the conviction is hot, and you compound it across the entire cycle.",
      },
      {
        type: "quote",
        text: '"A one-point lift in recurring opt-in is worth more than a month of new acquisition. It just does not show up on the dashboard the same way."',
      },
      {
        type: "p",
        text: "Ship the flow, test the ask strings, and watch the recurring line — not the one-time total — because that is the number that carries you to election day.",
      },
    ],
  },
  {
    slug: "surviving-the-viral-moment",
    tag: "ENGINEERING",
    date: "MAY 2026",
    readMins: 9,
    title: "Surviving the viral moment: how we absorb a 40x traffic spike",
    excerpt:
      "When the debate clip hits 2 million views at 10pm, your donate page cannot blink. A field guide to edge caching under load.",
    author: { name: "Dev Ramírez", role: "ENGINEERING LEAD" },
    // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
    body: [
      {
        type: "p",
        text: "The viral moment is the best and worst thing that can happen to campaign infrastructure. Best, because it is the cheapest acquisition you will ever get. Worst, because it arrives without warning, at the scale of the entire news cycle, aimed squarely at your slowest page.",
      },
      {
        type: "p",
        text: "Our answer is boring on purpose: static-first pages served from the edge, a donation flow that renders without a database query, and graceful degradation for everything that is not the ask. If the dashboard slows down at 10pm, nobody notices. If the donate button does, the moment is gone.",
      },
      {
        type: "quote",
        text: '"If your donate page needs a database query to render, you have already lost the viral moment."',
      },
      {
        type: "p",
        text: "We load-test every launch at 40x projected peak, because the spike we plan for is never the one that arrives. The clip drops, the traffic lands, and the site does the least interesting thing possible: it just works.",
      },
    ],
  },
  {
    slug: "volunteer-portal-is-a-funnel",
    tag: "ORGANISING",
    date: "APR 2026",
    readMins: 5,
    title: "Your volunteer portal is a funnel — treat it like one",
    excerpt:
      "Sign-up is not the finish line. The design decisions that turn a curious supporter into a shift-showing volunteer.",
    author: { name: "Priya Anand", role: "CLIENT STRATEGY" },
    // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
    body: [
      {
        type: "p",
        text: "Campaigns celebrate the volunteer sign-up like it is the win. It is not. The win is a person standing on a doorstep three Saturdays from now — and most portals lose them somewhere in between.",
      },
      {
        type: "p",
        text: "Treat the portal like the funnel it is. Measure the drop-off at every step: sign-up to first shift booked, booked to shown, shown to returned. Each gap has a design fix, and none of them are exotic — a shorter form, a same-day text confirmation, a shift that fits around a job.",
      },
      {
        type: "quote",
        text: '"The volunteer who shows up twice is worth ten sign-ups. Design for the second shift, not the first click."',
      },
      {
        type: "p",
        text: "The campaigns that turn out their lists do the unglamorous work: reminder cadences that respect people's time, follow-up asks matched to what someone actually did, and a portal that remembers them when they come back.",
      },
    ],
  },
  {
    slug: "every-voter-every-device",
    tag: "ACCESSIBILITY",
    date: "MAR 2026",
    readMins: 7,
    title: "Every voter, every device: accessibility as a turnout strategy",
    excerpt:
      "A campaign site that fails a screen reader fails voters. Why we build to WCAG AA from line one — and what it costs when you do not.",
    author: { name: "Sana Whitfield", role: "DESIGN DIRECTOR" },
    // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
    body: [
      {
        type: "p",
        text: "One in four adults lives with a disability. If your campaign site fails a screen reader, traps keyboard focus, or buries the donate button behind a hover state, you have written off a meaningful slice of the electorate before a single ad runs.",
      },
      {
        type: "p",
        text: "We build to WCAG AA from line one — not as a compliance pass at the end, but as the default way every component ships. Semantic markup, real focus states, colour contrast that survives sunlight on a cracked phone screen.",
      },
      {
        type: "quote",
        text: '"Accessibility retrofits cost five times what building it right costs. Losing the voter costs the race."',
      },
      {
        type: "p",
        text: "The quiet payoff is that accessible sites are better for everyone: faster, clearer, and more forgiving on old devices and slow connections — which is to say, on the devices real voters actually hold.",
      },
    ],
  },
  {
    slug: "real-time-finance-dashboard",
    tag: "DATA",
    date: "FEB 2026",
    readMins: 8,
    title: "What a real-time finance dashboard actually needs to show",
    excerpt:
      "Vanity metrics lose races. The four numbers your finance director should be watching every hour of the closing stretch.",
    author: { name: "Theo Nakamura", role: "DATA & GROWTH" },
    // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
    body: [
      {
        type: "p",
        text: "Most campaign dashboards are built to impress the room: big totals, green arrows, a map. None of it tells the finance director what to do in the next hour — and the closing stretch is decided in hours.",
      },
      {
        type: "p",
        text: "We strip the dashboard to four numbers: dollars in the door today against target, recurring opt-in rate, cost per dollar raised by channel, and the burn-down to the filing deadline. Everything else is a drill-down, not a headline.",
      },
      {
        type: "quote",
        text: '"A dashboard is not a trophy case. It is a decision surface — if a number does not change what you do next, it does not belong above the fold."',
      },
      {
        type: "p",
        text: "The test we apply is simple: at 11pm on the last night of the quarter, can the finance director look at one screen and know whether to send the extra email? If the answer is anything but yes, the dashboard is not done.",
      },
    ],
  },
  {
    slug: "rapid-response-practice",
    tag: "STRATEGY",
    date: "JAN 2026",
    readMins: 4,
    title: "Ship in hours, not days: building a rapid-response practice",
    excerpt:
      "The news cycle will not wait for your two-week sprint. How we structure an on-call team that can put a page live before the story breaks.",
    author: { name: "Marcus Bell", role: "RAPID RESPONSE LEAD" },
    // Placeholder detail patterned from the prototype's exemplar – replace in the content pass.
    body: [
      {
        type: "p",
        text: "Rapid response is not a heroic all-nighter. It is a practice: templates approved before the crisis, a publishing pipeline with no meetings in it, and a rota that means someone competent is always awake.",
      },
      {
        type: "p",
        text: "The template library does most of the work. Statement page, petition, fundraising ask — each one pre-approved by comms and legal, so the on-call engineer is filling in fields at midnight, not seeking sign-off.",
      },
      {
        type: "quote",
        text: '"The statement page that ships in the first hour raises more than the perfect one that ships tomorrow."',
      },
      {
        type: "p",
        text: "Then you drill. Run the fire drill in week one, time it, and cut the slowest step. Every real moment after that gets a post-mortem, and every post-mortem makes the next response faster.",
      },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
