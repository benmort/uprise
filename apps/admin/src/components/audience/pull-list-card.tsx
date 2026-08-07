"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getSyncJobs,
  listIntegrationConnections,
  searchIntegrationLists,
  syncIntegrationList,
} from "@/lib/api";
import {
  audienceNameForList,
  actionNetworkGroupOptions,
  autoSelectedSourceId,
  findSource,
  nationBuilderNationOptions,
  pullCardTitle,
  toImportSources,
  type ImportSource,
} from "@/lib/integration-sources";
import { pollSyncJob, type IntegrationSyncJob } from "@/lib/audience-sync";
import { importSummaryLine, type SyncRunStats } from "@/lib/sync-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { SearchInput } from "@/components/ui/search-input";
import { Alert, SegmentedControl } from "@uprise/ui";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pull a human-readable reason out of a sync job's errorSummary JSON blob. */
function summariseSyncError(errorSummary: string | null | undefined): string {
  if (!errorSummary) return "";
  try {
    const parsed = JSON.parse(errorSummary) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : "";
  } catch {
    return errorSummary.slice(0, 200);
  }
}

/** What a completed sync leaves behind for the success panel. */
type SyncSuccess = {
  audienceId: string;
  listName: string;
  syncedCount: number;
  stats: SyncRunStats | null;
};

/**
 * The pull half of Data sync — pick a connected source, browse its remote lists (or, for
 * NationBuilder, its tags), sync one into an audience, and watch the job to a terminal
 * state. Extracted verbatim from the old `/audience?tab=sync` card when Data sync
 * graduated to its own route; self-contained (loads its own connections/lists) so
 * `/audience` no longer carries any of this state.
 *
 * `reloadToken`: bump to re-fetch sources (the connect dialog just added one).
 * `onSynced` fires when a queued sync reaches a terminal state.
 */
