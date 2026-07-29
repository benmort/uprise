"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fieldAppUrl } from "@/lib/links";
import { screen } from "@/lib/screens";
import { GALLERY } from "./sections";

/**
 * The canvasser app itself, embedded in the homepage's phone frame — the same trick the admin app
 * uses to dogfood the volunteer PWA (apps/admin/src/components/app-embed/field-app-frame.tsx),
 * pointed at the field app's public `/demo` route instead of a signed-in session.
 *
 * Loaded only when the frame is about to come into view, and only after a visitor asks for it on a
 * slow connection: it is a whole second app, so it must never cost the homepage its first paint.
 * Until then the poster (the captured walk list) stands in — see <Gallery />, which owns the
 * fallback.
 */
export default function CanvassDemoFrame() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const shot = screen(GALLERY.phoneScreen);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Data-saver or a metered connection: leave the poster up and let the visitor choose.
    const conn = (
      navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType))) return;

    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      // Start loading a screen early, so it has landed by the time the section is read.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const src = `${fieldAppUrl().replace(/\/$/, "")}/demo`;

  return (
    <div ref={ref} className="home-demoframe">
      {show ? (
        <iframe
          src={src}
          title="The Uprise canvasser app — demo walk list"
          loading="lazy"
          // Same-origin scripting is all it needs; no forms, no downloads, no top-level navigation.
          sandbox="allow-scripts allow-same-origin"
        />
      ) : shot ? (
        // The poster: the captured walk list, so the frame is never an empty rectangle.
        <Image
          src={shot.file}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          sizes="(min-width: 1024px) 320px, 60vw"
        />
      ) : null}
      <a className="home-demoopen" href={src} target="_blank" rel="noreferrer">
        Open the app
      </a>
    </div>
  );
}
