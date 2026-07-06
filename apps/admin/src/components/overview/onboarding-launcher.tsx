"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rocket, X } from "lucide-react";
import { Button, StepProgress } from "@uprise/ui";
import { tenants } from "@uprise/api-client";
import { getSession } from "@/lib/session";
import { ONBOARDING_STEPS, deriveOnboardingSteps, type OnboardingSteps } from "@/lib/onboarding";

// The onboarding surfaces that already show their own prominent onboarding UI —
// the floating launcher stays out of their way to avoid doubling up.
const SUPPRESSED_PATHS = ["/dashboard", "/getting-started"];

/**
 * Compact, dismissible "finish setting up" card that hovers bottom-right across the
 * whole admin shell (prog-style), surfacing the tenant's onboarding status wherever
 * the organiser is. Reuses the same derived + persisted status as the dashboard
 * <OnboardingNudge>; renders nothing until resolved, once complete, once dismissed,
 * for non-managers, or on the pages that own the onboarding UI already.
 */
export function OnboardingLauncher() {
  const pathname = usePathname();
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
  if (SUPPRESSED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  const completedCount = ONBOARDING_STEPS.filter((s) => steps[s.key]).length;
  const total = ONBOARDING_STEPS.length;
  const nextStep = ONBOARDING_STEPS.find((s) => !steps[s.key]);

  return (
    <div className="fixed bottom-6 right-6 z-40 w-72 max-w-[calc(100vw-3rem)] animate-in fade-in slide-in-from-bottom-2">
      <div className="relative rounded-xl border border-border bg-surface p-3.5 shadow-card">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup"
          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
            <Rocket className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="pr-4 text-sm font-semibold leading-tight">Finish setting up your workspace</p>
              <p className="text-xs text-muted-foreground">
                {completedCount} of {total} done{nextStep ? ` · Next: ${nextStep.title}` : ""}
              </p>
            </div>
            <StepProgress current={completedCount} total={total} />
            <Button asChild size="sm" className="h-7 w-full text-xs">
              <Link href="/getting-started">Continue setup</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
