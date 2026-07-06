"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteAudience, getAudience, getAudienceContacts } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@uprise/ui";

type AudienceDetail = {
  id: string;
  name: string;
  source: string;
  status: string;
  externalListId?: string | null;
  syncedAt?: string | null;
  createdAt?: string;
  _count?: { contacts: number };
  latestSync?: {
    id: string;
    status: string;
    syncedCount: number;
    failedCount: number;
    remoteListId?: string | null;
    completedAt?: string | null;
    createdAt?: string | null;
    startedAt?: string | null;
    /** Server-computed: job waited far past a healthy window (worker down / stuck). */
    stalled?: boolean;
    errorSummary?: string | null;
    stats?: Record<string, unknown> | null;
  } | null;
};

type AudienceContact = {
  id: string;
  fullName?: string | null;
  phoneE164: string;
  source?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
};

export default function AudienceShowPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const id = typeof params?.id === "string" ? params.id : "";

  const [audience, setAudience] = useState<AudienceDetail | null>(null);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const syncStats = (audience?.latestSync?.stats || {}) as Record<string, unknown>;
  const reasonCounts = (syncStats.reasonCounts || {}) as Record<string, unknown>;
  const reasonRows = Object.entries(reasonCounts).filter(([, value]) => Number(value) > 0);
  const skippedNoPhone = Number(syncStats.skippedNoPhone || 0);
  const skippedInvalidPhone = Number(syncStats.skippedInvalidPhone || 0);
  const skippedTotal = skippedNoPhone + skippedInvalidPhone;
  const listNameFromStats = String(syncStats.listName || "").trim();
  const displayListName = listNameFromStats || audience?.name || "—";
  // Present only on a genuinely FAILED job (the failure handler stamps `.error`).
  const syncError = String((syncStats.error as string) || "").trim();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getAudience(id),
      getAudienceContacts(id, {
        query: query.trim() || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    ])
      .then(([audienceRes, contactsRes]) => {
        if (!audienceRes.ok) {
          setError(audienceRes.error);
          setAudience(null);
        } else {
          setAudience(audienceRes.data as AudienceDetail);
          setError("");
        }
        if (!contactsRes.ok) {
          setContacts([]);
          setContactsTotal(0);
          if (!error) setError(contactsRes.error);
        } else {
          setContacts((contactsRes.data.rows || []) as AudienceContact[]);
          setContactsTotal(Number(contactsRes.data.total || 0));
        }
      })
      .finally(() => setLoading(false));
  }, [id, page, query]);

  return (
    <div className="page-stack">
      <Breadcrumbs
        items={[
          { label: "Audience", href: "/audience" },
          { label: audience?.name || "Audience Details" },
        ]}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{audience?.name || "Audience Details"}</h1>
          <p className="text-sm text-muted-foreground">Audience ID: {id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={!id || deleting}
            onClick={() => setConfirmOpen(true)}
          >
            {deleting ? (<><Spinner className="mr-2" />Deleting...</>) : "Delete Audience"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/audience">Back to Audiences</Link>
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-error">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Audience Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !audience ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : audience ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Metric label="Name" value={audience.name} />
              <Metric label="Source" value={audience.source} />
              <Metric
                label="Subscribers"
                value={Number(audience._count?.contacts || 0).toLocaleString()}
              />
              <Metric label="List Name" value={displayListName} />
              <Metric label="List ID" value={audience.externalListId || "—"} />
              <Metric
                label="Non-contactable Records"
                value={skippedTotal.toLocaleString()}
              />
              <div className="md:col-span-3">
                <p className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  Status
                </p>
                <div className="mt-2">
                  <StatusBadge status={audience.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last sync:{" "}
                  {audience.syncedAt ? new Date(audience.syncedAt).toLocaleString() : "Never"}
                </p>
                {audience.latestSync && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {/* Status-aware: only a genuinely FAILED job shows an error, and a job
                        that never progressed (QUEUED/RUNNING past the healthy window) reads
                        as "stuck" rather than a finished import that returned nothing. */}
                    {audience.latestSync.status === "SUCCEEDED" ? (
                      <p>
                        Imported {Number(audience.latestSync.syncedCount || 0).toLocaleString()} · Failed{" "}
                        {Number(audience.latestSync.failedCount || 0).toLocaleString()}
                      </p>
                    ) : audience.latestSync.status === "FAILED" ? (
                      <p className="text-error">Import failed{syncError ? `: ${syncError}` : "."}</p>
                    ) : audience.latestSync.stalled ? (
                      <p className="text-warning-foreground">
                        Import{" "}
                        {audience.latestSync.status === "RUNNING"
                          ? "started but stalled"
                          : "is queued but hasn’t started"}{" "}
                        — the background importer isn’t processing it, so no contacts have been pulled yet.
                        Check the worker and its queue, then re-sync.
                      </p>
                    ) : (
                      <p>
                        {audience.latestSync.status === "RUNNING"
                          ? "Importing…"
                          : "Queued — waiting for the importer to start…"}
                        {Number(audience.latestSync.syncedCount || 0) > 0
                          ? ` ${Number(audience.latestSync.syncedCount).toLocaleString()} imported so far.`
                          : ""}
                      </p>
                    )}
                    {reasonRows.length > 0 && (
                      <p>
                        Reasons:{" "}
                        {reasonRows
                          .map(([reason, count]) => `${reason}: ${Number(count).toLocaleString()}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Audience not found"
              description="This audience may have been deleted or is unavailable."
              ctaLabel="Back to Audience List"
              onCta={() => router.push("/audience")}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Contacts</CardTitle>
          <div className="w-full max-w-sm">
            <Input
              placeholder="Search by name or phone..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !audience ? null : (
            <>
              {loading && audience ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">Contactable</th>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-border/70">
                        <td className="py-3 pr-4">{contact.fullName || "—"}</td>
                        <td className="py-3 pr-4">{contact.phoneE164.startsWith("__noncontactable__") ? "—" : contact.phoneE164}</td>
                        <td className="py-3 pr-4">
                          {contact.metadata?.contactable === false ? "No" : "Yes"}
                        </td>
                        <td className="py-3 pr-4">{contact.source || "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {contact.createdAt
                            ? new Date(contact.createdAt).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {contacts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          No contacts found for this audience yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {contacts.length} of {contactsTotal} contacts
                </p>
                <PaginationControls
                  page={page}
                  pageSize={pageSize}
                  total={contactsTotal}
                  onPrev={() => setPage((p) => Math.max(0, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this audience?"
        description="This action permanently removes the audience and cannot be undone."
        confirmLabel="Delete Audience"
        busy={deleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          setDeleting(true);
          const result = await deleteAudience(id);
          setDeleting(false);
          if (!result.ok) {
            setError(result.error);
            showToast({
              tone: "error",
              title: "Delete failed",
              description: result.error,
            });
            return;
          }
          showToast({
            tone: "success",
            title: "Audience deleted",
            description: "Returning to the audience list.",
          });
          setConfirmOpen(false);
          router.replace("/audience");
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}
