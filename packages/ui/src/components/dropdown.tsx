"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Lightweight headless dropdown (no extra deps) — click-outside + Esc close, with a
 * context so items close the menu on activation. `trigger` is a render-prop receiving
 * the open state + toggle so callers control the trigger's look (matches the topbar's
 * circular icon-buttons and the avatar trigger).
 */
const DropdownCtx = React.createContext<{ close: () => void } | null>(null);

export function Dropdown({
  trigger,
  children,
  align = "end",
  contentClassName,
}: {
  trigger: (args: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((o) => !o), []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-2 min-w-[12rem] rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg animate-pop-in",
            align === "end" ? "right-0" : "left-0",
            contentClassName,
          )}
        >
          <DropdownCtx.Provider value={{ close }}>{children}</DropdownCtx.Provider>
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(DropdownCtx);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e);
        ctx?.close();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-variant",
        className,
      )}
      {...props}
    />
  );
}

/** Close the enclosing dropdown imperatively (e.g. after an async action). */
export function useDropdownClose() {
  return React.useContext(DropdownCtx)?.close ?? (() => {});
}
