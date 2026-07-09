"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A single decorative image behind a dark section (the Bauhaus footer backdrop).
 * The source art is black shapes on cream, so it's inverted to read as faint light
 * shapes on the near-black background, shown ONCE (cover, never tiled — so it can't
 * repeat even at high zoom), and masked to fade out downwards. It fades IN the first
 * time the section scrolls into view (IntersectionObserver) — reduced-motion users
 * get it immediately. Purely decorative (aria-hidden, pointer-events-none) and sits
 * behind content via a negative z-index inside an `isolate`d parent.
 */
export function PatternBackdrop({
  src,
  size = "cover",
  opacity = 0.08,
}: {
  src: string;
  /** CSS background-size (default "cover" — one non-repeating image). */
  size?: string;
  /** Target opacity once faded in — kept low so it recedes into the background. */
  opacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-[1400ms] ease-out"
      style={{
        opacity: shown ? opacity : 0,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center top",
        backgroundSize: size,
        // Source art is black-on-cream → invert to faint light shapes on dark.
        filter: "invert(1)",
        // Strongest at the top (behind the marquee), fading out downwards.
        WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
      }}
    />
  );
}
