"use client";

import { useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { Button, cn } from "@uprise/ui";

export type CannedPick = {
  id: string;
  title: string;
  body: string;
  dispositionCode?: string | null;
};

/**
 * Canned-reply picker for a texter (or a door canvasser). Canned responses are
 * authored but were never surfaced at runtime — this is where they reach the person
 * in the conversation. Presentational: the host supplies the list and handles the
 * pick (insert into the draft, or send + log the mapped disposition).
 */
export function CannedResponsePicker({
  responses,
  onPick,
  disabled,
  buttonLabel = "Canned replies",
  className,
}: {
  responses: CannedPick[];
  onPick: (r: CannedPick) => void;
  disabled?: boolean;
  buttonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (responses.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5"
      >
        <MessageSquareText className="h-4 w-4" />
        {buttonLabel}
      </Button>

      {open ? (
        <div className="absolute bottom-full z-20 mb-2 max-h-72 w-80 max-w-[85vw] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-elevated">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Canned replies</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {responses.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                }}
                className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-variant"
              >
                <span className="block text-sm font-semibold text-foreground">{r.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.body}</span>
                {r.dispositionCode ? (
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    logs {r.dispositionCode.replaceAll("_", " ")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
