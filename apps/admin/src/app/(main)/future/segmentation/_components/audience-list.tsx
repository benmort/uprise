"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, LayoutGrid, List, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectItem } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";
import { MOCK_SEGMENTS, type Segment } from "../_data/mock";

type ViewMode = "card" | "table";
const PAGE_SIZE = 6;

function timeAgo(iso: string): string {
  const days = Math.round((Date.UTC(2026, 6, 3) - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} mo ago`;
}

export function AudienceList() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [status, setStatus] = useState("active");
  const [createdBy, setCreatedBy] = useState("__any__");
  const [view, setView] = useState<ViewMode>("card");
  const [page, setPage] = useState(1);

  const creators = useMemo(
    () => Array.from(new Set(MOCK_SEGMENTS.map((s) => s.createdByName))).sort(),
    [],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = MOCK_SEGMENTS.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (createdBy !== "__any__" && s.createdByName !== createdBy) return false;
      if (term && !`${s.name} ${s.summary}`.toLowerCase().includes(term)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) =>
      sort === "alpha" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    );
    return rows;
  }, [q, status, createdBy, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const activeFilters = Boolean(q) || createdBy !== "__any__" || status !== "active";

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={q}
          onValueChange={(v) => resetPage(setQ)(v)}
          placeholder="Search audiences…"
          wrapperClassName="w-full max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sort} onValueChange={setSort} aria-label="Sort" className="w-[140px]">
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="alpha">Alphabetical</SelectItem>
          </Select>
          <Select value={status} onValueChange={resetPage(setStatus)} aria-label="Status" className="w-[130px]">
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </Select>
          <Select value={createdBy} onValueChange={resetPage(setCreatedBy)} aria-label="Created by" className="w-[150px]">
            <SelectItem value="__any__">Created by</SelectItem>
            {creators.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </Select>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              aria-label="Card view"
              onClick={() => setView("card")}
              className={cn("flex h-11 w-11 items-center justify-center", view === "card" ? "bg-surface-variant text-foreground" : "text-muted-foreground hover:bg-surface-variant")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Table view"
              onClick={() => setView("table")}
              className={cn("flex h-11 w-11 items-center justify-center border-l border-border", view === "table" ? "bg-surface-variant text-foreground" : "text-muted-foreground hover:bg-surface-variant")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Info line */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {paged.length} of {filtered.length} audience{filtered.length === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
        </span>
        {activeFilters && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setQ("");
              setStatus("active");
              setCreatedBy("__any__");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No audiences match"
          description="Try clearing filters, or create a new audience segment."
          ctaLabel="New segment"
          onCta={() => {
            window.location.href = "/future/segmentation/new";
          }}
        />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paged.map((s) => (
            <AudienceCard key={s.id} segment={s} />
          ))}
        </div>
      ) : (
        <AudienceTable rows={paged} />
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex justify-end pt-1">
          <PaginationControls
            page={clampedPage - 1}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
          />
        </div>
      )}
    </div>
  );
}

function AudienceCard({ segment }: { segment: Segment }) {
  return (
    <Link href={`/future/segmentation/${segment.id}`} className="block">
      <Card className="h-full transition hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{segment.name}</p>
              <p className="text-xs text-muted-foreground">{segment.members.toLocaleString()} members</p>
            </div>
            {segment.status === "archived" && <StatusBadge status="ARCHIVED" />}
          </div>
          <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{segment.summary || "No description."}</p>
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>{segment.createdByName}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(segment.updatedAt)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AudienceTable({ rows }: { rows: Segment[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Members</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Summary</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Created by</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-variant">
                <td className="px-4 py-3">
                  <Link href={`/future/segmentation/${s.id}`} className="font-medium text-foreground hover:text-primary">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{s.members.toLocaleString()}</td>
                <td className="hidden max-w-xs truncate px-4 py-3 text-muted-foreground md:table-cell">{s.summary}</td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.createdByName}</td>
                <td className="px-4 py-3 text-muted-foreground">{timeAgo(s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
