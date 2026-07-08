// Pricing tiers and FAQs for the Uprise Labs organisation site.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/ –
// all copy is verbatim from the prototype's pricing view. Copy keeps the
// prototype's US spellings.

import type { Faq, PricingTier } from "./types";

export const TIERS: PricingTier[] = [
  {
    name: "RAPID",
    price: "$8k",
    unit: "/ starting",
    tagline: "For a single race with a hard deadline.",
    cta: "Start here",
    features: [
      "Campaign marketing site",
      "ActBlue donation integration",
      "Mobile-first, WCAG AA",
      "2-week build sprint",
      "Launch-day support",
    ],
  },
  {
    name: "CAMPAIGN",
    price: "$25k",
    unit: "/ starting",
    tagline: "The full digital stack for a competitive cycle.",
    cta: "Most popular",
    featured: true,
    features: [
      "Everything in Rapid",
      "Custom small-dollar donation flow",
      "Volunteer & event portal",
      "Real-time finance dashboard",
      "A/B testing program",
      "Priority rapid response",
    ],
  },
  {
    name: "COALITION",
    price: "Custom",
    unit: "/ retainer",
    tagline: "For PACs, unions & multi-race operations.",
    cta: "Talk to us",
    features: [
      "Everything in Campaign",
      "Multi-site / multi-brand",
      "Dedicated engineering pod",
      "24/7 war-room on-call",
      "Data & targeting models",
      "Quarterly roadmap planning",
    ],
  },
];

export const FAQS: Faq[] = [
  {
    q: "Do you work with campaigns of any size?",
    a: "Yes — from a first-time city council run to a statewide Senate race. The Rapid tier exists precisely so small races get first-rate infrastructure.",
  },
  {
    q: "What is your turnaround?",
    a: "Rapid builds ship in two weeks. Full campaign stacks run four to eight weeks depending on scope. Rapid-response pages go live the same day.",
  },
  {
    q: "Do we own the code?",
    a: "Always. No lock-in, no black boxes. Everything we build lives in your repo on your accounts. You can walk away with all of it.",
  },
  {
    q: "Who do you work with?",
    a: "The progressive movement, exclusively — candidates, causes, PACs, unions, and coalitions on the left. It is a values screen, not a size screen.",
  },
];
