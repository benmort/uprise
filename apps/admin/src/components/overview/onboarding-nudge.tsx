"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, X } from "lucide-react";
import { Button, StepProgress } from "@uprise/ui";
import { tenants } from "@uprise/api-client";
import { getSession } from "@/lib/session";
import { ONBOARDING_STEPS, deriveOnboardingSteps, type OnboardingSteps } from "@/lib/onboarding";

/**
 * Dismissible getting-started nudge for the top of the dashboard. Renders nothing until
 * the state resolves, and nothing once dismissed or fully complete — so it never adds
 * chrome for a set-up workspace. Progress is derived live and cross-checked against the
 * persisted `dismissed` flag + step cache.
 */
export function OnboardingNudge() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [steps, setSteps] = useState<OnboardingSteps | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await getSession();
      const tid = session?.tenantId ?? null;
      const canManage = (session?.role === "OWNER" || session?.role === "ORGANISER") && Boolean(tid);
      if (!alive || !session || !canManage || !tid) {
        if (alive) setReady(true);
        return;
      }
      const [persistedRes, derived] = await Promise.all([
        tenants.getOnboarding(tid).catch(() => null),
        deriveOnboardingSteps(tid, session),
      ]);
      if (!alive) return;
      const dismissed = persistedRes?.ok ? persistedRes.data.dismissed : false;
      const persisted = persistedRes?.ok ? persistedRes.data.steps : null;
      const merged: OnboardingSteps = { ...derived };
      if (persisted) for (const s of ONBOARDING_STEPS) merged[s.key] = derived[s.key] || Boolean(persisted[s.key]);
      const complete = ONBOARDING_STEPS.every((s) => merged[s.key]);
      setTenantId(tid);
      setSteps(merged);
      setVisible(!dismissed && !complete);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (tenantId) void tenants.updateOnboarding(tenantId, { dismissed: true });
  };

  if (!ready || !visible || !steps) return null;

  const completedCount = ONBOARDING_STEPS.filter((s) => steps[s.key]).length;
  const total = ONBOARDING_STEPS.length;

  return (
    <div className="relative rounded-lg border border-border bg-surface/60 p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-semibold">Finish setting up your workspace</p>
            <p className="text-sm text-muted-foreground">
              {completedCount} of {total} done – a few quick steps to get the most out of Uprise.
            </p>
          </div>
          <StepProgress current={completedCount} total={total} />
          <Button asChild size="sm">
            <Link href="/getting-started">Continue setup</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
