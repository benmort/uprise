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

  return (
    <span
      className={`inline-block overflow-hidden align-bottom ${className ?? ""}`}
      style={{ height: "1.02em" }}
    >
      <span
        className="block"
        style={{
          transform: `translateY(${-index * 1.02}em)`,
          transition: "transform .7s cubic-bezier(.7,0,.15,1)",
        }}
      >
        {words.map((w) => (
          <span key={w} className="block text-vermilion" style={{ height: "1.02em" }}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}
