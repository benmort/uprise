"use client";

import { useEffect, useRef } from "react";
import { RAIL } from "./content";
import "./homepage4.css";

/**
 * The homepage's fixed chrome, ported from /homepage2: a scroll-progress hairline across the top
 * and the left rail whose dot grows into a bar for the section you're in.
 *
 * Deliberately separate from <Homepage4Opening />: the rail tracks sections that live further down
 * the page (toolkit, atlas, teams…), so it resolves them from the document by id rather than from
 * a component subtree. A stop whose section isn't on the page never activates, which is what lets
 * the same rail ride any composition.
 *
 * Both elements are `position: fixed`, so the wrapper adds no layout — it exists to scope the
 * `--hp4-*` custom properties, which are otherwise only declared on `.hp4-root`.
 */
export default function Chrome() {
  const barRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    const bar = barRef.current;
    const links = linksRef.current;
    const sections = RAIL.map((r) => document.getElementById(r.id));

    let ticking = false;
    const paint = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar?.style.setProperty("--p", String(max > 0 ? window.scrollY / max : 0));

      // The live stop is the last section whose top has passed 45% of the viewport — the point
      // where a section reads as "the one you're looking at" rather than "the one arriving".
      let best = 0;
      sections.forEach((sec, i) => {
        if (sec && sec.getBoundingClientRect().top <= window.innerHeight * 0.45) best = i;
      });
      links.forEach((a, i) => a?.classList.toggle("is-on", i === best));

      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    paint();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="hp4-chrome">
      <div className="hp4-progress" aria-hidden>
        <i ref={barRef} />
      </div>

      <nav className="hp4-rail" aria-label="Page sections">
        {RAIL.map((r, i) => (
          <a
            key={r.id}
            href={`#${r.id}`}
            ref={(el) => {
              linksRef.current[i] = el;
            }}
          >
            <span className="dot" aria-hidden />
            <span className="lbl">{r.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
