"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput } from "@uprise/ui";
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await auth.previewInvite(token);
      if (res.ok) setPreview(res.data);
      else setLoadError(res.error);
    })();
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const displayName = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const res = await auth.acceptInvite({ token, displayName: displayName || undefined, password: password || undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
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
          <form onSubmit={accept} className="space-y-5">
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
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Joining…" : "Accept Invitation"}</Button>
          </form>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading invitation…</p>
      )}
    </div>
  );
}
