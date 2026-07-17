"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prompt-first authoring box — plain English in, a filter tree out (AI or keyword fallback). */
export function SegmentPrompt({
  value,
  busy,
  onChange,
  onGenerate,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onGenerate: (value: string) => void;
}) {
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed && !busy) onGenerate(trimmed);
  };

  return (
    <div className="rounded-lg border border-border bg-surface-variant/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">Describe your audience</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          AI builds the filters
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          className="min-h-[3.5rem] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          rows={2}
          placeholder="e.g. Active climate supporters in NSW who have been door knocked this month…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button className="sm:self-end" disabled={busy || !value.trim()} onClick={submit}>
          {busy ? "Building…" : "Build filters"}
        </Button>
      </div>
    </div>
  );
}
