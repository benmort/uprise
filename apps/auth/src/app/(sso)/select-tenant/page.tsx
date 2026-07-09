"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Input } from "@uprise/ui";
import { auth, type Membership } from "@uprise/api-client";
import { validateReturnTo } from "@/lib/return-to";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ORGANISER: "Organiser",
  VOLUNTEER: "Volunteer",
};

// Show the filter only once the list is long enough to need it — a superadmin sees
// every workspace, but a regular multi-tenant user with a handful doesn't need a search.
const SEARCH_THRESHOLD = 6;


export default function SelectTenantPage() {
  const returnTo = useQueryParams().get("return_to");
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await auth.checkSession();
      if (!res.ok || !res.data.user) {
        window.location.assign(`/sign-in${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`);
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
    <div className="flex w-full flex-col">
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Choose a workspace</h1>
        <p className="text-sm text-muted-foreground">Pick the workspace you want to sign in to.</p>
      </div>
      {error ? <Alert variant="error" title={error} className="mb-4" /> : null}
      {memberships ? (
        (() => {
          const q = query.trim().toLowerCase();
          const filtered = q
            ? memberships.filter((m) => m.tenantName.toLowerCase().includes(q))
            : memberships;
          return (
            <>
              {memberships.length > SEARCH_THRESHOLD ? (
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search workspaces…"
                  aria-label="Search workspaces"
                  autoFocus
                  className="mb-3"
                />
              ) : null}
              <ul className="space-y-2">
                {filtered.map((m) => (
                  <li key={m.tenantId}>
                    <Button variant="outline" className="w-full justify-between" disabled={busy} onClick={() => choose(m.tenantId)}>
                      <span>{m.tenantName}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</span>
                    </Button>
                  </li>
                ))}
                {filtered.length === 0 ? (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No workspaces match “{query.trim()}”.
                  </li>
                ) : null}
              </ul>
            </>
          );
        })()
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      )}
      <div className="mt-5 text-sm text-muted-foreground">
        <Link className="text-primary hover:underline" href="/sign-in">Sign in as someone else</Link>
      </div>
    </div>
  );
}
