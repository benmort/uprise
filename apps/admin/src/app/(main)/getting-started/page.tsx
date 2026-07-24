"use client";

import Link from "next/link";
import { CheckCircle2, PartyPopper, Rocket, Unlock } from "lucide-react";
import { Button, EmptyState, StepProgress } from "@uprise/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StateRegion } from "@/components/shell/state-region";
import { TelephonyStatusCard } from "@/components/telephony/telephony-status-card";
import { EmailSetupCard } from "@/components/email/email-setup-card";
import { SetupFlowSection } from "@/components/setup/setup-flow-section";
import { useSetupState } from "@/components/setup/use-setup-state";
import { useDeepLinkPulse } from "@/components/setup/origin-deep-link";
import { nextStep, overallProgress, setupComplete } from "@/lib/setup/setup-state";
import { stepTitle, STEP_META } from "@/lib/setup/step-registry";

/**
 * Getting started — the role-layered setup surface. Flows come server-derived from
 * GET /tenants/:id/setup: everyone sees Self setup; owners (and super-admins) also see
 * Organisation setup + Channels. Sending on shared Uprise channels works from day one —
 * this page is about unlocking the org's OWN identity and channels.
 */
export default function GettingStartedPage() {
  const { state, session, loading, error, noPermission, refetch } = useSetupState();
  // A #numbers / #email hash (e.g. from a tracker deep link) pulses the channel card.
  useDeepLinkPulse(Boolean(state));

  const complete = state ? setupComplete(state) : false;
  const progress = state ? overallProgress(state) : { done: 0, total: 0 };
  const remaining = Math.max(0, progress.total - progress.done);
  const next = state ? nextStep(state) : null;
  const ownerView = Boolean(state?.flows.organisation.applicable);

  return (
    <div className="page-stack">
      <PageHeader
        icon={Rocket}
        title="Getting started"
        description={
          ownerView
            ? "Set up your account, your organisation, and your own channels."
            : "Your account, ready to organise."
        }
      />

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        }
      >
        {state ? (
          <div className="space-y-5">
            {complete ? (
              <EmptyState
                icon={PartyPopper}
                title="You're all set up"
                description="Everything's verified and ready. This page retires itself from the menu now."
                action={
                  <Button asChild>
                    <Link href="/dashboard">Go to dashboard</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card animate-fade-up">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground tabular-nums">
                      {progress.done} of {progress.total} steps done
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {next ? `Next: ${stepTitle(next.step.key)}` : "Only recommended touches left."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {progress.done}/{progress.total}
                    </span>
                    <StepProgress current={progress.done} total={progress.total} className="w-36" />
                    {next && STEP_META[next.step.key] ? (
                      <Button asChild size="sm">
                        <Link href={STEP_META[next.step.key].href}>Continue</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* The two-state story, made explicit: sending works TODAY on the shared
                    platform channels; finishing setup provisions the org's OWN channels. */}
                {state.flows.channels.applicable ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="flex items-start gap-2.5 rounded-xl bg-success-container/40 p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">You can send today</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          Texts, calls and email already go out on shared Uprise numbers and Uprise
                          email addresses — nothing here blocks you.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-surface-variant/60 p-3">
                      <Unlock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground tabular-nums">
                          {remaining > 0
                            ? `${remaining} ${remaining === 1 ? "step" : "steps"} from your own channels`
                            : "Your own channels are unlocked"}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          Finish these steps to provision your organisation&apos;s own phone number and
                          email outbox — texts, calls and email from YOUR identity.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Order: Identity (required) → Organisation → Account (recommended extras,
                between the org and channel cards) → Channels. */}
            <SetupFlowSection flow="identity" steps={state.flows.identity.steps} numberFrom={1} />

            {state.flows.organisation.applicable ? (
              <SetupFlowSection
                flow="organisation"
                steps={state.flows.organisation.steps}
                numberFrom={1 + state.flows.identity.steps.length}
              />
            ) : null}

            <SetupFlowSection flow="account" steps={state.flows.account.steps} />

            {state.flows.channels.applicable ? (
              <SetupFlowSection flow="channels" steps={state.flows.channels.steps}>
                <TelephonyStatusCard onboarding tenantId={session?.tenantId ?? undefined} />
                <EmailSetupCard />
              </SetupFlowSection>
            ) : null}
          </div>
        ) : (
          <EmptyState title="No workspace" description="Open this page from a workspace to see its setup." />
        )}
      </StateRegion>
    </div>
  );
}
