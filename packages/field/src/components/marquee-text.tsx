"use client";

import { useEffect, useRef } from "react";
import { cn } from "@uprise/ui";

/**
 * Single-line text that gently marquees when it overflows its container — so a long
 * turf name can be read in full without wrapping. It pauses on the left-aligned start,
 * scrolls to reveal the tail, pauses, then eases back. Text that fits never animates.
 * Honours `prefers-reduced-motion` (falls back to a static truncation).
 */
export function MarqueeText({ text, className }: { text: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    let anim: Animation | undefined;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      anim?.cancel();
      inner.style.transform = "translateX(0)";
      const overflow = inner.scrollWidth - box.clientWidth;
      if (reduce || overflow <= 4) return; // fits (or motion off) → static, left-aligned
      // Speed ~ constant px/sec, with a floor so short overflows still read slowly.
      const duration = Math.max(4200, overflow * 55);
      anim = inner.animate(
        [
          { transform: "translateX(0)", offset: 0 },
          { transform: "translateX(0)", offset: 0.15 }, // pause on the left start
          { transform: `translateX(${-overflow}px)`, offset: 0.5 },
          { transform: `translateX(${-overflow}px)`, offset: 0.65 }, // pause at the tail
          { transform: "translateX(0)", offset: 1 },
        ],
        { duration, iterations: Infinity, easing: "ease-in-out" },
      );
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    return () => {
      ro.disconnect();
      anim?.cancel();
    };
  }, [text]);

  return (
    <div ref={boxRef} className={cn("overflow-hidden", className)}>
      <span ref={innerRef} className="inline-block whitespace-nowrap will-change-transform">
        {text}
      </span>
    </div>
  );
}
