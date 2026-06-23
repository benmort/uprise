"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput } from "@yarns/ui";
import { auth, type InvitePreview } from "@yarns/api-client";
import { completeAuth } from "@/lib/session";
import { useQueryParams } from "@/lib/use-query";

export default function InvitePage() {
  const token = String(useParams().token ?? "");
  const returnTo = useQueryParams().get("return_to");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [displayName, setDisplayName] = useState("");
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
    const res = await auth.acceptInvite({ token, displayName: displayName.trim() || undefined, password: password || undefined });
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
            {loadError} <Link className="text-primary hover:underline" href="/login">Sign in</Link>
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
              You&apos;ve been invited to join <strong>{preview.tenantName}</strong> as <strong>{preview.role}</strong> ({preview.email}).
            </p>
          </div>
          <form onSubmit={accept} className="space-y-5">
            <Field label="Your name" htmlFor="name">
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
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
