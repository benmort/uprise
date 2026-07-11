"use client";

import { useEffect, useState } from "react";

const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? "";

/**
 * Embeds the admin app's chrome-less insights viz (charts + choropleth) into the action
 * layout via a sandboxed iframe, auto-sizing to its content from the height `postMessage`
 * the embed sends. Serves only public poll data; we accept height messages only from the
 * admin origin. Renders nothing if the admin origin isn't configured.
 */
export function InsightsEmbed({
  path,
  title,
  minHeight = 480,
}: {
  path: string;
  title: string;
  minHeight?: number;
}) {
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    let adminOrigin = "";
    try {
      adminOrigin = ADMIN_ORIGIN ? new URL(ADMIN_ORIGIN).origin : "";
    } catch {
      adminOrigin = "";
    }
    const onMsg = (e: MessageEvent) => {
      if (adminOrigin && e.origin !== adminOrigin) return;
      const d = e.data as { type?: string; height?: number } | null;
      if (d?.type === "uprise:insights-height" && typeof d.height === "number") {
        setHeight(Math.max(minHeight, Math.ceil(d.height)));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [minHeight]);

  if (!ADMIN_ORIGIN) return null;
  return (
    <iframe
      src={`${ADMIN_ORIGIN}${path}`}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      loading="lazy"
      // scrolling="no": the frame is auto-sized to its content height (below), so it must never
      // show its own scrollbar — that's the double-scroll (iframe + page) we're fixing.
      scrolling="no"
      className="w-full border-0"
      style={{ height }}
    />
  );
}
