"use client";

import * as React from "react";

/**
 * Reveal-on-scroll: starts hidden (transparent, nudged down) and eases in when the element enters
 * the bottom of the viewport. Promoted here from apps/organisation-marketing, which had it as a
 * local component — both marketing sites want it, and neither should own a copy.
 *
 * Deliberately IntersectionObserver + inline transition rather than a motion library: this monorepo
 * ships zero animation dependencies (see carousel.tsx's "no external dep").
 *
 * `prefers-reduced-motion: reduce` renders shown immediately — no transition, no observer. The CSS
 * kill-switch in globals.css only disables keyframe animations, so a JS-driven reveal has to check
 * for itself or reduced-motion users get a permanently invisible element.
 */
export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger offset in ms, for revealing siblings in sequence. */
  delay?: number;
  /** Distance in px to travel on the way in (default 30). */
  distance?: number;
  /** Duration in ms (default 900 — the marketing sites' slower, statelier feel). */
  duration?: number;
  /** Re-hide and re-reveal on every entry instead of latching after the first. */
  repeat?: boolean;
  children: React.ReactNode;
}

const EASE = "cubic-bezier(.16,1,.3,1)";

export function Reveal({
  children,
  delay = 0,
  distance = 30,
  duration = 900,
  repeat = false,
  style,
  ...props
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // Start shown when there's no IntersectionObserver at all (SSR/jsdom) so content is never
  // stranded invisible — the same defensive shape as packages/field's walk-view.
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) {
          setShown(true);
          if (!repeat) io.disconnect();
        } else if (repeat) {
          setShown(false);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [repeat]);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${distance}px)`,
        transition: `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
