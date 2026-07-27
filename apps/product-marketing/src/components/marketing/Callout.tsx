"use client";

import { useEffect, useState } from "react";

/**
 * A single annotation pinned over a screenshot: a pulse dot at the point of interest, a hairline
 * connector, and a small card of copy. Positioned in percentages of the image box so it stays on the
 * right UI element at any width.
 *
 * Deliberately NOT `@uprise/ui`'s Popover: that's Radix, which portals its content to the body and
 * is built around a trigger + open state. These are always-on labels layered inside a `sticky`
 * frame — portalling them out would break the positioning they depend on, and there's no
 * interaction to model. A plain absolutely-positioned card is the honest primitive here.
 */
export interface CalloutProps {
  /** Anchor position as a percentage of the frame (0–100), from the top-left. */
  x: number;
  y: number;
  title: string;
  body: string;
  /** Which way the card sits from the dot. Default "right". */
  side?: "left" | "right";
  /** Reveal delay in ms, for sequencing several callouts. */
  delayMs?: number;
  /** Skip the reveal entirely (reduced motion) — render final state immediately. */
  instant?: boolean;
}

export default function Callout({ x, y, title, body, side = "right", delayMs = 0, instant = false }: CalloutProps) {
  const [shown, setShown] = useState(instant);

  useEffect(() => {
    if (instant) {
      setShown(true);
      return;
    }
    setShown(false);
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, instant]);

  const toLeft = side === "left";

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(6px)`,
        transition: instant ? "none" : "opacity .45s cubic-bezier(.16,1,.3,1), transform .45s cubic-bezier(.16,1,.3,1)",
      }}
    >
      {/* Anchor dot, centred on (x, y). */}
      <span className="absolute -left-1.5 -top-1.5 block h-3 w-3 rounded-full border-2 border-white bg-primary shadow-[0_0_0_4px_rgba(70,95,255,0.18)]" />

      <div
        className={`absolute top-1/2 -translate-y-1/2 ${toLeft ? "right-3 flex-row-reverse" : "left-3"} flex items-center gap-2`}
      >
        <span aria-hidden className="h-px w-6 shrink-0 bg-primary/40" />
        <span className="block w-[15.5rem] max-w-[15.5rem] rounded-xl border border-[#E4E7EC] bg-white/95 p-3 shadow-feature backdrop-blur">
          <span className="block text-sm font-semibold leading-snug text-title-color">{title}</span>
          <span className="mt-1 block text-xs !leading-normal text-text-color-secondary">{body}</span>
        </span>
      </div>
    </div>
  );
}
