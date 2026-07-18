"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarClock, Download, MapPin, Plus, Users } from "lucide-react";
import { listEvents, type DerivedEventStatus, type EventSummary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, KpiTile } from "@uprise/field";
import { EventFormDialog } from "@/components/events/event-form-dialog";

type Tab = "all" | DerivedEventStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "draft", label: "Draft" },
];

/** Event status pill — semantic tokens, mirroring the stub's colour language. */
const PILL: Record<DerivedEventStatus, string> = {
  upcoming: "bg-primary-container text-foreground",
  ongoing: "bg-success-container text-success",
  completed: "bg-surface-variant text-foreground",
  cancelled: "bg-error-container text-error",
  draft: "bg-secondary-container text-secondary-foreground",
};
function StatusPill({ status }: { status: DerivedEventStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PILL[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
  };
}

function toCsv(rows: EventSummary[]): string {
  const head = ["Title", "Status", "Starts", "Ends", "Location", "Category", "Attendees", "Capacity"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [e.title, e.derivedStatus, e.startsAt, e.endsAt, e.location, e.category, e.attendeeCount, e.capacity ?? ""]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export default function EventsPage() {
  const { data, loading, error, noPermission, refetch } = useApi("/events", () => listEvents(), { ttlMs: 30_000 });
  const events: EventSummary[] = data ?? [];
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<EventSummary | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.derivedStatus] = (c[e.derivedStatus] ?? 0) + 1;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((e) => {
      if (tab !== "all" && e.derivedStatus !== tab) return false;
      if (!term) return true;
      return [e.title, e.description, e.location, e.category].some((v) => v?.toLowerCase().includes(term));
    });
  }, [events, tab, q]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "events.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalAttendees = events.reduce((s, e) => s + e.attendeeCount, 0);

  return (
    <PageShell
      icon={CalendarClock}
      title="Events"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button asChild size="sm">
            <Link href="/canvass/events/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Create event
            </Link>
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Rallies, town halls, launches and phone banks — the public happenings your volunteers staff and your
        supporters RSVP to.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Events" value={events.length.toLocaleString()} />
        <KpiTile label="Upcoming" value={(counts.upcoming ?? 0).toLocaleString()} />
        <KpiTile label="Ongoing" value={(counts.ongoing ?? 0).toLocaleString()} />
        <KpiTile label="Total RSVPs" value={totalAttendees.toLocaleString()} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={TABS.map((t) => ({ value: t.value, label: t.label }))}
          aria-label="Filter events by status"
        />
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search events…"
          aria-label="Search events"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </span>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && events.length === 0}
        emptyTitle="No events yet"
        emptyDescription="Create your first event to start tracking RSVPs and staffing shifts."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={filtered}
          rowKey={(e: EventSummary) => e.id}
          empty="No matching events."
          pageSize={25}
          columns={[
            {
              key: "title",
              header: "Event",
              cell: (e: EventSummary) => (
                <div className="flex items-center gap-3">
                  {e.imageUrl ? (
                    <Image src={e.imageUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-md object-cover" unoptimized />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-variant text-muted-foreground">
                      <CalendarClock className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <Link href={`/canvass/events/${e.id}`} className="font-semibold text-foreground hover:underline">
                      {e.title}
                    </Link>
                    {e.description ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">{e.description}</p>
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              key: "when",
              header: "Date & time",
              cell: (e: EventSummary) => {
                const { date, time } = fmtDate(e.startsAt);
                return (
                  <div>
                    <p className="text-sm text-foreground">{date}</p>
                    <p className="text-xs text-muted-foreground">{time}</p>
                  </div>
                );
              },
            },
            {
              key: "location",
              header: "Location",
              cell: (e: EventSummary) =>
                e.location ? (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {e.location}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            {
              key: "attendees",
              header: "Attendees",
              numeric: true,
              cell: (e: EventSummary) => (
                <span className="flex items-center justify-end gap-1 tabular-nums text-foreground">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {e.attendeeCount}
                  {e.capacity != null ? `/${e.capacity}` : ""}
                </span>
              ),
            },
            { key: "category", header: "Category", cell: (e: EventSummary) => e.category || <span className="text-muted-foreground">—</span> },
            { key: "status", header: "Status", cell: (e: EventSummary) => <StatusPill status={e.derivedStatus} /> },
            {
              key: "action",
              header: "",
              cell: (e: EventSummary) => (
                <button
                  type="button"
                  onClick={() => setEditing(e)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Edit
                </button>
              ),
            },
          ]}
        />
      </StateRegion>

      <EventFormDialog
        open={!!editing}
        event={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void refetch()}
      />
    </PageShell>
  );
}
