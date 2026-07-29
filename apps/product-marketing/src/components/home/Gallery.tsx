import React from "react";
import Image from "next/image";
import { screen } from "@/lib/screens";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { GALLERY } from "./sections";

/**
 * "See it working" — the canvassing app, held against the national demographics map so the two
 * halves of the same claim sit together: the country's data on one side, a volunteer standing at a
 * door on the other.
 *
 * `demo` is the phone's contents. Pass the live embed (the field app running on demo data) and it
 * takes the frame; pass nothing and the captured walk screen stands in, so the section is honest
 * either way rather than showing an empty phone.
 */
export default function Gallery({ demo }: { demo?: React.ReactNode }) {
  const wideShot = screen(GALLERY.wideScreen);
  const phoneShot = screen(GALLERY.phoneScreen);

  return (
    <RevealScope className="home-gallery">
      <div className="home-shell">
        <header className="home-sechead home-sechead--mid home-rise">
          <span className="home-mono home-eyebrow">{GALLERY.eyebrow}</span>
          <h2 className="home-h2">{GALLERY.title}</h2>
          <p className="home-lede">{GALLERY.lede}</p>
          <div className="home-facts">
            {GALLERY.facts.map((f) => (
              <span className="home-pill" key={f}>
                <i className="tick" />
                {f}
              </span>
            ))}
          </div>
        </header>

        <div className="home-gstage home-rise" style={cssVars({ "--d": "80ms" })}>
          {wideShot ? (
            <div className="home-gmap">
              <Image
                alt={wideShot.alt}
                src={wideShot.file}
                width={wideShot.width}
                height={wideShot.height}
                sizes="(min-width: 1024px) 70vw, 100vw"
              />
            </div>
          ) : null}

          <div className="home-gphone">
            {demo ??
              (phoneShot ? (
                <Image
                  alt={phoneShot.alt}
                  src={phoneShot.file}
                  width={phoneShot.width}
                  height={phoneShot.height}
                  sizes="(min-width: 1024px) 320px, 40vw"
                />
              ) : null)}
          </div>
        </div>
      </div>
    </RevealScope>
  );
}
