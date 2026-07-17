"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "New event" slide-over — replicated from the approved calendar mock: a
 * right-hand panel over a dimmed calendar with Title, a three-chip Type picker
 * (Event / Shift / Reminder in the category colours), the pinned Date and an
 * optional free-text Time ("10:00 – 12:00"). The host owns persistence: on Add
 * it receives the draft and creates the matching real object (events.Event,
 * a GENERAL Shift, or a CalendarEntry reminder).
 */

export type AddItemKind = "event" | "shift" | "entry";

export interface AddItemDraft {
  kind: AddItemKind;
  title: string;
  /** The calendar day the add was launched from. */
  date: { y: number; m: number; d: number };
  /** Raw optional time text, e.g. "10:00 – 12:00" (empty = all day). */
  time: string;
}

const TYPES: Array<{ kind: AddItemKind; label: string; accent: string }> = [
  { kind: "event", label: "Event", accent: "#10b981" },
  { kind: "shift", label: "Shift", accent: "#465fff" },
  { kind: "entry", label: "Reminder", accent: "#f43f5e" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function AddItemPanel({
  open,
  date,
  busy,
  onClose,
  onAdd,
}: {
  open: boolean;
  date: { y: number; m: number; d: number };
  busy?: boolean;
  onClose: () => void;
  onAdd: (draft: AddItemDraft) => void;
}) {
  const [kind, setKind] = useState<AddItemKind>("event");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  // Fresh draft each open; Escape closes; lock body scroll while up.
  useEffect(() => {
    if (!open) return;
    setKind("event");
    setTitle("");
    setTime("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const submit = () => {
    if (!title.trim() || busy) return;
    onAdd({ kind, title: title.trim(), date, time: time.trim() });
  };

  return createPortal(
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="New event"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-[520px] flex-col bg-surface shadow-2xl">
        <div className="flex items-start justify-between px-7 pb-2 pt-7">
          <h2 className="text-2xl font-extrabold text-foreground">New event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-variant text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-7 py-4">
          <div>
            <label htmlFor="add-item-title" className="mb-2 block text-sm font-semibold text-foreground">
              Title
            </label>
            <input
              id="add-item-title"
              autoFocus
              value={title}
              placeholder="What's happening?"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          <div>
            <span className="mb-2 block text-sm font-semibold text-foreground">Type</span>
            <div className="flex gap-2.5">
              {TYPES.map((t) => {
                const on = kind === t.kind;
                return (
                  <button
                    key={t.kind}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setKind(t.kind)}
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all",
                      on ? "text-foreground" : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                    style={
                      on
                        ? {
                            borderColor: t.accent,
                            borderWidth: 1.5,
                            background: `color-mix(in srgb, ${t.accent} 10%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: t.accent }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-semibold text-foreground">Date</span>
            <div className="flex h-12 items-center gap-2.5 rounded-xl bg-surface-variant px-4 text-[15px] text-foreground">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {date.d} {MONTHS[date.m]} {date.y}
            </div>
          </div>

          <div>
            <label htmlFor="add-item-time" className="mb-2 block text-sm font-semibold text-foreground">
              Time <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="add-item-time"
              value={time}
              placeholder="e.g. 10:00 – 12:00"
              onChange={(e) => setTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-surface-variant px-5 text-sm font-semibold text-foreground transition-colors hover:bg-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim() || busy}
            onClick={submit}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add event"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Parse the optional free-text time ("10:00 – 12:00", "10:00-12", "10am") into
 * start/end Dates on the given day. Empty/unparseable → all-day (00:00–23:59).
 */
export function draftWindow(draft: AddItemDraft): { startsAt: Date; endsAt: Date; allDay: boolean } {
  const { y, m, d } = draft.date;
  const parseOne = (raw: string): { h: number; min: number } | null => {
    const t = raw.trim().toLowerCase();
    const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
    if (!match) return null;
    let h = Number(match[1]);
    const min = Number(match[2] ?? 0);
    if (match[3] === "pm" && h < 12) h += 12;
    if (match[3] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { h, min };
  };
  const parts = draft.time.split(/[–—-]|to/i).map((p) => p.trim()).filter(Boolean);
  const start = parts[0] ? parseOne(parts[0]) : null;
  if (!start) {
    return { startsAt: new Date(y, m, d, 0, 0), endsAt: new Date(y, m, d, 23, 59), allDay: true };
  }
  const end = parts[1] ? parseOne(parts[1]) : null;
  const startsAt = new Date(y, m, d, start.h, start.min);
  const endsAt = end ? new Date(y, m, d, end.h, end.min) : new Date(y, m, d, start.h + 1, start.min);
  return { startsAt, endsAt, allDay: false };
}
