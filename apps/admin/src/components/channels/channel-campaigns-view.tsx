"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Spinner, DataTable, ListFooter } from "@uprise/ui";
import { SearchInput } from "@/components/ui/search-input";
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
          <SearchInput
            focusKey="/"
            wrapperClassName="flex-1"
            placeholder="Search campaigns (press /)..."
            value={search}
            onValueChange={setSearch}
          />
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
        <DataTable
          id="tour-dashboard-table"
          aria-label="Blasts"
          rows={pagedBlasts}
          rowKey={(blast) => String(blast.id)}
          pageSize={0}
          loading={loading}
          onRowClick={(blast) => router.push(`/blasts/${encodeURIComponent(String(blast.id))}`)}
          empty="No matching blasts. Create one with “New Blast”."
          columns={[
            {
              key: "name",
              header: "Blast Name",
              cell: (blast) => (
                <div>
                  <p className="font-medium">{String(blast.title || "Untitled Blast")}</p>
                  <p className="text-xs text-muted-foreground">ID: {String(blast.id)}</p>
                </div>
              ),
            },
            { key: "status", header: "Status", cell: (blast) => <StatusBadge status={String(blast.status || "DRAFTED")} /> },
            { key: "created", header: "Created", cell: (blast) => <span className="text-muted-foreground">{formatDate(blast.createdAt)}</span> },
            {
              key: "recipients",
              header: "Recipients",
              cell: (blast) => Number((blast as any)._count?.recipients || 0).toLocaleString(),
            },
            {
              key: "awaiting",
              header: "Awaiting Response",
              cell: (blast) => Number((blast as any).awaitingResponseCount || 0).toLocaleString(),
            },
            { key: "audience", header: "Audience", cell: (blast) => <span className="text-muted-foreground">{String(blast.audienceId || "—")}</span> },
            {
              key: "actions",
              header: "Quick Actions",
              cell: (blast) => (
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
              ),
            },
          ]}
        />
        <ListFooter
          shown={pagedBlasts.length}
          total={filteredBlasts.length}
          noun="blasts"
          suffix={lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
          page={page}
          pageSize={pageSize}
          onPrev={() => setPage((prev) => Math.max(0, prev - 1))}
          onNext={() => setPage((prev) => prev + 1)}
        />
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
