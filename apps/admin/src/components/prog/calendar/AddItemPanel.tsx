"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "New event" slide-over — a right-hand panel over a dimmed calendar with Title, a
 * three-chip Type picker (Event / Shift / Reminder), an All-day toggle, and explicit
 * **Starts** and **Finish** datetime inputs. Opened from the calendar: a click seeds a 1-hour
 * window on that day; a drag across days seeds Starts on the first day and Finish on the last.
 * The host owns persistence: on Add it receives the draft (ISO start/end) and creates the
 * matching real object (events.Event, a GENERAL Shift, or a CalendarEntry reminder).
 */

export type AddItemKind = "event" | "shift" | "entry";

type YMD = { y: number; m: number; d: number };

export interface AddItemDraft {
  kind: AddItemKind;
  title: string;
  /** ISO start instant. */
  startsAt: string;
  /** ISO finish instant. */
  endsAt: string;
  allDay: boolean;
}

const TYPES: Array<{ kind: AddItemKind; label: string; accent: string }> = [
  { kind: "event", label: "Event", accent: "#10b981" },
  { kind: "shift", label: "Shift", accent: "#465fff" },
  { kind: "entry", label: "Reminder", accent: "#f43f5e" },
];

/** Date → the value a <input type="datetime-local"> expects (local, no seconds). */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Seed a start/finish window from the dragged day range: same day → 09:00–10:00; a
 *  multi-day drag → 09:00 on the first day to 17:00 on the last. */
function seedWindow(start: YMD, end: YMD): { startsAt: string; endsAt: string } {
  const sameDay = start.y === end.y && start.m === end.m && start.d === end.d;
  const s = new Date(start.y, start.m, start.d, 9, 0);
  const e = sameDay ? new Date(start.y, start.m, start.d, 10, 0) : new Date(end.y, end.m, end.d, 17, 0);
  return { startsAt: toLocalInput(s), endsAt: toLocalInput(e) };
}

export function AddItemPanel({
  open,
  start,
  end,
  busy,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** First day of the add gesture (drag anchor, or the clicked day). */
  start: YMD;
  /** Last day of the add gesture (drag head, or the clicked day). */
  end: YMD;
  busy?: boolean;
  onClose: () => void;
  onAdd: (draft: AddItemDraft) => void;
}) {
  const [kind, setKind] = useState<AddItemKind>("event");
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  // datetime-local strings ("YYYY-MM-DDTHH:mm"); the date-only slice drives the all-day inputs.
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Fresh draft each open, seeded from the dragged range; Escape closes; lock body scroll.
  useEffect(() => {
    if (!open) return;
    setKind("event");
    setTitle("");
    setAllDay(false);
    const seed = seedWindow(start, end);
    setStartsAt(seed.startsAt);
    setEndsAt(seed.endsAt);
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
    // Re-seed whenever the panel (re)opens or the gesture's range changes.
  }, [open, start.y, start.m, start.d, end.y, end.m, end.d, onClose]);

  if (!open || typeof document === "undefined") return null;

  // A finish before the start is invalid (native inputs can't express "after start" as a min
  // across an all-day toggle, so guard it here).
  const invalidRange = Boolean(startsAt && endsAt && new Date(endsAt) < new Date(startsAt));
  const canSubmit = Boolean(title.trim()) && Boolean(startsAt) && Boolean(endsAt) && !invalidRange && !busy;

  const submit = () => {
    if (!canSubmit) return;
    // All-day: snap to the day's bounds (00:00 → 23:59) regardless of any time component.
    const startDate = allDay ? new Date(`${startsAt.slice(0, 10)}T00:00`) : new Date(startsAt);
    const endDate = allDay ? new Date(`${endsAt.slice(0, 10)}T23:59`) : new Date(endsAt);
    onAdd({
      kind,
      title: title.trim(),
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      allDay,
    });
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

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
              className={inputClass}
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

          <label className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            All day
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="add-item-start" className="mb-2 block text-sm font-semibold text-foreground">
                Starts
              </label>
              <input
                id="add-item-start"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? startsAt.slice(0, 10) : startsAt}
                onChange={(e) => setStartsAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="add-item-end" className="mb-2 block text-sm font-semibold text-foreground">
                Finish
              </label>
              <input
                id="add-item-end"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? endsAt.slice(0, 10) : endsAt}
                min={allDay ? startsAt.slice(0, 10) : startsAt}
                onChange={(e) => setEndsAt(allDay ? `${e.target.value}T23:59` : e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {invalidRange ? (
            <p className="text-sm text-error">Finish must be after the start.</p>
          ) : null}
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
            disabled={!canSubmit}
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
