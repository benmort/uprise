"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

/**
 * Lightweight headless dropdown (no extra deps) — click-outside + Esc close, with a
 * context so items close the menu on activation. `trigger` is a render-prop receiving
 * the open state + toggle so callers control the trigger's look (matches the topbar's
 * circular icon-buttons and the avatar trigger).
 *
 * `portal` renders the menu into `document.body` with fixed positioning anchored to the
 * trigger, so it can't be clipped by an `overflow`/`transform` ancestor (e.g. the
 * scrolling sidebar that traps the tenant switcher). Default off → unchanged for the
 * header menus that live in unconstrained containers.
 */
const DropdownCtx = React.createContext<{ close: () => void } | null>(null);

export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  contentClassName,
  portal = false,
}: {
  trigger: (args: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  /** Extra classes for the positioning root (e.g. `w-full` to make the trigger fill). */
  className?: string;
  contentClassName?: string;
  /** Render the menu in a body portal (fixed-positioned) to escape clipping ancestors. */
  portal?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen((o) => !o), []);
  const [coords, setCoords] = React.useState<{ top: number; left?: number; right?: number } | null>(
    null,
  );

  // Anchor the portaled menu under the trigger and keep it there while scrolling/resizing.
  React.useLayoutEffect(() => {
    if (!open || !portal) return;
    const update = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords(
        align === "end"
          ? { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }
          : { top: r.bottom + 8, left: Math.max(8, r.left) },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, portal, align]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The portaled menu lives outside rootRef, so check it explicitly.
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
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

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={
        portal && coords
          ? { position: "fixed", top: coords.top, left: coords.left, right: coords.right }
          : undefined
      }
      className={cn(
        "z-50 min-w-[12rem] rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg animate-pop-in",
        portal ? "" : cn("absolute mt-2", align === "end" ? "right-0" : "left-0"),
        contentClassName,
      )}
    >
      <DropdownCtx.Provider value={{ close }}>{children}</DropdownCtx.Provider>
    </div>
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({ open, toggle })}
      {open ? (portal && typeof document !== "undefined" ? createPortal(menu, document.body) : menu) : null}
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
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-variant",
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
