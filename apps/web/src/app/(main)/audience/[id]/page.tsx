"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAudience, getAudienceContacts } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

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
  const id = typeof params?.id === "string" ? params.id : "";

  const [audience, setAudience] = useState<AudienceDetail | null>(null);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold">{audience?.name || "Audience"}</h1>
          <p className="text-sm text-muted-foreground">Audience ID: {id}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/audience">Back to Audiences</Link>
        </Button>
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
            <p className="text-sm text-muted-foreground">Loading audience...</p>
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
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>
                      Imported: {Number(audience.latestSync.syncedCount || 0).toLocaleString()} | Failed:{" "}
                      {Number(audience.latestSync.failedCount || 0).toLocaleString()}
                    </p>
                    {reasonRows.length > 0 && (
                      <p className="mt-1">
                        Reasons:{" "}
                        {reasonRows
                          .map(([reason, count]) => `${reason}: ${Number(count).toLocaleString()}`)
                          .join(", ")}
                      </p>
                    )}
                    {audience.latestSync.errorSummary && (
                      <p className="mt-1">Error summary: {audience.latestSync.errorSummary}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audience not found.</p>
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
                          No contacts found for this audience.
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * pageSize >= contactsTotal}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
