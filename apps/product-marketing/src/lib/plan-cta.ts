import type { PublicPlan } from "@uprise/api-client";

/**
 * What a plan's column on the pricing page offers you.
 *
 * A priced plan is self-serve: "Choose X" → sign-up. A plan with no price is quoted, and the
 * two quoted tiers are quoted for different reasons — Scale is sized per organisation, so you
 * talk to sales; Grassroots is a philanthropic licence, so you apply and we assess. Same
 * "no number on the page", different conversation, so they get different words and
 * destinations.
 *
 * Lives here rather than inline in the page so the branch is unit-testable: the pricing page
 * is a client component that fetches its tiers at runtime, and getting the Grassroots CTA
 * wrong would route applicants into a sales funnel.
 */
export type PlanCta = {
  /** Sub-heading under the price. Empty for a priced plan, which shows "per month" instead. */
  heading: string;
  /** Button label. */
  label: string;
  href: string;
};

/** True when a plan is quoted rather than listed — no price for the selected billing period. */
export function isQuoted(price: number | null | undefined): boolean {
  return price === null || price === undefined;
}

export function callToAction(
  plan: Pick<PublicPlan, "key" | "displayName">,
  quoted: boolean,
): PlanCta {
  if (!quoted) {
    return { heading: "", label: `Choose ${plan.displayName}`, href: "/sign-up" };
  }
  if (plan.key === "grassroots") {
    return { heading: "Apply with us", label: "Apply with us", href: "/apply" };
  }
  return { heading: "Talk to us", label: "Talk to us", href: "/request-demo" };
}
