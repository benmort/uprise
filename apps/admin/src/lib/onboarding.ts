import { orgProfile, tenants, type OnboardingStep } from "@uprise/api-client";
import { getRecentBlasts, listAudiences } from "@/lib/api";

/** Display metadata for each getting-started step (order = display order). The `key`
 *  matches ONBOARDING_STEP_KEYS in @uprise/contracts / the tenants onboarding API. */
export type OnboardingStepMeta = {
  key: OnboardingStep;
  title: string;
  blurb: string;
  href: string;
  cta: string;
};

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    key: "verifyEmail",
    title: "Verify your email",
    blurb: "Confirm your address so we can reach you about your workspace.",
    href: "/account",
    cta: "Verify email",
  },
  {
    key: "orgProfile",
    title: "Set up your organisation",
    blurb: "Add your name, logo and brand colour so your messages look like you.",
    href: "/settings/organisation",
    cta: "Open settings",
  },
  {
    key: "inviteTeammate",
    title: "Invite a teammate",
    blurb: "Bring an organiser or staffer into the workspace.",
    href: "/settings/team",
    cta: "Invite",
  },
  {
    key: "connectAudience",
    title: "Connect an audience",
    blurb: "Import a list or sync from Action Network to start reaching people.",
    href: "/audience",
    cta: "Add audience",
  },
  {
    key: "firstCampaign",
    title: "Send your first campaign",
    blurb: "Draft and send a text blast to your audience.",
    href: "/channels/text",
    cta: "Create blast",
  },
];

export type OnboardingSteps = Record<OnboardingStep, boolean>;

/**
 * Derive each step's completion from real data. Best-effort: every signal is guarded, so
 * a failed/forbidden call reads as "not done" rather than throwing. `verifyEmail` comes
 * from the already-resolved session principal (no extra request).
 */
export async function deriveOnboardingSteps(
  tenantId: string,
  principal: { emailVerified?: boolean } | null,
): Promise<OnboardingSteps> {
  const steps: OnboardingSteps = {
    verifyEmail: principal?.emailVerified === true,
    orgProfile: false,
    inviteTeammate: false,
    connectAudience: false,
    firstCampaign: false,
  };

  const [profile, members, invitations, audiences, blasts] = await Promise.all([
    orgProfile.get().catch(() => null),
    tenants.listMembers(tenantId).catch(() => null),
    tenants.listInvitations(tenantId).catch(() => null),
    listAudiences({ limit: 1, offset: 0 }).catch(() => null),
    getRecentBlasts().catch(() => null),
  ]);

  if (profile?.ok) {
    const p = profile.data;
    steps.orgProfile =
      Boolean(p.name?.trim()) &&
      Boolean(p.logoBlockUrl || p.logoLandscapeUrl) &&
      Boolean(p.primaryColour);
  }
  if ((members?.ok && members.data.length > 1) || (invitations?.ok && invitations.data.length > 0)) {
    steps.inviteTeammate = true;
  }
  if (audiences?.ok && audiences.data.total > 0) steps.connectAudience = true;
  if (blasts?.ok && blasts.data.length > 0) steps.firstCampaign = true;

  return steps;
}

/** Keys that are true in `derived` but not yet persisted — the monotonic patch to send. */
export function newlyCompleted(derived: OnboardingSteps, persisted: OnboardingSteps): OnboardingStep[] {
  return (Object.keys(derived) as OnboardingStep[]).filter((k) => derived[k] && !persisted[k]);
}
