"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAudience,
  createWhatsappOptInAudience,
  getAudienceImportStatus,
  getAudienceSegments,
  getSyncJobs,
  importAudienceCsv,
  listAudiences,
  searchIntegrationLists,
  syncIntegrationList,
  type AudienceChannel,
  type AudienceImportProgress,
  type AudienceSegmentRow,
} from "@/lib/api";
import {
  mergeSyncBadges,
  pollSyncJob,
  type IntegrationSyncJob,
} from "@/lib/audience-sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fuzzyIncludes } from "@/lib/fuzzy";
import { Users } from "lucide-react";

type AudienceRow = {
  id: string;
  name: string;
  source: string;
  status: string;
  channel?: AudienceChannel;
  kind?: "STATIC" | "WHATSAPP_OPTED_IN";
  syncedAt?: string;
  _count?: { contacts: number };
};

const CHANNEL_LABEL: Record<string, string> = { SMS: "SMS", WHATSAPP: "WhatsApp", ALL: "Both" };

type UploadState = {
  audienceId: string;
  audienceName: string;
  importId?: string;
  progress: number;
  status: "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED";
  workerStatus?: AudienceImportProgress["status"];
  processedRows?: number;
  totalRows?: number;
  failedRows?: number;
};

const AUDIENCE_SEARCH_KEY = "uprise.audience.search";
const FILE_UPLOAD_PROGRESS_WEIGHT = 10;
const SEGMENT_TYPE_LABEL: Record<string, string> = { DYNAMIC: "Dynamic", STATIC: "Static" };

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

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getImportProgress(importProgress: AudienceImportProgress): number {
  if (importProgress.status === "SUCCEEDED" || importProgress.status === "FAILED") return 100;
  if (importProgress.totalRows <= 0) return FILE_UPLOAD_PROGRESS_WEIGHT;
  const processedRatio = Math.max(0, Math.min(1, importProgress.cursor / importProgress.totalRows));
  return clampProgress(FILE_UPLOAD_PROGRESS_WEIGHT + processedRatio * (100 - FILE_UPLOAD_PROGRESS_WEIGHT));
}

function getUploadStatus(importStatus: AudienceImportProgress["status"]): UploadState["status"] {
  if (importStatus === "SUCCEEDED") return "COMPLETED";
  if (importStatus === "FAILED") return "FAILED";
  return "PROCESSING";
}

function getUploadStateFromImport(
  audienceId: string,
  audienceName: string,
  importProgress: AudienceImportProgress,
  previousProgress = 0,
): UploadState {
  const nextProgress = getImportProgress(importProgress);
  return {
    audienceId,
    audienceName,
    importId: importProgress.importId,
    progress: Math.max(previousProgress, nextProgress),
    status: getUploadStatus(importProgress.status),
    workerStatus: importProgress.status,
    processedRows: importProgress.cursor,
    totalRows: importProgress.totalRows,
    failedRows: importProgress.failedRows,
  };
}

function getUploadProgressLabel(uploadState: UploadState): string {
  if (uploadState.status === "FAILED") return "Failed";
  if (uploadState.status === "COMPLETED") return "Import complete";
  if (uploadState.workerStatus === "QUEUED") return "Queued for worker";
  if (uploadState.status === "PROCESSING") return "Processing rows";
  return "Uploading file";
}

function getUploadProgressDetails(uploadState: UploadState): string {
  if (uploadState.totalRows == null) return "";
  const processedRows = uploadState.processedRows ?? 0;
  const failedRows = uploadState.failedRows ?? 0;
  const rowSummary = `${processedRows.toLocaleString()} of ${uploadState.totalRows.toLocaleString()} rows`;
  return failedRows > 0 ? `${rowSummary} (${failedRows.toLocaleString()} failed)` : rowSummary;
}

