"use client";

import { useEffect, useState } from "react";

/**
 * The hero's rotating word: a clipped one-line stack that scrolls vertically to
 * the active word every 2.2s (the design's translateY(-index * 1.02em) trick).
 */
export function RotatingWord({
  words,
  intervalMs = 2200,
  className,
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(t);
  }, [words.length, intervalMs]);

  // One clip-line height, used for the window, each word box, the translate step AND
  // the line-height — so every word is laid out inside its own box and its descenders
  // (campaigns/coalitions) can't overflow into the slot above/below. Keep all four in
  // sync: 1.15em is tall enough to contain the glyphs at the hero's tight tracking.
  const em = 1.15;
  return (
    <span
      className={`inline-block overflow-hidden align-bottom ${className ?? ""}`}
      style={{ height: `${em}em`, lineHeight: `${em}em` }}
    >
      <span
        className="block"
        style={{
          transform: `translateY(${-index * em}em)`,
          transition: "transform .7s cubic-bezier(.7,0,.15,1)",
        }}
      >
        {words.map((w) => (
          <span
            key={w}
            className="block text-vermilion"
            style={{ height: `${em}em`, lineHeight: `${em}em` }}
          >
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}
