"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search as SearchIcon, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchItem = { label: string; href: string; group?: string; icon?: LucideIcon };

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
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="absolute right-3 select-none rounded border border-border bg-surface-variant px-1.5 py-0.5 text-xs text-muted-foreground">
            ⌘K
          </span>
        )}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg animate-pop-in">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon ?? SearchIcon;
              const isActive = i === active;
              return (
                <button
                  key={item.href + item.label}
                  type="button"
                  // onMouseDown so it fires before the input's blur closes the panel
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(item);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                    isActive ? "bg-surface-variant" : "hover:bg-surface-variant",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary dark:bg-primary/25"
                        : "bg-surface-variant text-muted-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">
                      {item.label}
                    </span>
                    {item.group ? (
                      <span className="block truncate text-xs text-muted-foreground">{item.group}</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] font-medium text-muted-foreground transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <CornerDownLeft className="h-3 w-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
