"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A compact, token-styled multiselect filter with an in-dropdown search box — for filtering a list
 * by one of many string values (e.g. party). Trigger sits inline with the other toolbar filters
 * (h-9), shows a count when active; the popover has a search field, a scrollable checkbox list, and
 * a Clear action. Closes on outside-click / Escape. Options are plain strings.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  searchPlaceholder,
  className,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  }, [options, q]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm font-semibold text-foreground transition hover:bg-surface-variant"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {selected.length > 0 ? (
          <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-5 text-white">
            {selected.length}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-theme-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
            ) : (
              filtered.map((o) => {
                const on = selected.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(o)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition hover:bg-surface-variant"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-white" : "border-border",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
