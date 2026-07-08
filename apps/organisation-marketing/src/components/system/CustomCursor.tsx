"use client";

import { useEffect, useRef } from "react";

/**
 * The design's custom cursor: a 7px vermilion dot plus a 34px ring that lerp
 * towards the pointer; the ring scales up and tints over interactive elements.
 * Fine pointers only — touch devices and reduced-motion users keep the native
 * cursor untouched.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer:fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    document.body.style.cursor = "none";
    dot.style.display = "block";
    ring.style.display = "block";

    let mx = -100;
    let my = -100;
    let dx = -100;
    let dy = -100;
    let rx = -100;
    let ry = -100;
    let hovering = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    const isInteractive = (el: EventTarget | null) =>
      el instanceof Element && !!el.closest("a,button,input,textarea,select,[data-cursor]");
    const onOver = (e: MouseEvent) => {
      hovering = isInteractive(e.target);
    };

    const tick = () => {
      dx += (mx - dx) * 0.35;
      dy += (my - dy) * 0.35; // dot leads the ring (0.35 vs 0.16)
      dot.style.transform = `translate(${dx - 3.5}px, ${dy - 3.5}px)`;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      const scale = hovering ? 1.9 : 1;
      ring.style.transform = `translate(${rx - 17}px, ${ry - 17}px) scale(${scale})`;
      ring.style.borderColor = hovering ? "#EC4A2B" : "rgba(23,20,15,0.4)";
      ring.style.background = hovering ? "rgba(236,74,43,0.09)" : "transparent";
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      cancelAnimationFrame(raf);
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[10000] hidden h-[7px] w-[7px] rounded-full bg-vermilion"
      />
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[10000] hidden h-[34px] w-[34px] rounded-full border transition-[border-color,background] duration-200"
        style={{ borderColor: "rgba(23,20,15,0.4)" }}
      />
    </>
  );
}
