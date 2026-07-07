"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  FileText,
  Database,
  Folder,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import {
  deleteFile,
  getFilesSummary,
  listFiles,
  uploadFile,
  type FileCategoryKey,
  type StoredFile,
} from "@/lib/api/files";
import { useApi, invalidateApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

/** Prog's file-manager chrome (media tiles / folder grid / storage donut /
 *  recent table), token-clean and wired to the real files API. */

const card = "rounded-2xl border border-border bg-surface";

const PAGE_SIZE = 8;
/** The API caps list pages at 100 rows – search covers the most recent page of that size. */
const SEARCH_WINDOW = 100;
/** API sentinel selecting unfoldered files (folder IS NULL); shown as "Uncategorised". */
const UNFOLDERED = "__none__";

/** The user-facing name of the active folder filter. */
function folderLabel(folder: string): string {
  return folder === UNFOLDERED ? "Uncategorised" : folder;
}

const CATEGORY_META: Record<
  FileCategoryKey,
  { label: string; icon: typeof ImageIcon; tile: string; text: string; colour: string }
> = {
  image: { label: "Images", icon: ImageIcon, tile: "bg-success-container text-success", text: "text-success", colour: "var(--color-success)" },
  video: { label: "Videos", icon: Video, tile: "bg-error-container text-error", text: "text-error", colour: "var(--color-error)" },
  audio: { label: "Audio", icon: Music, tile: "bg-primary-container text-primary", text: "text-primary", colour: "var(--color-primary)" },
  document: { label: "Documents", icon: FileText, tile: "bg-warning-container text-warning", text: "text-warning", colour: "var(--color-warning)" },
  other: { label: "Other", icon: HardDrive, tile: "bg-surface-variant text-muted-foreground", text: "text-muted-foreground", colour: "var(--color-muted-foreground)" },
};

/** Mirrors the API's categoriseContentType so row icons match the summary buckets. */
function categorise(contentType: string | null): FileCategoryKey {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (ct === "application/pdf" || ct === "application/msword" || ct.startsWith("application/vnd.") || ct.startsWith("text/")) {
    return "document";
  }
  return "other";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Multi-segment donut over real per-category bytes (prog's chart was a static two-circle mock). */
function StorageDonut({
  segments,
  totalBytes,
  totalCount,
}: {
  segments: Array<{ key: FileCategoryKey; bytes: number }>;
  totalBytes: number;
  totalCount: number;
}) {
  const C = 2 * Math.PI * 40;
  let cum = 0;
  return (
    <div className="relative mx-auto h-56 w-56">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">{formatBytes(totalBytes)}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {totalCount.toLocaleString()} file{totalCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-border)" strokeWidth="8" />
        {segments
          .filter((s) => s.bytes > 0)
          .map((s) => {
            const frac = totalBytes > 0 ? s.bytes / totalBytes : 0;
            const el = (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={CATEGORY_META[s.key].colour}
                strokeWidth="8"
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-cum * C}
              />
            );
            cum += frac;
            return el;
          })}
      </svg>
    </div>
  );
}

export default function FileManagerPage() {
  const { showToast } = useToast();

  // ── Filters: active folder + debounced search ───────────────────────────────
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [activeFolder, q]);

  // Folders created this session that have no files yet (they materialise
  // server-side on first upload – the folder column is per-file).
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);

  // ── Data: summary (tiles/folders/storage) + the file list ──────────────────
  const summary = useApi("/files/summary", () => getFilesSummary(), { ttlMs: 30_000 });
  const folderParam = activeFolder ? `&folder=${encodeURIComponent(activeFolder)}` : "";
  // Searching swaps to one bounded window (the API has no name filter);
  // otherwise the table pages on the server.
  const listKey = q
    ? `/files?take=${SEARCH_WINDOW}${folderParam}`
    : `/files?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}${folderParam}`;
  const list = useApi(
    listKey,
    () =>
      q
        ? listFiles({ take: SEARCH_WINDOW, ...(activeFolder ? { folder: activeFolder } : {}) })
        : listFiles({ take: PAGE_SIZE, skip: page * PAGE_SIZE, ...(activeFolder ? { folder: activeFolder } : {}) }),
    { ttlMs: 30_000 },
  );

  const filtered = useMemo(() => {
    const rows = list.data?.rows ?? [];
    return q ? rows.filter((f) => f.name.toLowerCase().includes(q)) : rows;
  }, [list.data, q]);
  const pageRows = q ? filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : filtered;
  const tableTotal = q ? filtered.length : (list.data?.total ?? 0);

  // Clamp the page when the total shrinks (e.g. deleting the last row of the
  // final page) – otherwise the table strands on an empty overshot page. Only
  // with data present: mid-fetch the new key briefly reports 0 total.
  useEffect(() => {
    if (!list.data) return;
    const lastPage = Math.max(0, Math.ceil(tableTotal / PAGE_SIZE) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [list.data, tableTotal, page]);

  // ── Mutations: upload (folder-aware) + delete ───────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    // Filtering by Uncategorised means "no folder" – never send the sentinel.
    const uploadFolder = activeFolder && activeFolder !== UNFOLDERED ? activeFolder : undefined;
    setUploading(true);
    const res = await uploadFile(file, uploadFolder);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      showToast({ tone: "error", title: "Upload failed", description: res.error });
      return;
    }
    if (uploadFolder) setPendingFolders((cur) => cur.filter((f) => f !== uploadFolder));
    invalidateApi("/files"); // list pages + summary are stale now
    showToast({
      tone: "success",
      title: `Uploaded ${res.data.name}`,
      description: uploadFolder ? `Into “${uploadFolder}”.` : undefined,
    });
  }

  async function onRemove(file: StoredFile) {
    if (removing) return;
    if (!window.confirm(`Delete “${file.name}”? This can't be undone.`)) return;
    setRemoving(file.id);
    const res = await deleteFile(file.id);
    setRemoving(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete file", description: res.error });
      return;
    }
    invalidateApi("/files");
    showToast({ tone: "success", title: `Deleted ${file.name}` });
  }

  function onNewFolder() {
    const name = window.prompt("Folder name (letters, numbers, spaces, dashes and underscores):")?.trim();
    if (!name) return;
    if (name.length > 64 || !/^[A-Za-z0-9 _-]+$/.test(name)) {
      showToast({
        tone: "error",
        title: "Invalid folder name",
        description: "Use up to 64 letters, numbers, spaces, dashes or underscores.",
      });
      return;
    }
    setPendingFolders((cur) => (cur.includes(name) ? cur : [...cur, name]));
    setActiveFolder(name);
    showToast({ tone: "success", title: `Folder “${name}” ready`, description: "Upload a file to keep it." });
  }

  const denied = summary.noPermission || list.noPermission;
  const categories = summary.data?.categories ?? [];
  const totalBytes = summary.data?.totalBytes ?? 0;
  // Real folders from the summary + this session's not-yet-uploaded ones.
  const folders = useMemo(() => {
    const real = (summary.data?.folders ?? []).filter((f) => f.folder !== "Uncategorised");
    const uncategorised = (summary.data?.folders ?? []).find((f) => f.folder === "Uncategorised");
    const pending = pendingFolders
      .filter((name) => !real.some((f) => f.folder === name))
      .map((name) => ({ folder: name, count: 0, bytes: 0 }));
    return { real: [...real, ...pending], uncategorised };
  }, [summary.data, pendingFolders]);

  return (
    <div className="page-stack">
      <PageHeader
        title="File Manager"
        icon={Database}
        breadcrumbs={[
          { label: "Data Sets", href: "/data/datasets" },
          { label: "File Manager" },
        ]}
      />

      {denied ? (
        <StateRegion noPermission>
          <span />
        </StateRegion>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* All Media */}
          <div className="col-span-12">
            <div className={card}>
              <div className="px-4 py-4 sm:pl-6 sm:pr-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-foreground">All Media</h3>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <SearchInput
                      placeholder="Search files…"
                      value={search}
                      onValueChange={setSearch}
                      className="h-11 w-full rounded-lg xl:w-[300px]"
                      aria-label="Search files by name"
                    />
                    <input ref={inputRef} type="file" className="hidden" onChange={onUpload} />
                    <Button
                      className="h-11 gap-2 px-4"
                      disabled={uploading}
                      onClick={() => inputRef.current?.click()}
                      title={
                        activeFolder && activeFolder !== UNFOLDERED
                          ? `Uploads into “${activeFolder}”`
                          : "Uploads without a folder"
                      }
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                      Upload File
                    </Button>
                  </div>
                </div>
              </div>

              {/* Media type tiles – real per-category counts/bytes/usage */}
              <div className="border-t border-border p-4 sm:p-6">
                {summary.loading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />
                    ))}
                  </div>
                ) : summary.error ? (
                  <EmptyState title="Couldn't load storage summary" description={summary.error} ctaLabel="Try again" onCta={() => void summary.refetch()} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                    {categories.map((c) => {
                      const meta = CATEGORY_META[c.key];
                      const pct = totalBytes > 0 ? Math.round((c.bytes / totalBytes) * 100) : 0;
                      return (
                        <div key={c.key} className="flex items-center justify-between rounded-2xl border border-border bg-surface py-4 pl-4 pr-4 xl:pr-5">
                          <div className="flex items-center gap-4">
                            <div className={cn("flex h-[52px] w-[52px] items-center justify-center rounded-xl", meta.tile)}>
                              <meta.icon className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="mb-1 text-sm font-medium text-foreground">{meta.label}</h4>
                              <span className="block text-sm text-muted-foreground">{pct}% used</span>
                            </div>
                          </div>
                          <div>
                            <span className="mb-1 block text-right text-sm text-muted-foreground">
                              {c.count.toLocaleString()} file{c.count === 1 ? "" : "s"}
                            </span>
                            <span className="block text-right text-sm text-muted-foreground">{formatBytes(c.bytes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* All Folders */}
          <div className="col-span-12 xl:col-span-8">
            <div className={card}>
              <div className="px-4 py-4 sm:pl-6 sm:pr-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-foreground">All Folders</h3>
                  {activeFolder ? (
                    <button
                      type="button"
                      onClick={() => setActiveFolder(null)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Filtering by “{folderLabel(activeFolder)}” – show all files
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground">Click a folder to filter · uploads land in the selected folder</span>
                  )}
                </div>
              </div>

              <div className="border-t border-border p-5 sm:p-6">
                {summary.loading ? (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-[132px] w-full rounded-2xl" />
                    ))}
                  </div>
                ) : summary.error ? (
                  <EmptyState
                    title="Couldn't load folders"
                    description={summary.error}
                    ctaLabel="Try again"
                    onCta={() => void summary.refetch()}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                    {folders.real.map((f) => (
                      <button
                        key={f.folder}
                        type="button"
                        aria-pressed={activeFolder === f.folder}
                        onClick={() => setActiveFolder(activeFolder === f.folder ? null : f.folder)}
                        className={cn(
                          "rounded-2xl border px-6 py-6 text-left transition",
                          activeFolder === f.folder
                            ? "border-primary bg-primary/10 dark:bg-primary/20"
                            : "border-border bg-surface-variant/40 hover:bg-surface-variant",
                        )}
                      >
                        <div className="mb-6 flex justify-between">
                          <Folder className="h-9 w-9 text-warning" />
                        </div>
                        <h4 className="mb-1 text-sm font-medium text-foreground">{f.folder}</h4>
                        <div className="flex items-center justify-between">
                          <span className="block text-sm text-muted-foreground">
                            {f.count.toLocaleString()} file{f.count === 1 ? "" : "s"}
                          </span>
                          <span className="block text-right text-sm text-muted-foreground">{formatBytes(f.bytes)}</span>
                        </div>
                      </button>
                    ))}
                    {folders.uncategorised ? (
                      <button
                        type="button"
                        aria-pressed={activeFolder === UNFOLDERED}
                        onClick={() => setActiveFolder(activeFolder === UNFOLDERED ? null : UNFOLDERED)}
                        className={cn(
                          "rounded-2xl border px-6 py-6 text-left transition",
                          activeFolder === UNFOLDERED
                            ? "border-primary bg-primary/10 dark:bg-primary/20"
                            : "border-border bg-surface-variant/40 hover:bg-surface-variant",
                        )}
                      >
                        <div className="mb-6 flex justify-between">
                          <Folder className="h-9 w-9 text-muted-foreground" />
                        </div>
                        <h4 className="mb-1 text-sm font-medium text-foreground">Uncategorised</h4>
                        <div className="flex items-center justify-between">
                          <span className="block text-sm text-muted-foreground">
                            {folders.uncategorised.count.toLocaleString()} file{folders.uncategorised.count === 1 ? "" : "s"}
                          </span>
                          <span className="block text-right text-sm text-muted-foreground">
                            {formatBytes(folders.uncategorised.bytes)}
                          </span>
                        </div>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onNewFolder}
                      className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                    >
                      <FolderPlus className="h-8 w-8" />
                      <span className="text-sm font-medium">New folder</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Storage Details */}
          <div className="col-span-12 xl:col-span-4">
            <div className={cn(card, "px-4 pb-6 pt-6 sm:px-6")}>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">Storage Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.data ? `${formatBytes(totalBytes)} used across ${folders.real.length + (folders.uncategorised ? 1 : 0)} folder${folders.real.length + (folders.uncategorised ? 1 : 0) === 1 ? "" : "s"}` : "–"}
                </p>
              </div>
              {summary.loading ? (
                <Skeleton className="mx-auto h-56 w-56 rounded-full" />
              ) : summary.error ? (
                <p className="text-sm text-error">{summary.error}</p>
              ) : (
                <>
                  <StorageDonut
                    segments={categories.map((c) => ({ key: c.key, bytes: c.bytes }))}
                    totalBytes={totalBytes}
                    totalCount={summary.data?.totalCount ?? 0}
                  />
                  <div className="mt-4 space-y-2">
                    {categories.map((c) => (
                      <div key={c.key} className="flex items-center gap-2 text-sm">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CATEGORY_META[c.key].colour }} />
                        <span className="text-muted-foreground">{CATEGORY_META[c.key].label}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">{formatBytes(c.bytes)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Recent Files */}
          <div className="col-span-12">
            <div className={cn(card, "overflow-hidden pt-4")}>
              <div className="mb-4 flex items-center justify-between px-6">
                <h3 className="text-lg font-semibold text-foreground">
                  {activeFolder ? `Files in “${folderLabel(activeFolder)}”` : "Recent Files"}
                </h3>
                {q && (list.data?.total ?? 0) > SEARCH_WINDOW ? (
                  <span className="text-xs text-muted-foreground">
                    Searching the {SEARCH_WINDOW} most recent files
                  </span>
                ) : null}
              </div>

              <StateRegion
                loading={list.loading}
                error={list.error}
                onRetry={() => void list.refetch()}
                empty={pageRows.length === 0}
                emptyTitle={q ? `No files match “${search.trim()}”` : activeFolder ? "This folder is empty" : "No files yet"}
                emptyDescription={q ? "Try a different name." : "Upload your first file to get started."}
                skeleton={
                  <div className="space-y-2 px-6 pb-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                }
              >
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr className="border-t border-border">
                        <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">File Name</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Folder</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Size</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Uploaded</th>
                        <th className="px-6 py-3 text-center text-sm font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((f) => {
                        const key = categorise(f.contentType);
                        const meta = CATEGORY_META[key];
                        return (
                          <tr key={f.id} className="border-t border-border/60">
                            <td className="px-6 py-[18px] text-sm text-foreground">
                              <div className="flex items-center gap-2">
                                <meta.icon className={cn("h-5 w-5 shrink-0", meta.text)} />
                                <span className="truncate font-medium">{f.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-[18px] text-sm text-muted-foreground">{meta.label}</td>
                            <td className="px-6 py-[18px] text-sm text-muted-foreground">{f.folder ?? "–"}</td>
                            <td className="px-6 py-[18px] text-sm tabular-nums text-muted-foreground">{formatBytes(f.sizeBytes)}</td>
                            <td className="px-6 py-[18px] text-sm text-muted-foreground">{formatDate(f.createdAt)}</td>
                            <td className="px-6 py-[18px] text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void onRemove(f)}
                                  disabled={removing === f.id}
                                  className="text-muted-foreground hover:text-error disabled:opacity-50"
                                  aria-label={`Delete ${f.name}`}
                                >
                                  {removing === f.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                                </button>
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label={`View ${f.name}`}
                                >
                                  <Eye className="h-5 w-5" />
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {pageRows.length} of {tableTotal.toLocaleString()} file{tableTotal === 1 ? "" : "s"}
                  </p>
                  <PaginationControls
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={tableTotal}
                    onPrev={() => setPage((p) => Math.max(0, p - 1))}
                    onNext={() => setPage((p) => p + 1)}
                  />
                </div>
              </StateRegion>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