export function PullListCard({
  reloadToken = 0,
  onSynced,
}: {
  reloadToken?: number;
  onSynced?: (terminal: IntegrationSyncJob | null) => void;
}) {
  const { showToast } = useToast();
  // Import sources are whatever this tenant has actually connected. There is no default
  // provider and no platform-wide fallback — an organiser who has connected nothing gets
  // an empty state, not somebody else's Action Network lists.
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [lists, setLists] = useState<Array<Record<string, unknown>>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [listSearchMessage, setListSearchMessage] = useState("");
  const [listsLoading, setListsLoading] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  // Name filter for the remote-list picker. Action Network returns 25 lists per page and an
  // account can easily hold dozens, so without this the only way to reach one is to page
  // through everything and hope you recognise it.
  const [listQuery, setListQuery] = useState("");
  // NationBuilder organisers slice their nation by TAG as much as by list.
  const [browseKind, setBrowseKind] = useState<"lists" | "tags">("lists");
  const [success, setSuccess] = useState<SyncSuccess | null>(null);
  // Guards the sync poll loop so it stops if the user navigates away mid-sync.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Connections this tenant owns. Drives the source picker; nothing is fetched without one. */
  const loadSources = async () => {
    setSourcesLoading(true);
    const res = await listIntegrationConnections();
    const next = res.ok ? toImportSources(res.data) : [];
    setSources(next);
    setSourcesLoading(false);
    const preselected = autoSelectedSourceId(next);
    setSelectedSourceId(preselected);
    return preselected ? next.find((s) => s.id === preselected) : undefined;
  };

  const loadIntegrationLists = async (source?: ImportSource, query?: string, kind?: "lists" | "tags") => {
    const target = source ?? findSource(sources, selectedSourceId);
    if (!target) {
      setLists([]);
      setListPage(0);
      setSelectedListId("");
      setListSearchMessage("");
      return;
    }
    setListsLoading(true);
    // Tags exist for NationBuilder only — any other source always browses lists.
    const effectiveKind = target.type === "NATION_BUILDER" ? (kind ?? browseKind) : "lists";
    const result = await searchIntegrationLists(
      target.type,
      query ?? listQuery,
      target.id,
      effectiveKind === "tags" ? "tags" : undefined,
    );
    if (result.ok) {
      setLists(result.data.lists);
      setListPage(0);
      setSelectedListId("");
      setListSearchMessage(
        result.data.lists.length === 0
          ? (query ?? listQuery).trim()
            ? `No lists match "${(query ?? listQuery).trim()}".`
            : "No remote lists found for this connection."
          : "",
      );
    } else {
      setLists([]);
      setListPage(0);
      setSelectedListId("");
      setListSearchMessage(result.error);
      showToast({
        tone: "error",
        title: "Could not load integration lists",
        description: result.error,
      });
    }
    setListsLoading(false);
  };

  const handleSyncSelectedList = async () => {
    const source = findSource(sources, selectedSourceId);
    if (!selectedListId || syncing || !source) return;
    const selectedList = lists.find((list) => String(list.id) === selectedListId);
    const selectedListName = String(selectedList?.name || "").trim();
    const audienceNameForSync = audienceNameForList(source, selectedListName);
    setSyncing(true);
    setSyncMessage("");
    try {
      const synced = await syncIntegrationList({
        type: source.type,
        connectionId: source.id,
        listId: selectedListId,
        listName: selectedListName || undefined,
        audienceName: audienceNameForSync,
      });
      if (!synced.ok) {
        setSyncMessage(synced.error);
        showToast({ tone: "error", title: "Integration sync failed", description: synced.error });
        return;
      }
      const response = synced.data ?? {};
      const audienceId = String(response.audienceId || "").trim();
      const syncJobId = String(response.syncJobId || "").trim();
      setSuccess(null);
      setSyncMessage(
        `Sync queued${syncJobId ? ` (job ${syncJobId.slice(0, 8)})` : ""}. Tracking progress…`,
      );
      showToast({
        tone: "success",
        title: "Integration sync queued",
        description: "The worker is processing this list — progress updates live.",
      });

      // The audience is created up-front by the API; poll the sync job to a terminal state
      // and reflect success/failure — no more silent "queued and vanished".
      if (audienceId) {
        const fetchJobs = async (): Promise<IntegrationSyncJob[]> => {
          const res = await getSyncJobs();
          return res.ok ? res.data : [];
        };
        const terminal = await pollSyncJob({
          audienceId,
          fetchJobs,
          sleep,
          shouldContinue: () => mountedRef.current,
        });
        if (!mountedRef.current) return;
        if (terminal?.status === "FAILED") {
          const reason = summariseSyncError(terminal.errorSummary);
          setSyncMessage(`Sync failed${reason ? `: ${reason}` : ""}.`);
          showToast({
            tone: "error",
            title: "Integration sync failed",
            description: reason || "The worker could not complete this sync.",
          });
        } else if (terminal?.status === "SUCCEEDED") {
          setSyncMessage("");
          // The terminal job's errorSummary carries the final stats blob — parse it for
          // the honest counts line (email-only kept, skipped) on the success panel.
          let stats: SyncRunStats | null = null;
          try {
            stats = terminal.errorSummary ? (JSON.parse(terminal.errorSummary) as SyncRunStats) : null;
          } catch {
            stats = null;
          }
          setSuccess({
            audienceId,
            listName: selectedListName || "your list",
            syncedCount: Number(terminal.syncedCount ?? 0),
            stats,
          });
          showToast({
            tone: "success",
            title: "Integration sync completed",
            description: `Synced ${Number(terminal.syncedCount ?? 0)} contacts.`,
          });
        }
        onSynced?.(terminal);
      }
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  };

  useEffect(() => {
    // Only reach the provider once we know the tenant has a connection to reach it
    // through, and only for that exact connection. Re-runs when the connect dialog
    // adds a connection (reloadToken bump) so the new nation appears immediately.
    void loadSources().then((auto) => {
      if (auto) void loadIntegrationLists(auto);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const selectedSource = useMemo(
    () => findSource(sources, selectedSourceId),
    [sources, selectedSourceId],
  );
  const anGroups = useMemo(() => actionNetworkGroupOptions(sources), [sources]);
  const nbNations = useMemo(() => nationBuilderNationOptions(sources), [sources]);

  const listPageSize = 10;
  const pagedLists = lists.slice(listPage * listPageSize, listPage * listPageSize + listPageSize);

  return (
    <Card id="tour-audience-sync">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{pullCardTitle(sources)}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadIntegrationLists()}
            disabled={listsLoading || !selectedSource}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSyncSelectedList()}
            disabled={!selectedListId || syncing || !selectedSource}
          >
            {syncing ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
                Syncing…
              </span>
            ) : (
              "Sync Selected List"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sourcesLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : sources.length === 0 ? (
          <EmptyState
            title="No import source connected"
            description="Connect NationBuilder, Action Network or an internal source in Settings → Integrations, then come back to pull a list."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/integrations">Go to Integrations</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Select
              value={selectedSourceId}
              onValueChange={(v) => {
                setSelectedSourceId(v);
                setLists([]);
                setSelectedListId("");
                setListSearchMessage("");
                void loadIntegrationLists(findSource(sources, v));
              }}
              title="Which connected account to import from"
              placeholder="Choose a source…"
            >
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.optionLabel}
                </SelectItem>
              ))}
            </Select>
            {anGroups.length > 1 && (
              // Each connected Action Network group is its own connection (AN issues
              // one API key per group), so picking a group picks the connection.
              <Select
                value={selectedSource?.type === "ACTION_NETWORK" ? selectedSourceId : ""}
                onValueChange={(v) => {
                  setSelectedSourceId(v);
                  setLists([]);
                  setSelectedListId("");
                  setListSearchMessage("");
                  void loadIntegrationLists(findSource(sources, v));
                }}
                title="Which Action Network group to sync from"
                placeholder="Choose an Action Network group…"
              >
                {anGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </Select>
            )}
            {nbNations.length > 1 && (
              // Same shape for NationBuilder: one connection per nation (slug), so
              // picking a nation picks the connection.
              <Select
                value={selectedSource?.type === "NATION_BUILDER" ? selectedSourceId : ""}
                onValueChange={(v) => {
                  setSelectedSourceId(v);
                  setLists([]);
                  setSelectedListId("");
                  setListSearchMessage("");
                  void loadIntegrationLists(findSource(sources, v));
                }}
                title="Which NationBuilder nation to sync from"
                placeholder="Choose a NationBuilder nation…"
              >
                {nbNations.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </Select>
            )}
            {!selectedSourceId && (
              <p className="text-xs text-muted-foreground">
                Choose which connected account
                {anGroups.length > 1 || nbNations.length > 1 ? " and group" : ""} to import from.
              </p>
            )}
          </>
        )}
        {selectedSource?.type === "NATION_BUILDER" && (
          // Lists/Tags switch — NationBuilder organisers mostly organise by tag.
          <SegmentedControl
            aria-label="Browse by"
            fluid
            size="sm"
            value={browseKind}
            options={[
              { value: "lists", label: "Lists" },
              { value: "tags", label: "Tags" },
            ]}
            onChange={(k) => {
              setBrowseKind(k);
              setLists([]);
              setSelectedListId("");
              setListSearchMessage("");
              void loadIntegrationLists(undefined, undefined, k);
            }}
          />
        )}
        {sources.length > 0 && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void loadIntegrationLists(undefined, listQuery);
              }}
            >
              <SearchInput
                value={listQuery}
                onValueChange={setListQuery}
                onClear={() => void loadIntegrationLists(undefined, "")}
                wrapperClassName="flex-1"
                placeholder="Search lists by name…"
                aria-label="Search remote lists by name"
              />
              <Button type="submit" size="sm" variant="outline" disabled={listsLoading || !selectedSourceId}>
                Search
              </Button>
            </form>
            <div className="min-h-[220px] max-h-[260px] overflow-y-auto rounded border border-border">
              {pagedLists.map((list) => {
                const listId = String(list.id);
                const isSelected = selectedListId === listId;
                return (
                  <button
                    key={listId}
                    type="button"
                    className={`flex min-h-11 w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 ${
                      isSelected ? "bg-primary-container/30" : ""
                    }`}
                    onClick={() => setSelectedListId((prev) => (prev === listId ? "" : listId))}
                  >
                    <span>{String(list.name || "Unnamed list")}</span>
                    <span className="text-xs text-muted-foreground">
                      {typeof list.count === "number"
                        ? `${list.count.toLocaleString()} contacts${
                            list.countSource === "last_sync" ? " · last sync" : ""
                          }`
                        : "—"}
                    </span>
                  </button>
                );
              })}
              {lists.length === 0 &&
                (listsLoading ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {listSearchMessage ||
                      (selectedSourceId ? "No remote lists loaded." : "Choose a source to load its lists.")}
                  </p>
                ))}
            </div>
            <div className="flex justify-end">
              <PaginationControls
                page={listPage}
                pageSize={listPageSize}
                total={lists.length}
                onPrev={() => setListPage((prev) => Math.max(0, prev - 1))}
                onNext={() => setListPage((prev) => prev + 1)}
              />
            </div>
          </>
        )}
        {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
        {success && (
          // The answer, and the next step: what landed, what couldn't be texted, and the
          // three places this audience is now usable — plus the always-on search.
          <Alert variant="success" showIcon={false} data-testid="sync-success-panel">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                ✓ Synced {success.syncedCount.toLocaleString()} people from &ldquo;{success.listName}&rdquo;.
              </p>
              <p className="text-xs text-muted-foreground">{importSummaryLine(success.syncedCount, success.stats)}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/channels/text">Send a text blast</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/autodialer">Start a calling campaign</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/audience/${success.audienceId}`}>View audience</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A live search, <span className="font-medium">Imported contacts</span>, keeps up with everyone
                from this source – find it under Searches.
              </p>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
