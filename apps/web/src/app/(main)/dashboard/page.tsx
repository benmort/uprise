"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDashboardPerformance, getRecentBlasts } from "@/lib/api";
import { fuzzyIncludes } from "@/lib/fuzzy";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipHint } from "@/components/ui/tooltip-hint";

const RECENT_SEARCHES_KEY = "yarns.dashboard.recentSearches";
const DASHBOARD_SEARCH_KEY = "yarns.dashboard.search";

export default function DashboardPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [performance, setPerformance] = useState({
    totalSent: 0,
    totalContacted: 0,
    totalResponded: 0,
    responseRate: 0,
    activeDrafts: 0,
  });
  const [blasts, setBlasts] = useState<Array<Record<string, unknown>>>([]);

  const run = async () => {
    setError("");
    const [perfRes, blastsRes] = await Promise.all([getDashboardPerformance(), getRecentBlasts()]);
    if (!perfRes.ok) {
      setError(perfRes.error);
    } else {
      setPerformance({
        ...perfRes.data,
        totalContacted: Number(perfRes.data.totalContacted ?? perfRes.data.totalSent ?? 0),
      });
    }
    if (!blastsRes.ok) {
      setError((prev) => prev || blastsRes.error);
    } else {
      setBlasts(blastsRes.data);
    }
    setLastUpdatedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearch(window.localStorage.getItem(DASHBOARD_SEARCH_KEY) || "");
    setRecentSearches(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || "[]") as string[]);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (!alive) return;
      await run();
    };
    void refresh();
    const timer = setInterval(refresh, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_SEARCH_KEY, search);
  }, [search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredBlasts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blasts;
    return blasts.filter((blast) => {
      const title = String(blast.title || "");
      const id = String(blast.id || "");
      return fuzzyIncludes(title, q) || fuzzyIncludes(id, q);
    });
  }, [search, blasts]);

  const pageSize = 8;
  const pagedBlasts = useMemo(
    () => filteredBlasts.slice(page * pageSize, page * pageSize + pageSize),
    [filteredBlasts, page],
  );

  useEffect(() => {
    if (page * pageSize >= filteredBlasts.length) setPage(0);
  }, [filteredBlasts.length, page]);

  const rememberSearch = () => {
    const q = search.trim();
    if (!q || typeof window === "undefined") return;
    const next = [q, ...recentSearches.filter((item) => item !== q)].slice(0, 5);
    setRecentSearches(next);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };

  return (
    <div className="page-stack">
      <div className="section-stack">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Track Campaign Performance</h1>
            <p className="text-sm text-muted-foreground">
              Monitor sends, replies, and unresolved work in one place.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Performance Pulse</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`performance-skeleton-${index}`}
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="mt-3 h-9 w-20" />
                    <Skeleton className="mt-2 h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <EmptyState
                title="We couldn't load dashboard metrics"
                description={error}
                ctaLabel="Retry"
                onCta={() => void run()}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric
                  label="Total Contacted"
                  value={performance.totalContacted.toLocaleString()}
                  tooltip="Unique recipients reached by sent, delivered, failed, or responded outcomes."
                />
                <Metric
                  label="Response Rate"
                  value={`${performance.responseRate}%`}
                  sub={`${performance.totalResponded.toLocaleString()} replies`}
                  tooltip="Responded recipients divided by total contacted recipients."
                />
                <Metric label="Active Drafts" value={String(performance.activeDrafts)} sub="ready for review" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Blast Campaigns</CardTitle>
          <div className="flex w-full max-w-md gap-2">
            <Input
              ref={searchRef}
              placeholder="Search campaigns (press /)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={rememberSearch}
            />
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentSearches.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((query) => (
                <Button key={query} variant="ghost" size="sm" onClick={() => setSearch(query)}>
                  {query}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 pr-4">Blast Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Recipients</th>
                  <th className="py-2 pr-4">Audience</th>
                  <th className="py-2 pr-4">Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`recent-blasts-skeleton-${index}`} className="border-b border-border/60">
                        <td className="py-3 pr-4">
                          <Skeleton className="h-4 w-44" />
                          <Skeleton className="mt-2 h-3 w-28" />
                        </td>
                        <td className="py-3 pr-4">
                          <Skeleton className="h-7 w-24 rounded-full" />
                        </td>
                        <td className="py-3 pr-4">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="py-3 pr-4">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="py-3 pr-4">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-14" />
                          </div>
                        </td>
                      </tr>
                    ))
                  : pagedBlasts.map((blast) => (
                      <tr
                        key={String(blast.id)}
                        className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                        onClick={() => router.push(`/blasts/${encodeURIComponent(String(blast.id))}`)}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{String(blast.title || "Untitled Blast")}</p>
                          <p className="text-xs text-muted-foreground">ID: {String(blast.id)}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={String(blast.status || "DRAFTED")} />
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDate(blast.createdAt)}
                        </td>
                        <td className="py-3 pr-4">
                          {Number((blast as any)._count?.recipients || 0).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{String(blast.audienceId || "—")}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/blasts/${encodeURIComponent(String(blast.id))}/composer`);
                              }}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loading && pagedBlasts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No matching blasts. Try a broader search or create a new campaign.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Showing {pagedBlasts.length} of {filteredBlasts.length} blasts
              {lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
            </p>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={filteredBlasts.length}
              onPrev={() => setPage((prev) => Math.max(0, prev - 1))}
              onNext={() => setPage((prev) => prev + 1)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="inline-flex items-center gap-1 text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        {tooltip ? <TooltipHint label={tooltip} /> : null}
      </p>
      <p className="mt-2 text-3xl font-headline font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function formatDate(value: unknown) {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}

