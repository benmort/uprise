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
/**
 * Read at BUILD time, so it is the same string on the server and in the client's first render and
 * hydration has nothing to reconcile. Empty unless NEXT_PUBLIC_FIELD_APP_URL is set — which it is
 * not in any environment today, unlike its auth and admin siblings in .env.
 */
const ENV_FIELD_ORIGIN = (process.env.NEXT_PUBLIC_FIELD_APP_URL || "").replace(/\/$/, "");

export default function CanvassDemoFrame() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const shot = screen(GALLERY.phoneScreen);

  /**
   * The field app's origin, resolved AFTER mount rather than during render.
   *
   * `fieldAppUrl()` derives `field.<host>` in the browser and falls back to localhost:3005
   * everywhere else. This page is statically prerendered, so calling it during render baked
   * `http://localhost:3005/demo` into the HTML — and hydration did not repair it: an attribute that
   * differs between the server render and the client's first render is a mismatch React warns about
   * in development and leaves alone in production. So the button shipped pointing at a port on the
   * visitor's own machine.
   *
   * Setting it from an effect makes the correction a real re-render, which does patch the href. It
   * self-corrects on every host — no env var required — and setting NEXT_PUBLIC_FIELD_APP_URL just
   * makes the prerendered HTML right too, before hydration.
   */
  const [origin, setOrigin] = useState(ENV_FIELD_ORIGIN);
  useEffect(() => {
    setOrigin(fieldAppUrl().replace(/\/$/, ""));
  }, []);

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

  // `?embed=1` suppresses the demo page's own "Demo data" callout — the section around this phone
  // already states it, and in a phone this size the notice costs a third of the screen. The "Open
  // the app" link below deliberately points at the plain URL, so anyone leaving the frame gets it.
  const demoUrl = origin ? `${origin}/demo` : null;
  const src = demoUrl ? `${demoUrl}?embed=1` : null;

  // Two siblings, not a wrapper: both land directly in <Gallery>'s `.home-gphone` slot, where the
  // screen child is clipped to the device's inner radius and the link deliberately is not — it
  // hovers just below the phone. Nesting the link inside the frame put it over the walk view's own
  // bottom bar.
  return (
    <>
      <div ref={ref} className="home-demoframe">
        {show && src ? (
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
      </div>
      {/* Rendered only once the origin is known — an <a> with no href is not focusable and reads as
          a broken control, and a link to the visitor's own localhost is worse than one that arrives
          a tick late. With NEXT_PUBLIC_FIELD_APP_URL set it is in the prerendered HTML already. */}
      {demoUrl ? (
        <a className="home-demoopen" href={demoUrl} target="_blank" rel="noreferrer">
          Open the app
        </a>
      ) : null}
    </>
  );
}
