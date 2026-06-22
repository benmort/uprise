"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Logo } from "@yarns/ui";
import { auth, type Membership } from "@yarns/api-client";
import { validateReturnTo } from "@/lib/return-to";


export default function SelectTenantPage() {
  const returnTo = useQueryParams().get("return_to");
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await auth.checkSession();
      if (!res.ok || !res.data.user) {
        window.location.assign(`/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`);
        return;
      }
      const m = res.data.user.memberships;
      if (m.length <= 1) {
        window.location.assign(validateReturnTo(returnTo));
        return;
      }
      setMemberships(m);
    })();
  }, [returnTo]);

  async function choose(tenantId: string) {
    setBusy(true);
    setError(null);
    const res = await auth.selectTenant(tenantId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.location.assign(validateReturnTo(returnTo));
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center"><Logo large /></div>
        <CardTitle>Choose a workspace</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
        {memberships ? (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.tenantId}>
                <Button variant="outline" className="w-full justify-between" disabled={busy} onClick={() => choose(m.tenantId)}>
                  <span>{m.tenantName}</span>
                  <span className="text-xs text-muted-foreground">{m.role}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        <div className="mt-4 text-sm">
          <Link className="text-primary hover:underline" href="/login">Sign in as someone else</Link>
        </div>
      </CardContent>
    </Card>
  );
}