export default function AudiencePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const filterRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [filter, setFilter] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [audienceName, setAudienceName] = useState("");
  const [newChannel, setNewChannel] = useState<AudienceChannel>("ALL");
  const [creatingSmart, setCreatingSmart] = useState(false);
  const integrationType: "ACTION_NETWORK" = "ACTION_NETWORK";
  const [lists, setLists] = useState<Array<Record<string, unknown>>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [listSearchMessage, setListSearchMessage] = useState("");
  const [listsLoading, setListsLoading] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [tablePage, setTablePage] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncJobs, setSyncJobs] = useState<IntegrationSyncJob[]>([]);
  const [segments, setSegments] = useState<AudienceSegmentRow[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segmentsError, setSegmentsError] = useState("");
  // Guards the sync poll loop so it stops if the user navigates away mid-sync.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSegments = async () => {
    setSegmentsLoading(true);
    const res = await getAudienceSegments();
    if (res.ok) {
      setSegments(res.data);
      setSegmentsError("");
    } else {
      setSegmentsError(res.error);
    }
    setSegmentsLoading(false);
  };

  const refresh = async () => {
    setLoading(true);
    const res = await listAudiences({ limit: 200, offset: 0 });
    if (res.ok) {
      setRows(res.data.rows as AudienceRow[]);
      setLoadingError("");
      setLastUpdatedAt(new Date());
    } else {
      setLoadingError(res.error);
    }
    setLoading(false);
  };

  const loadIntegrationLists = async () => {
    setListsLoading(true);
    const result = await searchIntegrationLists(integrationType, "");
    if (result.ok) {
      setLists(result.data.lists);
      setListPage(0);
      setSelectedListId("");
      setListSearchMessage(
        result.data.lists.length === 0 ? "No remote lists found for this connection." : "",
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
    if (!selectedListId || syncing) return;
    const selectedList = lists.find((list) => String(list.id) === selectedListId);
    const selectedListName = String(selectedList?.name || "").trim();
    const audienceNameForSync = `Action Network: ${selectedListName || "Unnamed list"}`;
    setSyncing(true);
    setSyncMessage("");
    try {
      const synced = await syncIntegrationList({
        type: integrationType,
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
      setSyncMessage(
        `Sync queued${syncJobId ? ` (job ${syncJobId.slice(0, 8)})` : ""}. Tracking progress…`,
      );
      showToast({
        tone: "success",
        title: "Integration sync queued",
        description: "The worker is processing this list — the row below updates live.",
      });

      // The audience is created up-front by the API, so surface the row immediately
      // (with a QUEUED badge), then poll the sync job to a terminal state and reflect
      // success/failure — no more silent "queued and vanished".
      if (audienceId) {
        setRows((prev) =>
          prev.some((r) => r.id === audienceId)
            ? prev
            : [
                {
                  id: audienceId,
                  name: audienceNameForSync,
                  source: "ACTION_NETWORK",
                  status: "QUEUED",
                  channel: "ALL",
                  _count: { contacts: 0 },
                },
                ...prev,
              ],
        );
        const fetchJobs = async (): Promise<IntegrationSyncJob[]> => {
          const res = await getSyncJobs();
          const jobs = res.ok ? res.data : [];
          if (mountedRef.current) setSyncJobs(jobs);
          return jobs;
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
          setSyncMessage(`Synced ${Number(terminal.syncedCount ?? 0)} contacts.`);
          showToast({
            tone: "success",
            title: "Integration sync completed",
            description: `Synced ${Number(terminal.syncedCount ?? 0)} contacts.`,
          });
        }
      }
      await refresh();
      await loadSegments();
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFilter(window.localStorage.getItem(AUDIENCE_SEARCH_KEY) || "");
    }
    refresh();
    loadIntegrationLists();
    loadSegments();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIENCE_SEARCH_KEY, filter);
    }
  }, [filter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      event.preventDefault();
      filterRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = !q ? rows : rows.filter((row) => fuzzyIncludes(`${row.name} ${row.id}`, q));
    if (
      uploadState &&
      !base.some((row) => row.id === uploadState.audienceId) &&
      uploadState.audienceName.toLowerCase().includes(q)
    ) {
      return [
        {
          id: uploadState.audienceId,
          name: uploadState.audienceName,
          source: "CSV",
          status: uploadState.status,
          _count: { contacts: 0 },
        },
        ...base,
      ];
    }
    return base;
  }, [rows, filter, uploadState]);

  const pageSize = 8;
  const paged = filtered.slice(tablePage * pageSize, tablePage * pageSize + pageSize);
  const listPageSize = 10;
  const pagedLists = lists.slice(listPage * listPageSize, listPage * listPageSize + listPageSize);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Audience</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Import subscribers, sync remote lists, and prepare recipients for sends.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="import-audience-card" className="lg:order-2">
          <CardHeader>
            <CardTitle>Import Subscribers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                placeholder="Audience name"
                value={audienceName}
                onChange={(e) => setAudienceName(e.target.value)}
              />
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
              <Select
                value={newChannel}
                onValueChange={(v) => setNewChannel(v as AudienceChannel)}
                title="Which channel this audience is for"
                className="md:w-36"
              >
                <SelectItem value="ALL">Both channels</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              </Select>
              <Button
                onClick={async () => {
                  if (!audienceName.trim()) {
                    setValidationMessage("Audience name is required before upload.");
                    return;
                  }
                  if (!csvFile) {
                    setValidationMessage("Choose a CSV file before upload.");
                    return;
                  }
                  setValidationMessage("");
                  const trimmedName = audienceName.trim();
                  setImportMessage("");
                  const created = await createAudience({ name: trimmedName, source: "CSV", channel: newChannel });
                  if (!created.ok) {
                    setImportMessage(created.error);
                    showToast({
                      tone: "error",
                      title: "Could not create audience",
                      description: created.error,
                    });
                    return;
                  }
                  const audienceId = String((created.data as any).id);
                  setRows((prev) => [
                    {
                      id: audienceId,
                      name: trimmedName,
                      source: "CSV",
                      channel: newChannel,
                      status: "UPLOADING",
                      _count: { contacts: 0 },
                    },
                    ...prev.filter((row) => row.id !== audienceId),
                  ]);
                  setTablePage(0);
                  setUploadState({
                    audienceId,
                    audienceName: trimmedName,
                    progress: 0,
                    status: "UPLOADING",
                  });
                  const imported = await importAudienceCsv(audienceId, csvFile, (percent) => {
                    setUploadState((prev) => {
                      if (!prev || prev.audienceId !== audienceId) return prev;
                      const progress = clampProgress((percent / 100) * FILE_UPLOAD_PROGRESS_WEIGHT);
                      if (percent >= 100) {
                        return {
                          ...prev,
                          status: "PROCESSING",
                          progress: Math.max(prev.progress, FILE_UPLOAD_PROGRESS_WEIGHT),
                        };
                      }
                      return {
                        ...prev,
                        status: "UPLOADING",
                        progress: Math.max(prev.progress, progress),
                      };
                    });
                  });
                  if (imported.ok) {
                    const initialImport = imported.data as AudienceImportProgress;
                    const initialStatus = initialImport.status || "RUNNING";
                    const importId = initialImport.importId || "";
                    setUploadState((prev) => {
                      const previousProgress = prev?.audienceId === audienceId ? prev.progress : 0;
                      return getUploadStateFromImport(
                        audienceId,
                        trimmedName,
                        initialImport,
                        previousProgress,
                      );
                    });

                    let terminal = initialImport;
                    if (importId && initialStatus !== "SUCCEEDED" && initialStatus !== "FAILED") {
                      for (let attempt = 0; attempt < 120; attempt += 1) {
                        await new Promise((resolve) => window.setTimeout(resolve, 1500));
                        const statusRes = await getAudienceImportStatus(audienceId, importId);
                        if (!statusRes.ok) {
                          if (attempt === 119) {
                            setImportMessage(statusRes.error);
                          }
                          continue;
                        }
                        terminal = statusRes.data;
                        const status = terminal.status || "RUNNING";
                        setUploadState((prev) => {
                          if (!prev || prev.audienceId !== audienceId) return prev;
                          return getUploadStateFromImport(
                            audienceId,
                            trimmedName,
                            terminal,
                            prev.progress,
                          );
                        });
                        if (status === "SUCCEEDED" || status === "FAILED") break;
                      }
                    }

                    const terminalStatus = terminal.status || "";
                    if (terminalStatus === "FAILED") {
                      const summary = String(terminal.errorSummary || "Import failed.");
                      setImportMessage(summary);
                      showToast({
                        tone: "error",
                        title: "Audience import failed",
                        description: summary,
                      });
                    } else if (terminalStatus === "SUCCEEDED") {
                      const importedRows = Number(terminal.importedRows || 0);
                      const failedRows = Number(terminal.failedRows || 0);
                      setImportMessage(
                        `Imported ${importedRows.toLocaleString()} subscribers${
                          failedRows > 0 ? ` (${failedRows.toLocaleString()} failed rows)` : ""
                        }.`,
                      );
                      showToast({
                        tone: "success",
                        title: "Audience import completed",
                        description: `${importedRows.toLocaleString()} subscribers imported.`,
                      });
                    } else {
                      setImportMessage("Import is still processing in the background. Refresh to check latest status.");
                    }

                    setAudienceName("");
                    setCsvFile(null);
                    await refresh();
                    if (terminalStatus === "SUCCEEDED" || terminalStatus === "FAILED") {
                      setUploadState(null);
                    }
                  } else {
                    setUploadState((prev) =>
                      prev && prev.audienceId === audienceId
                        ? { ...prev, progress: 100, status: "FAILED" }
                        : prev,
                    );
                    setRows((prev) =>
                      prev.map((row) =>
                        row.id === audienceId ? { ...row, status: "FAILED" } : row,
                      ),
                    );
                    setImportMessage(imported.error);
                    showToast({
                      tone: "error",
                      title: "Audience import failed",
                      description: imported.error,
                    });
                  }
                }}
                disabled={!audienceName.trim() || !csvFile}
              >
                Upload CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected headers: <code>name</code>/<code>full_name</code>/<code>first_name</code> and{" "}
              <code>mobile</code>, plus optional metadata columns.
            </p>
            <a
              href="/examples/subscribers-example.csv"
              download
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Download example CSV
            </a>
            {validationMessage && <p className="text-xs text-error">{validationMessage}</p>}
            {importMessage && <p className="text-xs text-muted-foreground">{importMessage}</p>}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={creatingSmart}
                onClick={async () => {
                  setCreatingSmart(true);
                  const res = await createWhatsappOptInAudience();
                  setCreatingSmart(false);
                  if (!res.ok) {
                    showToast({ tone: "error", title: "Couldn't create smart list", description: res.error });
                    return;
                  }
                  await refresh();
                  showToast({ tone: "success", title: "WhatsApp opt-ins smart list ready" });
                }}
              >
                + WhatsApp opt-ins (smart list)
              </Button>
              <span className="text-xs text-muted-foreground">
                Auto-updates to everyone opted in on WhatsApp.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card id="tour-audience-sync" className="lg:order-1">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Action Network List Sync</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadIntegrationLists} disabled={listsLoading}>
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSyncSelectedList()}
                disabled={!selectedListId || syncing}
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
                        ? `${list.count.toLocaleString()} contacts`
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
                    {listSearchMessage || "No remote lists loaded."}
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
            {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
          </CardContent>
        </Card>
      </div>

      <Card id="tour-audience-table">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Segmented Audiences</CardTitle>
          <div className="flex gap-2">
            <Input
              ref={filterRef}
              placeholder="Filter lists..."
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setTablePage(0);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : loadingError ? (
            <EmptyState
              title="We couldn't load audiences"
              description={loadingError}
              ctaLabel="Retry"
              onCta={() => void refresh()}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="py-2 pr-4">Audience Name</th>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4">Channel</th>
                      <th className="py-2 pr-4">Subscribers</th>
                      <th className="py-2 pr-4">Last Sync</th>
                      <th className="py-2 pr-4">Upload Progress</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergeSyncBadges(paged, syncJobs).map((row) => {
                      const isUploading = uploadState?.audienceId === row.id;
                      const progressPercent = uploadState ? clampProgress(uploadState.progress) : 0;
                      const progressDetails = uploadState ? getUploadProgressDetails(uploadState) : "";
                      return (
                        <tr
                          key={row.id}
                          className="group cursor-pointer border-b border-border/70 hover:bg-primary-container/10"
                          onClick={() => router.push(`/audience/${row.id}`)}
                        >
                          <td className="py-3 pr-4">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                          </td>
                          <td className="py-3 pr-4">{row.source}</td>
                          <td className="py-3 pr-4">
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                                (row.channel === "WHATSAPP"
                                  ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                                  : "bg-surface-variant text-muted-foreground")
                              }
                            >
                              {CHANNEL_LABEL[row.channel ?? "ALL"] ?? "Both"}
                              {row.kind === "WHATSAPP_OPTED_IN" ? " · smart" : ""}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{Number(row._count?.contacts || 0).toLocaleString()}</td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {row.syncedAt ? new Date(row.syncedAt).toLocaleString() : "Never"}
                          </td>
                          <td className="py-3 pr-4">
                            {isUploading ? (
                              <div className="w-44 space-y-1">
                                <div
                                  className="h-2 rounded-full bg-surface-variant"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={progressPercent}
                                  aria-label="Audience import progress"
                                >
                                  {uploadState.status === "FAILED" ? (
                                    <div
                                      className="h-2 rounded-full bg-error transition-all"
                                      style={{ width: "100%" }}
                                    />
                                  ) : (
                                    <div
                                      className={`h-2 rounded-full transition-all ${
                                        uploadState.status === "COMPLETED" ? "bg-success" : "bg-primary"
                                      }`}
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>{getUploadProgressLabel(uploadState)}</span>
                                  <span>{progressPercent}%</span>
                                </div>
                                {progressDetails && (
                                  <p className="text-xs text-muted-foreground">{progressDetails}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              status={isUploading ? uploadState.status : (row.syncBadge ?? row.status)}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/audience/${row.id}`);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {paged.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-muted-foreground">
                          No audiences match your current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {paged.length} of {filtered.length} audiences
                  {lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
                </p>
                <PaginationControls
                  page={tablePage}
                  pageSize={pageSize}
                  total={filtered.length}
                  onPrev={() => setTablePage((p) => Math.max(0, p - 1))}
                  onNext={() => setTablePage((p) => p + 1)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card id="tour-audience-segments">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Dynamic Segments</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadSegments()}
            disabled={segmentsLoading}
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {segmentsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : segmentsError ? (
            <EmptyState
              title="We couldn't load segments"
              description={segmentsError}
              ctaLabel="Retry"
              onCta={() => void loadSegments()}
            />
          ) : segments.length === 0 ? (
            <EmptyState
              title="No segments yet"
              description="Segments are created automatically when you sync a list — sync an Action Network list to see its members resolved here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Segment</th>
                    <th className="py-2 pr-4">Audience</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Members</th>
                    <th className="py-2 pr-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment) => (
                    <tr
                      key={segment.id}
                      className="cursor-pointer border-b border-border/70 hover:bg-primary-container/10"
                      onClick={() => router.push(`/audience/${segment.audienceId}`)}
                    >
                      <td className="py-3 pr-4 font-medium">{segment.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {segment.audienceName ?? "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={SEGMENT_TYPE_LABEL[segment.type] ?? segment.type} />
                      </td>
                      <td className="py-3 pr-4">{segment.memberCount.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {new Date(segment.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
