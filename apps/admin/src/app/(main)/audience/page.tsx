"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createAudience,
  createWhatsappOptInAudience,
  getAudienceImportStatus,
  getAudienceSegments,
  getSyncJobs,
  importAudienceCsv,
  listAudiences,
  type AudienceChannel,
  type AudienceImportProgress,
  type AudienceSegmentRow,
} from "@/lib/api";
import { mergeSyncBadges, type IntegrationSyncJob } from "@/lib/audience-sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AudienceHeader } from "@/components/audience/audience-header";
import { AudienceTabs, resolveAudienceTab } from "@/components/audience/audience-tabs";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fuzzyIncludes } from "@/lib/fuzzy";
import { Split } from "lucide-react";
import Link from "next/link";
import { useFlag } from "@/components/flags/flags-provider";
import { DataTable, ListFooter } from "@uprise/ui";

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
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const segmentsEnabled = useFlag("FEATURE_SEGMENTS_ENABLED");
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [filter, setFilter] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [audienceName, setAudienceName] = useState("");
  const [newChannel, setNewChannel] = useState<AudienceChannel>("ALL");
  const [creatingSmart, setCreatingSmart] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [syncJobs, setSyncJobs] = useState<IntegrationSyncJob[]>([]);
  const [segments, setSegments] = useState<AudienceSegmentRow[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segmentsError, setSegmentsError] = useState("");

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFilter(window.localStorage.getItem(AUDIENCE_SEARCH_KEY) || "");
    }
    refresh();
    loadSegments();
    // The pull flow lives on /audience/sync now, but its jobs badge the table rows here —
    // one fetch on load keeps a QUEUED/SYNCING/FAILED audience honest after navigating back.
    void getSyncJobs().then((res) => {
      if (res.ok) setSyncJobs(res.data);
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIENCE_SEARCH_KEY, filter);
    }
  }, [filter]);


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

  const tab = resolveAudienceTab(searchParams.get("tab"));

  // Data sync graduated to its own route; the legacy `?tab=sync` URL (old bookmarks, the
  // tour anchor) lands there rather than on a missing tab.
  useEffect(() => {
    if (tab === "sync") router.replace("/audience/sync");
  }, [tab, router]);

  const pageSize = 8;
  const paged = filtered.slice(tablePage * pageSize, tablePage * pageSize + pageSize);

  if (tab === "sync") {
    return (
      <div className="page-stack">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AudienceHeader />

      <AudienceTabs active={tab} />

      <div className="grid gap-4">
        {tab === "import" ? (
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
        ) : null}
      </div>

      {tab === "audiences" ? (
      <Card id="tour-audience-table">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Segmented Audiences</CardTitle>
          <div className="flex gap-2">
            <SearchInput
              focusKey="/"
              placeholder="Filter lists..."
              value={filter}
              onValueChange={(v) => {
                setFilter(v);
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
              <DataTable
                aria-label="Audiences"
                rows={mergeSyncBadges(paged, syncJobs)}
                rowKey={(row) => row.id}
                pageSize={0}
                onRowClick={(row) => router.push(`/audience/${row.id}`)}
                empty="No audiences match your current filters."
                columns={[
                  {
                    key: "name",
                    header: "Audience Name",
                    cell: (row) => (
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                      </div>
                    ),
                  },
                  { key: "source", header: "Source", cell: (row) => row.source },
                  {
                    key: "channel",
                    header: "Channel",
                    cell: (row) => (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (row.channel === "WHATSAPP"
                            ? "bg-success/15 text-success"
                            : "bg-surface-variant text-muted-foreground")
                        }
                      >
                        {CHANNEL_LABEL[row.channel ?? "ALL"] ?? "Both"}
                        {row.kind === "WHATSAPP_OPTED_IN" ? " · smart" : ""}
                      </span>
                    ),
                  },
                  {
                    key: "subscribers",
                    header: "Subscribers",
                    cell: (row) => Number(row._count?.contacts || 0).toLocaleString(),
                  },
                  {
                    key: "synced",
                    header: "Last Sync",
                    cell: (row) => (
                      <span className="text-muted-foreground">
                        {row.syncedAt ? new Date(row.syncedAt).toLocaleString() : "Never"}
                      </span>
                    ),
                  },
                  {
                    key: "progress",
                    header: "Upload Progress",
                    cell: (row) => {
                      const isUploading = uploadState?.audienceId === row.id;
                      if (!isUploading || !uploadState) return <span className="text-xs text-muted-foreground">—</span>;
                      const progressPercent = clampProgress(uploadState.progress);
                      const progressDetails = getUploadProgressDetails(uploadState);
                      return (
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
                              <div className="h-2 rounded-full bg-error transition-all" style={{ width: "100%" }} />
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
                          {progressDetails && <p className="text-xs text-muted-foreground">{progressDetails}</p>}
                        </div>
                      );
                    },
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={
                          uploadState?.audienceId === row.id ? uploadState.status : (row.syncBadge ?? row.status)
                        }
                      />
                    ),
                  },
                  {
                    key: "actions",
                    header: "Quick Actions",
                    cell: (row) => (
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
                    ),
                  },
                ]}
              />
              <ListFooter
                shown={paged.length}
                total={filtered.length}
                noun="audiences"
                suffix={lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
                page={tablePage}
                pageSize={pageSize}
                onPrev={() => setTablePage((p) => Math.max(0, p - 1))}
                onNext={() => setTablePage((p) => p + 1)}
              />
            </>
          )}
        </CardContent>
      </Card>
      ) : null}

      {tab === "searches" ? (
      <Card id="tour-audience-segments">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Searches</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadSegments()}
              disabled={segmentsLoading}
            >
              Refresh
            </Button>
            {segmentsEnabled && (
              <Button asChild size="sm">
                <Link href="/audience/segments/new">
                  <Split className="mr-1.5 h-4 w-4" /> New search
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {segmentsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : segmentsError ? (
            <EmptyState
              title="We couldn't load searches"
              description={segmentsError}
              ctaLabel="Retry"
              onCta={() => void loadSegments()}
            />
          ) : segments.length === 0 ? (
            <EmptyState
              title="No searches yet"
              description="Build a reusable audience definition — by location, tags, activity or plain English. Segments synced from a list also appear here."
              ctaLabel={segmentsEnabled ? "Build a search" : undefined}
              onCta={segmentsEnabled ? () => router.push("/audience/segments/new") : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Search</th>
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
      ) : null}
    </div>
  );
}
