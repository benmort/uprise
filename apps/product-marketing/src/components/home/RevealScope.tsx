"use client";

import React, { useEffect, useRef } from "react";
import { countUp, resetCount } from "./count-up";
import "./home.css";

/**
 * The client boundary every section below the opening shares: one IntersectionObserver that adds
 * `is-in` to the reveal targets in its own subtree, and counts any `[data-to]` figure when it
 * arrives.
 *
 * This is what keeps the sections themselves server components — they ship markup and class names,
 * and this wrapper supplies the only browser behaviour they need.
 *
 * Under reduced motion the targets are marked in immediately (the CSS also forces them visible with
 * `!important`, so this is belt and braces) and figures are written at their final value. Reversal
 * is off in that mode by construction: no observer is created at all.
 */

/**
 * Play every reveal backwards when its band leaves the viewport, so scrolling up unwinds the page
 * the way scrolling down built it.
 *
 * Reveals used to fire once (`io.unobserve` on entry). The opening above already reverses — it is
 * painted from the scroll position each frame — so the one-way bands were the only part of the page
 * that did not answer an upward scroll.
 *
 * Two things this needs to not look broken, both handled rather than avoided:
 *
 *   THE STAGGER. Every timed layer declares its delay as `transition-delay: var(--d)` in its base
 *   rule, which applies in both directions — so leaving would dismantle a tile over the ~1.8s its
 *   longest delay reaches. `home-reveal` (stamped below) drives a rule in home.css that zeroes the
 *   delay in the out direction only, so a band leaves as one piece and still arrives staggered.
 *
 *   THE FIGURES. countUp guards per node, so a number would sit at its final value while its band
 *   replayed. Reset on exit via `resetCount`.
 *
 * Set to false for the previous fire-once behaviour.
 */
const REVERSE_ON_SCROLL_UP = true;
/**
 * Every entry is a container with its OWN internal timeline, observed separately from the
 * `.home-rise` article around it — so a tile's visual starts when the tile arrives rather than when
 * the section does. Adding a container here is required, not cosmetic: `is-in` is added per observed
 * element and the rules fire off the payload's own class, so a payload that is missing from this
 * list never receives it and every child stays at its `opacity: 0` initial state — the tile renders
 * permanently blank.
 */
const TARGETS =
  ".home-rise, .home-minimap, .home-thread, .home-matrix, .home-outreach, .home-blast, .home-shifts, .home-portals";

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
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            // Keep observing when reversing — the exit is what plays the reveal backwards.
            if (!REVERSE_ON_SCROLL_UP) io.unobserve(e.target);
          } else if (REVERSE_ON_SCROLL_UP) {
            e.target.classList.remove("is-in");
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    // The marker the out-direction delay rule keys off; see REVERSE_ON_SCROLL_UP above.
    reveals.forEach((n) => {
      if (REVERSE_ON_SCROLL_UP) n.classList.add("home-reveal");
      io.observe(n);
    });

    // Figures want a firmer threshold than reveals: a number that starts counting while
    // half off-screen has finished before it can be read.
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            countUp(e.target as HTMLElement, false);
            if (!REVERSE_ON_SCROLL_UP) cio.unobserve(e.target);
          } else if (REVERSE_ON_SCROLL_UP) {
            // Back to the "0" the server rendered, ready to count again on the next pass.
            resetCount(e.target as HTMLElement);
          }
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
