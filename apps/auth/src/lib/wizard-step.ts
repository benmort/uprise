"use client";

import { useCallback, useEffect, useState } from "react";

/** The query param the onboarding wizard keeps its position in. */
export const STEP_PARAM = "step";

export type GoToOptions = {
  /** Overwrite the current history entry instead of pushing a new one. */
  replace?: boolean;
};

export type WizardStepNav = {
  /** The step named in the URL, or null when the flow has not been entered. */
  step: string | null;
  goTo: (step: string | null, opts?: GoToOptions) => void;
  /** True once this component has pushed an entry, so Back stays inside the flow. */
  canGoBack: boolean;
};

/**
 * The onboarding wizard's position, held in the URL as `?step=`.
 *
 * Reads `window.location` rather than `useSearchParams`, for the same reason
 * {@link import("./use-query").useQueryParams} does: `useSearchParams` forces a Suspense
 * boundary at build time, and these pages are client-only anyway.
 *
 * Advancing pushes a history entry, so the phone's Back gesture walks back through the
 * questions instead of leaving the site, and each step is a link you can send someone.
 * Jumping backwards replaces, so Back never lands on a step the volunteer has left.
 *
 * The hook must be owned by the page, not the wizard: `pushState` fires no event, so two
 * independent copies would drift. The page holds it and passes it down.
 */
export function useWizardStep(): WizardStepNav {
  const [step, setStep] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const read = () => setStep(new URLSearchParams(window.location.search).get(STEP_PARAM));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const goTo = useCallback((next: string | null, opts?: GoToOptions) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set(STEP_PARAM, next);
    else url.searchParams.delete(STEP_PARAM);

    if (opts?.replace) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
      setCanGoBack(true);
    }
    setStep(next);
  }, []);

  return { step, goTo, canGoBack };
}
