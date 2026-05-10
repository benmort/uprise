"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAudience,
  importAudienceCsv,
  listAudiences,
  searchIntegrationLists,
  syncIntegrationList,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type AudienceRow = {
  id: string;
  name: string;
  source: string;
  status: string;
  syncedAt?: string;
  _count?: { contacts: number };
};

type UploadState = {
  audienceId: string;
  audienceName: string;
  progress: number;
  status: "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED";
};

export default function AudiencePage() {
  const router = useRouter();
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [audienceName, setAudienceName] = useState("");
  const integrationType: "ACTION_NETWORK" = "ACTION_NETWORK";
  const [lists, setLists] = useState<Array<Record<string, unknown>>>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [listSearchMessage, setListSearchMessage] = useState("");
  const [listsLoading, setListsLoading] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await listAudiences({ limit: 200, offset: 0 });
    if (res.ok) {
      setRows(res.data.rows as AudienceRow[]);
    }
    setLoading(false);
  };

  const loadIntegrationLists = async () => {
    setListsLoading(true);
    const result = await searchIntegrationLists(integrationType, "");
    if (result.ok) {
      setLists(result.data.lists);
      setSelectedListId("");
      setListSearchMessage(
        result.data.lists.length === 0 ? "No remote lists found for this connection." : "",
      );
    } else {
      setLists([]);
      setSelectedListId("");
      setListSearchMessage(result.error);
    }
    setListsLoading(false);
  };

  useEffect(() => {
    refresh();
    loadIntegrationLists();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = !q ? rows : rows.filter((row) => row.name.toLowerCase().includes(q));
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

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold">Audience Management</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Import Subscribers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
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
              <Button
                onClick={async () => {
                  if (!audienceName.trim() || !csvFile) return;
                  const trimmedName = audienceName.trim();
                  setImportMessage("");
                  const created = await createAudience({ name: trimmedName, source: "CSV" });
                  if (!created.ok) {
                    setImportMessage(created.error);
                    return;
                  }
                  const audienceId = String((created.data as any).id);
                  setRows((prev) => [
                    {
                      id: audienceId,
                      name: trimmedName,
                      source: "CSV",
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
                      if (percent >= 100) {
                        return { ...prev, status: "PROCESSING", progress: 95 };
                      }
                      return {
                        ...prev,
                        status: "UPLOADING",
                        progress: Math.max(prev.progress, percent),
                      };
                    });
                  });
                  if (imported.ok) {
                    const importedRows = Number((imported.data as any)?.importedRows || 0);
                    setUploadState({
                      audienceId,
                      audienceName: trimmedName,
                      progress: 100,
                      status: "COMPLETED",
                    });
                    setImportMessage(`Imported ${importedRows.toLocaleString()} subscribers.`);
                    setAudienceName("");
                    setCsvFile(null);
                    await refresh();
                    setUploadState(null);
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
            {importMessage && <p className="text-xs text-muted-foreground">{importMessage}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Sync Integrations</CardTitle>
            <Button size="sm" variant="outline" onClick={loadIntegrationLists} disabled={listsLoading}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-36 overflow-y-auto rounded border border-border">
              {lists.map((list) => (
                <button
                  key={String(list.id)}
                  type="button"
                  className={`flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 ${
                    selectedListId === String(list.id) ? "bg-primary-container/30" : ""
                  }`}
                  onClick={() => setSelectedListId(String(list.id))}
                >
                  <span>{String(list.name || "Unnamed list")}</span>
                  <span className="text-xs text-muted-foreground">{String(list.count || "—")}</span>
                </button>
              ))}
              {lists.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {listsLoading ? "Loading remote lists..." : listSearchMessage || "No remote lists loaded."}
                </p>
              )}
            </div>
            <Button
              onClick={async () => {
                if (!selectedListId) return;
                const selectedList = lists.find((list) => String(list.id) === selectedListId);
                const selectedListName = String(selectedList?.name || "").trim();
                const audienceNameForSync =
                  integrationType === "ACTION_NETWORK"
                    ? `Action Network: ${selectedListName || "Unnamed list"}`
                    : `${integrationType === "ACTION_NETWORK" ? "Action Network" : "Internal"}: ${selectedListName || selectedListId}`;
                const synced = await syncIntegrationList({
                  type: integrationType,
                  listId: selectedListId,
                  listName: selectedListName || undefined,
                  audienceName: audienceNameForSync,
                });
                if (synced.ok) {
                  const stats = (synced.data as any).stats as Record<string, unknown> | undefined;
                  const skippedNoPhone = Number((stats?.skippedNoPhone as number) || 0);
                  const skippedInvalidPhone = Number((stats?.skippedInvalidPhone as number) || 0);
                  const nonContactableTotal = skippedNoPhone + skippedInvalidPhone;
                  setSyncMessage(
                    `Synced ${String((synced.data as any).syncedCount)} contacts${
                      nonContactableTotal > 0 ? ` (${nonContactableTotal} marked non-contactable)` : ""
                    }`,
                  );
                  await refresh();
                } else {
                  setSyncMessage(synced.error);
                }
              }}
              disabled={!selectedListId}
            >
              Sync Selected List
            </Button>
            {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Segmented Audiences</CardTitle>
          <div className="flex gap-2">
            <Input
              placeholder="Filter lists..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading audiences...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="py-2 pr-4">Audience Name</th>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4">Subscribers</th>
                      <th className="py-2 pr-4">Last Sync</th>
                      <th className="py-2 pr-4">Upload Progress</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row) => {
                      const isUploading = uploadState?.audienceId === row.id;
                      return (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b border-border/70 hover:bg-primary-container/10"
                          onClick={() => router.push(`/audience/${row.id}`)}
                        >
                          <td className="py-3 pr-4">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                          </td>
                          <td className="py-3 pr-4">{row.source}</td>
                          <td className="py-3 pr-4">{Number(row._count?.contacts || 0).toLocaleString()}</td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {row.syncedAt ? new Date(row.syncedAt).toLocaleString() : "Never"}
                          </td>
                          <td className="py-3 pr-4">
                            {isUploading ? (
                              <div className="w-36 space-y-1">
                                <div className="h-2 rounded-full bg-surface-variant">
                                  <div
                                    className={`h-2 rounded-full transition-all ${
                                      uploadState.status === "FAILED" ? "bg-error" : "bg-primary"
                                    }`}
                                    style={{ width: `${Math.max(4, uploadState.progress)}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {uploadState.status === "PROCESSING"
                                    ? "Processing..."
                                    : uploadState.status === "FAILED"
                                      ? "Failed"
                                      : `${uploadState.progress}%`}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={isUploading ? uploadState.status : row.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {paged.length} of {filtered.length} audiences
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tablePage === 0}
                    onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(tablePage + 1) * pageSize >= filtered.length}
                    onClick={() => setTablePage((p) => p + 1)}
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
