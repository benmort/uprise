"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A tiled decorative pattern behind a dark section (the Bauhaus footer backdrop).
 * The source art is black shapes on cream, so it's inverted to read as light shapes
 * on the near-black background, tiled densely, and shaded with a RADIAL mask so it's
 * strongest at the top (behind the marquee) and falls away along a curve toward the
 * bottom-right — "progressive curved shading". It fades IN the first time the section
 * scrolls into view (IntersectionObserver); reduced-motion users get it immediately.
 * Purely decorative (aria-hidden, pointer-events-none) and sits behind content via a
 * negative z-index inside an `isolate`d parent.
 */
// Radial (curved) falloff: opaque across the top, fading out down-and-outward.
const CURVED_MASK =
  "radial-gradient(135% 115% at 42% -12%, #000 0%, #000 40%, rgba(0,0,0,0.55) 66%, transparent 92%)";

export function PatternBackdrop({
  src,
  size = "340px auto",
  opacity = 0.13,
}: {
  src: string;
  /** CSS background-size for the tile (default a dense ~340px repeat). */
  size?: string;
  /** Target opacity once faded in. */
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
        backgroundRepeat: "repeat",
        backgroundPosition: "left top",
        backgroundSize: size,
        // Source art is black-on-cream → invert to light shapes on the dark footer.
        filter: "invert(1)",
        // Progressive curved shading — strongest at the top, curving away below.
        WebkitMaskImage: CURVED_MASK,
        maskImage: CURVED_MASK,
      }}
    />
  );
}
