"use client";

import { useRef, useState } from "react";
import { Music, Trash2, Upload } from "lucide-react";
import { deleteFile, listFiles, uploadFile, type StoredFile } from "@/lib/api/files";
import { useApi, invalidateApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

const FOLDER = "autodialer";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The dialler's audio library — recordings the campaign editor's prompt fields
 * pick from (tenant file storage, folder "autodialer"). Optional by design:
 * every prompt speaks its text when no recording is chosen.
 */
export default function AutodialerPromptsPage() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const list = useApi(`/files|${FOLDER}`, () => listFiles({ folder: FOLDER, take: 200 }), { ttlMs: 10_000 });
  const rows = (list.data?.rows ?? []).filter((f) => (f.contentType ?? "").startsWith("audio/"));

  const onUpload = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (!file.type.startsWith("audio/")) {
      showToast({ tone: "error", title: "Not an audio file", description: "Upload MP3, WAV or OGG recordings." });
      return;
    }
    setUploading(true);
    const res = await uploadFile(file, FOLDER);
    setUploading(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Upload failed", description: res.error });
      return;
    }
    showToast({ tone: "success", title: `Uploaded ${file.name}` });
    invalidateApi(`/files|${FOLDER}`);
    void list.refetch();
  };

  const onDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const res = await deleteFile(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete recording", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Recording deleted" });
    invalidateApi(`/files|${FOLDER}`);
    void list.refetch();
  };

  return (
    <PageShell
      icon={Music}
      title="Audio prompts"
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1.5 h-4 w-4" />
            {uploading ? "Uploading…" : "Upload recording"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Recordings for campaign intros, outros and survey questions. Optional — any prompt without a
        recording speaks its text instead. Deleting a recording a live campaign still references
        makes that prompt fall back to its spoken text.
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? "recording"}?`}
        description="Campaign prompts that reference it will fall back to their spoken text."
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void onDelete()}
      />

      <StateRegion
        loading={list.loading}
        error={list.error}
        noPermission={list.noPermission}
        onRetry={() => void list.refetch()}
        empty={!list.loading && rows.length === 0}
        emptyTitle="No recordings yet"
        emptyDescription="Upload MP3/WAV recordings for your campaign prompts — or just let them speak their text."
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((file) => (
            <Card key={file.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${file.name}`}
                  onClick={() => setPendingDelete(file)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- campaign audio has no captions */}
              <audio controls preload="none" src={file.url} className="w-full" />
              <p className="text-xs text-muted-foreground">
                {formatSize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}
              </p>
            </Card>
          ))}
        </div>
      </StateRegion>
    </PageShell>
  );
}
