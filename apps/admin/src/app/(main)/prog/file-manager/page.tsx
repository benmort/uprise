"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, ShieldAlert, Trash2, Upload } from "lucide-react";
import { deleteFile, listFiles, uploadFile, type StoredFile } from "@/lib/api/files";

const card = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileManagerPage() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await listFiles();
    if (res.ok) {
      setFiles(res.data);
    } else if (isPermissionError(res.error)) {
      setDenied(true);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    const res = await uploadFile(file);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      setUploadError(res.error);
      return;
    }
    setFiles((prev) => [res.data, ...prev]);
  }

  async function onRemove(id: string) {
    if (removing) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this file? This can't be undone.")) return;
    setRemoving(id);
    const res = await deleteFile(id);
    setRemoving(null);
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">File Manager</h1>
          <p className="text-gray-600 dark:text-gray-400">Upload, browse and manage your workspace files.</p>
        </div>
        {!denied ? (
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={onUpload} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload file
            </button>
          </>
        ) : null}
      </div>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {uploadError}
        </div>
      ) : null}

      {denied ? (
        <div className={`${card} flex flex-col items-center justify-center px-6 py-16 text-center`}>
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No access</h3>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            You don&apos;t have permission to manage files. Ask a workspace owner or admin.
          </p>
        </div>
      ) : loading ? (
        <div className={`${card} flex items-center justify-center gap-2 px-6 py-16 text-gray-500 dark:text-gray-400`}>
          <Loader2 className="h-5 w-5 animate-spin" /> Loading files…
        </div>
      ) : error ? (
        <div className={`${card} px-6 py-10 text-center`}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary underline">
            Try again
          </button>
        </div>
      ) : files.length === 0 ? (
        <div className={`${card} flex flex-col items-center justify-center px-6 py-16 text-center`}>
          <FileText className="mb-3 h-8 w-8 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No files yet</h3>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">Upload your first file to get started.</p>
        </div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Uploaded</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{f.name}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{f.contentType ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(f.createdAt).toLocaleDateString("en-AU")}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Download className="h-3.5 w-3.5" /> View
                        </a>
                        <button
                          type="button"
                          onClick={() => void onRemove(f.id)}
                          disabled={removing === f.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-900/20"
                        >
                          {removing === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
