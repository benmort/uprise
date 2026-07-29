"use client";

import React, { useEffect, useRef } from "react";
import { countUp } from "./count-up";
import "./home.css";

/**
 * The client boundary every section below the opening shares: one IntersectionObserver that adds
 * `is-in` to the reveal targets in its own subtree, and counts any `[data-to]` figure when it
 * arrives.
 *
 * This is what keeps the sections themselves server components — they ship markup and class names,
 * and this wrapper supplies the only browser behaviour they need. Reveals fire once; a visitor
 * scrolling back up doesn't watch the page reassemble.
 *
 * Under reduced motion the targets are marked in immediately (the CSS also forces them visible with
 * `!important`, so this is belt and braces) and figures are written at their final value.
 */
/**
 * Every entry is a container with its OWN internal timeline, observed separately from the
 * `.home-rise` article around it — so a tile's visual starts when the tile arrives rather than when
 * the section does. Adding a container here is required, not cosmetic: `is-in` is added per observed
 * element and the rules fire off the payload's own class, so a payload that is missing from this
 * list never receives it and every child stays at its `opacity: 0` initial state — the tile renders
 * permanently blank.
 */
const TARGETS =
  ".home-rise, .home-minimap, .home-thread, .home-matrix, .home-outreach, .home-blast";

export default function RevealScope({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>(TARGETS));
    const figures = Array.from(root.querySelectorAll<HTMLElement>("[data-to]"));

    if (reduce || typeof IntersectionObserver === "undefined") {
      reveals.forEach((n) => n.classList.add("is-in"));
      figures.forEach((n) => countUp(n, true));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    reveals.forEach((n) => io.observe(n));

    // Figures want a firmer threshold than reveals: a number that starts counting while
    // half off-screen has finished before it can be read.
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          countUp(e.target as HTMLElement, false);
          cio.unobserve(e.target);
        });
      },
      { threshold: 0.6 },
    );
    figures.forEach((n) => cio.observe(n));

    return () => {
      io.disconnect();
      cio.disconnect();
    };
  }, []);

  return (
    <div ref={ref} id={id} className={`home-band ${className}`}>
      {children}
    </div>
  );
}
