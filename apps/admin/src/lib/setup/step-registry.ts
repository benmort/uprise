import type { LucideIcon } from "lucide-react";
import { Building2, Radio, ShieldCheck, UserRound } from "lucide-react";
import type { SetupStepKey } from "@uprise/api-client";

/**
 * Client-owned metadata for the server's setup step keys — titles, blurbs and where each
 * step is completed. The API deliberately sends stable keys only (no hrefs); this registry
 * is the single place the admin maps them to routes and copy.
 */
export type StepMeta = {
  title: string;
  blurb: string;
  /** Route (or in-page hash on /getting-started) where the step is completed. */
  href: string;
  cta: string;
};

export const STEP_META: Record<SetupStepKey, StepMeta> = {
  // Self setup
  verifyEmail: {
    title: "Verify your email",
    blurb: "Confirm the address you sign in with.",
    // origin + hash: the account page scrolls to and pulses the verify banner, with a back link.
    href: "/account?origin=getting-started#verify-email",
    cta: "Verify",
  },
  confirmMobile: {
    title: "Confirm your mobile",
    blurb: "A verified mobile secures account recovery.",
    // Mobile verification lives inside the 2FA card on the account page.
    href: "/account?origin=getting-started#two-factor",
    cta: "Confirm",
  },
  enableTwofa: {
    title: "Turn on two-factor authentication",
    blurb: "Protects the account that holds billing and compliance powers.",
    // origin + hash: the account page scrolls to and pulses the 2FA card, and offers a back link.
    href: "/account?origin=getting-started#two-factor",
    cta: "Enable",
  },
  completeProfile: {
    title: "Complete your profile",
    blurb: "Name and photo shown to your team.",
    // The name + photo editor is the profile page, not /account.
    href: "/profile?origin=getting-started",
    cta: "Complete",
  },
  // Organisation setup
  orgIdentity: {
    title: "Organisation profile",
    blurb: "Name, logo and brand colour.",
    href: "/settings/organisation?origin=getting-started",
    cta: "Set up",
  },
  businessLegal: {
    title: "Business & legal details",
    blurb: "Legal trading name, ABN/ACN and entity type — needed for your own phone number.",
    href: "/settings/business?origin=getting-started",
    cta: "Add details",
  },
  contacts: {
    title: "Organisation contacts",
    blurb: "A primary contact (and ideally an authorised signatory).",
    href: "/settings/contacts?origin=getting-started",
    cta: "Add contact",
  },
  address: {
    title: "Registered address",
    blurb: "Street, suburb, state and postcode.",
    href: "/settings/addresses?origin=getting-started",
    cta: "Add address",
  },
  branding: {
    title: "Branding extras",
    blurb: "Secondary colour and hero image for your public pages.",
    href: "/settings/branding?origin=getting-started",
    cta: "Add branding",
  },
  // Channels
  phoneNumber: {
    title: "Your phone number",
    blurb: "A dedicated local number for calls and texts.",
    href: "/getting-started#numbers",
    cta: "Get a number",
  },
  emailIdentity: {
    title: "Your email identity",
    blurb: "Send from your own address — the Uprise team sets this up.",
    href: "/getting-started#email",
    cta: "Request setup",
  },
};

export type SetupFlowKey = "identity" | "account" | "organisation" | "channels";

export const FLOW_META: Record<SetupFlowKey, { label: string; blurb: string; icon: LucideIcon }> = {
  identity: {
    label: "Identity setup",
    blurb: "Who you sign in as — verified email and mobile.",
    icon: UserRound,
  },
  account: {
    label: "Account setup – optional",
    blurb: "Recommended extras — two-factor, your profile and branding.",
    icon: ShieldCheck,
  },
  organisation: {
    label: "Organisation setup",
    blurb: "Who you are — brand, legal identity, and the people who sign.",
    icon: Building2,
  },
  channels: {
    label: "Your channels",
    blurb: "Text, call and email from numbers and addresses your org owns.",
    icon: Radio,
  },
};

/** Title for any key, surviving unknown keys from a newer server ("businessLegal" → "Business Legal"). */
export function stepTitle(key: string): string {
  const meta = (STEP_META as Record<string, StepMeta>)[key];
  if (meta) return meta.title;
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
