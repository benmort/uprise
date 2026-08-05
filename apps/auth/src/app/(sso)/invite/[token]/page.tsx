"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput, Spinner } from "@uprise/ui";
import { auth, type InvitePreview } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";
import { useQueryParams } from "@/lib/use-query";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ORGANISER: "Organiser",
  VOLUNTEER: "Volunteer",
};

export default function InvitePage() {
  const token = String(useParams().token ?? "");
  const returnTo = useQueryParams().get("return_to");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "blocked" = the POST never left the browser, so nothing changed server-side.
  // "timeout" = we stopped waiting and genuinely do not know whether it committed.
  // Collapsing the two is how a member who IS joined gets told their network is broken.
  const [failure, setFailure] = useState<"blocked" | "timeout" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await auth.previewInvite(token);
      if (res.ok) setPreview(res.data);
      else setLoadError(res.error);
    })();
  }, [token]);

  async function submit() {
    // Clear the previous attempt BEFORE validating: otherwise a retry with a short
    // password left the full-width transport alert up alongside the inline length
    // error – two contradicting explanations for one submit.
    setError(null);
    setFailure(null);
    // An empty password is legitimate – an invitee who already has an account signs
    // in with theirs. A half-typed one is not, and used to be swallowed by the native
    // minLength bubble instead of being said out loud.
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const displayName = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const res = await auth.acceptInvite({ token, displayName: displayName || undefined, password: password || undefined });
    setBusy(false);
    if (!res.ok) {
      if (res.timedOut) setFailure("timeout");
      else if (res.networkError) setFailure("blocked");
      else setError(res.error);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  // Sign-in reads return_to; carry the invitee's original destination across so the
  // timeout escape hatch lands them where the invitation was taking them.
  const signInHref = returnTo ? `/sign-in?return_to=${encodeURIComponent(returnTo)}` : "/sign-in";

  function accept(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  if (loadError) {
    return (
      <div className="flex w-full flex-col">
        <Alert variant="error" title="Invitation Error">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loadError} <Link className="text-primary hover:underline" href="/sign-in">Sign in</Link>
          </p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      {preview ? (
        <>
          <div className="mb-6">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
              You&apos;re invited to join {preview.tenantName}
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been invited to join <strong>{preview.tenantName}</strong> as <strong>{ROLE_LABELS[preview.role] ?? preview.role}</strong> ({preview.email}).
            </p>
          </div>
          {failure === "blocked" ? (
            <Alert variant="error" title="We couldn't reach the server" className="mb-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your invitation is still valid – the request never got through, so nothing has changed
                on your account. This is usually a dropped connection, or a browser extension, VPN or
                network filter blocking the request. Check your connection, disable any content blocker
                for this page, then try again.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={busy}
                onClick={() => void submit()}
              >
                Try again
              </Button>
            </Alert>
          ) : null}
          {/* A timeout is not a network failure: the accept may have committed server-side
              (account, membership, session, welcome email) and only the answer was lost.
              Say so, and lead with signing in – retrying a consumed invitation just fails. */}
          {failure === "timeout" ? (
            <Alert variant="warning" title="The server took too long to reply" className="mb-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                We stopped waiting, so we can't tell whether your account was created. Try signing in
                first with {preview.email} – if you're already in, you're done. If sign-in doesn't
                recognise you, come back and try again.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link className="text-sm font-medium text-primary hover:underline" href={signInHref}>
                  Go to sign in
                </Link>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void submit()}>
                  Try again
                </Button>
              </div>
            </Alert>
          ) : null}
          {/* noValidate: PasswordInput forwards minLength to a real <input>, so the browser
              blocked submit with a bubble – accept() never ran, no request was made and the
              invitation silently stayed pending. Validate in submit() instead. */}
          <form onSubmit={accept} noValidate className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="firstName">
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field label="Set a password" htmlFor="password" hint="At least 8 characters (skip if you already have an account)" error={error ?? undefined}>
              <PasswordInput id="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? (<><Spinner className="mr-2" />Joining…</>) : "Accept Invitation"}</Button>
          </form>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading invitation…</p>
      )}
    </div>
  );
}
