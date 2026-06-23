"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";

export type SearchItem = { label: string; href: string; group?: string };

/**
 * Command-palette over the shell's nav index (prog parity). ⌘K focuses the field;
 * typing filters destinations; Enter/click routes. Replaces the old ⌘K→inbox shortcut.
 */
export function TopbarSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => i.label.toLowerCase().includes(q) || (i.group ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, items]);

  const go = (item: SearchItem) => {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  };

  return (
    <div className="relative hidden w-full max-w-md lg:block">
      <div className="relative flex h-11 items-center rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
        <SearchIcon className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search or jump to…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(Boolean(e.target.value.trim()));
            setActive(0);
          }}
          onFocus={() => setOpen(Boolean(query.trim()))}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-full flex-1 bg-transparent pl-11 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <span className="absolute right-3 select-none rounded border border-border bg-surface-variant px-1.5 py-0.5 text-xs text-muted-foreground">
          ⌘K
        </span>
      </div>

      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg animate-pop-in">
          {results.map((item, i) => (
            <button
              key={item.href + item.label}
              type="button"
              // onMouseDown so it fires before the input's blur closes the panel
              onMouseDown={(e) => {
                e.preventDefault();
                go(item);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                i === active ? "bg-surface-variant" : "hover:bg-surface-variant"
              }`}
            >
              <span className="font-medium text-foreground">{item.label}</span>
              {item.group ? (
                <span className="text-xs text-muted-foreground">{item.group}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
