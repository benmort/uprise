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
    <RevealScope className="hp4-gallery">
      <div className="hp4-shell">
        <header className="hp4-sechead hp4-sechead--mid hp4-rise">
          <span className="hp4-mono hp4-eyebrow">{GALLERY.eyebrow}</span>
          <h2 className="hp4-h2">{GALLERY.title}</h2>
          <p className="hp4-lede">{GALLERY.lede}</p>
          <div className="hp4-facts">
            {GALLERY.facts.map((f) => (
              <span className="hp4-pill" key={f}>
                <i className="tick" />
                {f}
              </span>
            ))}
          </div>
        </header>

        <div className="hp4-gstage hp4-rise" style={cssVars({ "--d": "80ms" })}>
          {wideShot ? (
            <div className="hp4-gmap">
              <Image
                alt={wideShot.alt}
                src={wideShot.file}
                width={wideShot.width}
                height={wideShot.height}
                sizes="(min-width: 1024px) 70vw, 100vw"
              />
            </div>
          ) : null}

          <div className="hp4-gphone">
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
