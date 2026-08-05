"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@uprise/ui";
import { reportClientError } from "@/lib/report-error";
import { withReturnTo } from "@/lib/return-to";

/**
 * Route error boundary for every SSO and volunteer screen – before this existed, ANY
 * render/runtime throw white-screened the whole app with no recovery and no record.
 * That matters more here than anywhere else: a user who can't get past this app has
 * no session, so they can't reach a screen that would let them report it.
 *
 * Sits at the app root so it also covers the two route-group layouts ((sso) and
 * (volunteer)); the root layout above it is global-error.tsx's job.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the console for dev + error tooling; never swallow silently.
    console.error("[auth] error boundary", error);
    // …and persist it. Vercel retains no runtime logs, so the console is the only
    // other record and it dies with the tab.
    reportClientError("auth", error);
  }, [error]);

  // The broken screen may have been mid-flow with a destination attached (an invite
  // bounced here from the field app, say). Dropping `return_to` on the way out strands
  // the user on the admin default after they sign in, with nothing to tell them why –
  // so carry it across. `validateReturnTo` at the real redirect still gates the origin,
  // so passing it through here cannot open a redirect. Read from `window` rather than
  // useSearchParams: this boundary also catches throws from the router itself.
  const signInHref = () => {
    try {
      const returnTo = new URLSearchParams(window.location.search).get("return_to");
      return withReturnTo("/sign-in", returnTo);
    } catch {
      // Never let the recovery button be the thing that throws.
      return "/sign-in";
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-error-container text-error">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen hit an unexpected error. Nothing you entered has been lost from your
          account – try again, or start again from sign in.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => reset()}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = signInHref())}>
            Back to sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
