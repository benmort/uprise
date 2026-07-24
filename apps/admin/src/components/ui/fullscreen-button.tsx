"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

/**
 * Browser-fullscreen a container — the same Fullscreen API the Mapbox maps use, so the
 * calendar and inbox get a real "fill the screen" toggle. Tracks live state (incl. Esc-exit
 * and the webkit-prefixed Safari events) and exposes a toggle.
 */
export function useFullscreen<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDoc;
    const onChange = () => {
      const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(active === ref.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange as EventListener);
    };
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current as FullscreenEl | null;
    if (!el) return;
    const doc = document as FullscreenDoc;
    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  }, [ref]);

  return { isFullscreen, toggle };
}

/**
 * CSS "fill the screen" toggle — a `fixed inset-0` overlay in the normal DOM (not the browser
 * Fullscreen API). Unlike the native API this keeps the page in flow, so body-portaled overlays
 * (popovers, dropdowns, tooltips, modals) still render ON TOP of the fullscreen surface. Handles
 * Esc-to-exit and locks body scroll while open. The container that carries the `fixed inset-0`
 * classes must sit in a `transform`-free ancestor chain (add `!transform-none` to any animated
 * `page-stack` ancestor) so `fixed` resolves against the viewport, not a transformed box. The
 * `ref` arg is accepted for call-site parity with `useFullscreen` and otherwise unused.
 */
export function useCssFullscreen<T extends HTMLElement>(_ref?: RefObject<T | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggle = useCallback(() => setIsFullscreen((v) => !v), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isFullscreen]);

  return { isFullscreen, toggle };
}

/** The toggle button — Maximize when windowed, Minimize when full-screen. Styled to match
 *  the calendar toolbar's square icon buttons. */
export function FullscreenButton({
  isFullscreen,
  onToggle,
  className,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = isFullscreen ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-surface text-foreground transition-colors hover:border-primary",
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
      <span className="sr-only">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
    </button>
  );
}

/**
 * The in-fullscreen exit affordance — pinned to the top-right corner of a fullscreened
 * container (the enter button lives in the page header and is hidden once fullscreen). An
 * X button that exits plus an "Esc to exit" cue (Escape already exits via the browser). Render
 * this inside the fullscreened element, gated on `isFullscreen`.
 */
export function FullscreenExitCue({ onExit }: { onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-50 flex items-center gap-2">
      <span className="hidden items-center gap-1 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-card backdrop-blur sm:inline-flex">
        Press
        <kbd className="rounded border border-border bg-surface px-1 font-sans text-[11px] leading-tight text-foreground">
          Esc
        </kbd>
        to exit
      </span>
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit full screen"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-card transition-colors hover:border-primary hover:bg-surface-variant"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </button>
    </div>
  );
}
