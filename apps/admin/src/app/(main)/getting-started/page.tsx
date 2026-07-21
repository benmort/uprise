"use client";

import Link from "next/link";
import { PartyPopper, Rocket } from "lucide-react";
import { Button, EmptyState, StepProgress } from "@uprise/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StateRegion } from "@/components/shell/state-region";
import { TelephonyStatusCard } from "@/components/telephony/telephony-status-card";
import { EmailSetupCard } from "@/components/email/email-setup-card";
import { SetupFlowSection } from "@/components/setup/setup-flow-section";
import { useSetupState } from "@/components/setup/use-setup-state";
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

  const complete = state ? setupComplete(state) : false;
  const progress = state ? overallProgress(state) : { done: 0, total: 0 };
  const next = state ? nextStep(state) : null;
  const ownerView = Boolean(state?.flows.organisation.applicable);

  return (
    <div className="mx-auto w-full max-w-3xl page-stack">
      <PageHeader
        icon={Rocket}
        title="Getting started"
        description={
          ownerView
            ? "Set up your account, your organisation, and your own channels. You can send on shared Uprise numbers from day one."
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
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card animate-fade-up">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    {progress.done} of {progress.total} steps done
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {next
                      ? `Next: ${stepTitle(next.step.key)}${
                          next.step.key === "businessLegal" ? " — it unlocks your own phone number." : ""
                        }`
                      : "Only recommended touches left."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StepProgress current={progress.done} total={progress.total} className="w-36" />
                  {next && STEP_META[next.step.key] ? (
                    <Button asChild size="sm">
                      <Link href={STEP_META[next.step.key].href}>Continue</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            <SetupFlowSection flow="self" steps={state.flows.self.steps} />

            {state.flows.organisation.applicable ? (
              <SetupFlowSection flow="organisation" steps={state.flows.organisation.steps} />
            ) : null}

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
