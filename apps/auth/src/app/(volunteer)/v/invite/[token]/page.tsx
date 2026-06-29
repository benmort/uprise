"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, Input, Spinner } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";

/**
 * Volunteer invite acceptance, mobile-first. Previews the invite, then accepts with
 * just a name (phone invites are passwordless — holding the SMS'd link proves the
 * number). On success runs the shared completeAuth (→ select-tenant or return_to).
 */
export default function VolunteerInvitePage() {
  const token = String(useParams().token ?? "");
  const returnTo = useQueryParams().get("return_to");
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await auth.previewInvite(token);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTenantName(res.data.tenantName);
    })();
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.acceptInvite({ token, displayName: name.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Spinner />
      </div>
    );
  }
  if (error && tenantName === null) {
    return <Alert variant="error" title={error} />;
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-2xl font-extrabold text-foreground">
          Join{tenantName ? ` ${tenantName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">You&apos;ve been invited to canvass.</p>
      </div>
      <form onSubmit={accept} className="space-y-5">
        <Field label="Your name" htmlFor="name">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error ? <Alert variant="error" title={error} /> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !name.trim()}>
          {busy ? (
            <>
              <Spinner className="mr-2" />
              Joining…
            </>
          ) : (
            "Accept & start"
          )}
        </Button>
      </form>
    </div>
  );
}
