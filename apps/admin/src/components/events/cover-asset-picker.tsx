"use client";

import { useEffect, useState } from "react";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { EmptyState } from "@uprise/ui";
import { listFiles, type StoredFile } from "@/lib/api/files";
import { cn } from "@/lib/utils";

/**
 * "Suggested cover images" — a grid of previously-uploaded event covers (the "event-covers"
 * folder in the /files store), styled like the profile avatar gallery. Selecting a tile sets
 * the cover URL; a fresh upload via ImageCropUpload lands in the same folder and shows up here
 * next time. Four states (loading, error, empty, list) via EmptyState.
 */
export function CoverAssetPicker({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (url: string) => void;
}) {
  const [rows, setRows] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setRows(null);
    void listFiles({ folder: "event-covers", take: 24 }).then((res) => {
      if (res.ok) setRows(res.data.rows);
      else setError(res.error);
    });
  };
  useEffect(load, []);

  if (rows === null && !error) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your cover library…
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState icon={ImageIcon} title="Couldn't load suggested images" description={error} ctaLabel="Retry" onCta={load} />
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No suggested images yet"
        description="Upload a cover above — it's saved to your library and offered here as a suggestion next time."
      />
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {rows.map((f) => {
        const active = value === f.url;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.url)}
            aria-pressed={active}
            title={f.name}
            className={cn(
              "group relative aspect-video overflow-hidden rounded-lg border-2 transition",
              active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
            {active ? (
              <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-white">
                <Check className="h-3 w-3" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
