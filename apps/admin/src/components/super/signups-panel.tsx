"use client";

import { Spinner } from "@uprise/ui";
import { useCallback, useEffect, useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { Card, CardContent } from "@uprise/ui";
import { Button } from "@uprise/ui";
import { approveSignup, listPendingSignups, rejectSignup, type PendingSignup } from "@/lib/api";

/**
 * The pending-signups queue, extracted from /super/signups so it can mount as the "Signups" tab
 * on the tenants list (its own page now redirects here). New self-service tenants (gated
 * /auth/register when SIGNUP_APPROVAL_REQUIRED) await review: approving mints the OWNER membership
 * and emails "you're in"; rejecting soft-deletes the member-less tenant, freeing its slug. The API
 * enforces @SuperAdmin; the parent page gates the view. `onCount` reports the pending count so the
 * tab can badge it.
 */
export function SignupsPanel({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<PendingSignup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    const res = await listPendingSignups();
    if (res.ok) {
      setRows(res.data);
      onCount?.(res.data.length);
    } else {
      setError(res.error);
    }
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (row: PendingSignup) => {
    if (pending) return;
    setPending(`approve:${row.requestId}`);
    const res = await approveSignup(row.requestId);
    setPending(null);
    if (res.ok) {
      setRows((prev) => {
        const next = prev ? prev.filter((r) => r.requestId !== row.requestId) : prev;
        if (next) onCount?.(next.length);
        return next;
      });
    } else {
      setError(res.error);
    }
  };

  const reject = async (row: PendingSignup) => {
    if (pending) return;
    if (!window.confirm(`Reject "${row.orgName}"? This soft-deletes the tenant and frees its URL.`)) return;
    setPending(`reject:${row.requestId}`);
    const res = await rejectSignup(row.requestId);
    setPending(null);
    if (res.ok) {
      setRows((prev) => {
        const next = prev ? prev.filter((r) => r.requestId !== row.requestId) : prev;
        if (next) onCount?.(next.length);
        return next;
      });
    } else {
      setError(res.error);
    }
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-800 dark:text-red-400">
        {error}
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
        <Spinner className="h-5 w-5 animate-spin" /> Loading signups…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-gray-100">No signups awaiting approval</h3>
          <p className="max-w-sm text-center text-sm text-gray-600 dark:text-gray-400">
            New self-service tenants will appear here for review.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <Card key={r.requestId} className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-500/20">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{r.orgName}</p>
                <p className="truncate text-sm text-gray-600 dark:text-gray-400">{r.slug}.uprise.org.au</p>
              </div>
            </div>
            <div className="space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <span className="font-medium text-gray-800 dark:text-gray-200">Owner:</span>{" "}
                {r.displayName ? `${r.displayName} · ` : ""}
                {r.email}
              </p>
              <p>
                <span className="font-medium text-gray-800 dark:text-gray-200">Signed up:</span>{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" disabled={!!pending} onClick={() => void approve(r)}>
                {pending === `approve:${r.requestId}` ? (
                  <Spinner className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!pending}
                onClick={() => void reject(r)}
                className="text-red-600 dark:text-red-400"
              >
                {pending === `reject:${r.requestId}` ? (
                  <Spinner className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-1 h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
