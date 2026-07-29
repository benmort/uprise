"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The two pieces of motion /homepage3 needs from the browser. Everything else on that page is a
 * server component, so these are deliberately the only client boundaries: a scroll-progress rail
 * and a scroll-reveal wrapper.
 *
 * Both no-op under `prefers-reduced-motion` — the reveal renders its children plainly visible
 * rather than waiting for an observer that will never fire an animation.
 */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** The 3px accent rail across the top, filling with scroll depth. */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0);
    };
    const onScroll = () => {
      // Coalesce to one measurement per frame — scroll fires far faster than paint.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed left-0 top-0 z-[60] h-[3px] bg-[#2F6BFF] transition-[width] duration-100 ease-out"
      style={{ width: `${pct}%` }}
    />
  );
}

/**
 * Fades and lifts its children in when they first enter the viewport. Reveals once and then stops
 * observing, so a visitor scrolling back up doesn't watch the page re-assemble itself.
 */
export function Reveal({
  children,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(24px)",
        transition: reduced
          ? undefined
          : `opacity .8s cubic-bezier(.16,1,.3,1) ${delayMs}ms, transform .8s cubic-bezier(.16,1,.3,1) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
