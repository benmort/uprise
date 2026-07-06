"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Spinner } from "@uprise/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getRecentBlasts, type MessageChannel } from "@/lib/api";
import { createBlastAndOpen } from "@/lib/blasts";
import { fuzzyIncludes } from "@/lib/fuzzy";

export function normaliseChannel(value: unknown): MessageChannel {
  return String(value) === "WHATSAPP" ? "WHATSAPP" : "SMS";
}

type ChannelCampaignsViewProps = {
  channel: MessageChannel;
  title: string;
  description?: string;
};

/**
 * The blast-campaigns table (search + paginate + quick actions), filtered to one channel.
 * Lifted from the old dashboard and parameterised by `channel`; reused by both Channels pages.
 */
export function ChannelCampaignsView({ channel, title, description }: ChannelCampaignsViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchKey = `uprise.channels.${channel}.search`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [blasts, setBlasts] = useState<Array<Record<string, unknown>>>([]);

  const run = async () => {
    setError("");
    const res = await getRecentBlasts();
    if (!res.ok) setError(res.error);
    else setBlasts(res.data);
    setLastUpdatedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearch(window.localStorage.getItem(searchKey) || "");
  }, [searchKey]);

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
    window.localStorage.setItem(searchKey, search);
  }, [search, searchKey]);

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

  const channelBlasts = useMemo(
    () => blasts.filter((blast) => normaliseChannel(blast.channel) === channel),
    [blasts, channel],
  );

  const filteredBlasts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channelBlasts;
    return channelBlasts.filter((blast) => {
      const blastTitle = String(blast.title || "");
      const id = String(blast.id || "");
      return fuzzyIncludes(blastTitle, q) || fuzzyIncludes(id, q);
    });
  }, [search, channelBlasts]);

  const pageSize = 8;
  const pagedBlasts = useMemo(
    () => filteredBlasts.slice(page * pageSize, page * pageSize + pageSize),
    [filteredBlasts, page],
  );

  useEffect(() => {
    if (page * pageSize >= filteredBlasts.length) setPage(0);
  }, [filteredBlasts.length, page]);

  const createBlast = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createBlastAndOpen(router, showToast, { channel });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div id="tour-dashboard-search" className="flex w-full gap-2 sm:max-w-md">
          <Input
            ref={searchRef}
            placeholder="Search campaigns (press /)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="outline" onClick={() => setSearch("")}>
            Clear
          </Button>
          <Button className="shrink-0 gap-1.5" disabled={creating} onClick={createBlast}>
            <PlusCircle className="h-4 w-4" />
            {creating ? (<><Spinner className="mr-2" />Creating...</>) : "New Blast"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <EmptyState
            title="We couldn't load campaigns"
            description={error}
            ctaLabel="Retry"
            onCta={() => void run()}
          />
        ) : null}
        <div id="tour-dashboard-table" className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 pr-4">Blast Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Recipients</th>
                <th className="py-2 pr-4">Awaiting Response</th>
                <th className="py-2 pr-4">Audience</th>
                <th className="py-2 pr-4">Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`blasts-skeleton-${index}`} className="border-b border-border/60">
                      <td className="py-3 pr-4">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="mt-2 h-3 w-28" />
                      </td>
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <td key={cell} className="py-3 pr-4">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ))}
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
                      <td className="py-3 pr-4 text-muted-foreground">{formatDate(blast.createdAt)}</td>
                      <td className="py-3 pr-4">
                        {Number((blast as any)._count?.recipients || 0).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4">
                        {Number((blast as any).awaitingResponseCount || 0).toLocaleString()}
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
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No matching blasts. Create one with “New Blast”.
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
