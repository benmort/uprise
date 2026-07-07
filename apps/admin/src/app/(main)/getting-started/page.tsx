"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { Button, EmptyState, StepProgress } from "@uprise/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@uprise/field";
import { tenants } from "@uprise/api-client";
import { getSession } from "@/lib/session";
import {
  ONBOARDING_STEPS,
  deriveOnboardingSteps,
  newlyCompleted,
  type OnboardingSteps,
} from "@/lib/onboarding";

const EMPTY_STEPS: OnboardingSteps = {
  verifyEmail: false,
  orgProfile: false,
  inviteTeammate: false,
  connectAudience: false,
  firstCampaign: false,
};

export default function GettingStartedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [noPermission, setNoPermission] = useState(false);
  const [steps, setSteps] = useState<OnboardingSteps>(EMPTY_STEPS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNoPermission(false);

    const session = await getSession();
    if (!session) {
      setError(true);
      setLoading(false);
      return;
    }
    const tenantId = session.tenantId;
    const canManage = (session.role === "OWNER" || session.role === "ORGANISER") && Boolean(tenantId);
    if (!canManage || !tenantId) {
      setNoPermission(true);
      setLoading(false);
      return;
    }

    const [persistedRes, derived] = await Promise.all([
      tenants.getOnboarding(tenantId).catch(() => null),
      deriveOnboardingSteps(tenantId, session),
    ]);
    const persisted = persistedRes?.ok ? persistedRes.data.steps : EMPTY_STEPS;
    // Live derivation is the truth; OR the persisted cache so a completed step never regresses.
    const merged: OnboardingSteps = { ...EMPTY_STEPS };
    for (const s of ONBOARDING_STEPS) merged[s.key] = derived[s.key] || Boolean(persisted[s.key]);
    setSteps(merged);
    setLoading(false);

    // Persist any newly-completed steps (fire-and-forget; the server merges monotonically).
    const toPersist = newlyCompleted(derived, persisted);
    if (toPersist.length > 0) {
      const patch: Record<string, boolean> = {};
      for (const k of toPersist) patch[k] = true;
      void tenants.updateOnboarding(tenantId, { steps: patch });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completedCount = ONBOARDING_STEPS.filter((s) => steps[s.key]).length;
  const total = ONBOARDING_STEPS.length;
  const allDone = completedCount === total;

  return (
    <div className="page-stack">
      <PageHeader
        title="Getting Started"
        icon={Rocket}
        description="A few quick steps to get your workspace ready."
      />

      {loading ? (
        <SectionCard title="Your setup">
          <div className="space-y-3">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SectionCard>
      ) : error ? (
        <SectionCard title="Getting Started">
          <EmptyState
            title="Couldn't load your setup"
            description="Something went wrong resolving your session. Try again."
            ctaLabel="Retry"
            onCta={() => void load()}
          />
        </SectionCard>
      ) : noPermission ? (
        <SectionCard title="Getting Started">
          <EmptyState
            title="Organisers only"
            description="You need organiser access to set up this workspace."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Your setup"
          description={allDone ? "You're all set up." : `${completedCount} of ${total} done`}
        >
          <div className="space-y-4">
            <StepProgress current={completedCount} total={total} />
            {allDone ? (
              <EmptyState
                title="You're all set up 🎉"
                description="Your workspace is ready. Head to the dashboard to see what's happening."
                ctaLabel="Go to dashboard"
                onCta={() => router.push("/dashboard")}
              />
            ) : (
              <ul className="space-y-3">
                {ONBOARDING_STEPS.map((s) => {
                  const done = steps[s.key];
                  return (
                    <li
                      key={s.key}
                      className="flex items-start gap-3 rounded-lg border border-border p-4"
                    >
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={
                            done ? "font-semibold text-muted-foreground line-through" : "font-semibold"
                          }
                        >
                          {s.title}
                        </p>
                        <p className="text-sm text-muted-foreground">{s.blurb}</p>
                      </div>
                      {!done ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={s.href}>{s.cta}</Link>
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
