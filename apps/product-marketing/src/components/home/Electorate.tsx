import React from "react";
import Image from "next/image";
import RevealScope from "./RevealScope";
import { MockCard, cssVars } from "./parts";
import { ELECTORATE } from "./sections";

/**
 * "Know your electorate" — the audience, data and insights beat, sitting between <Teams /> and
 * <Research />.
 *
 * It wears their treatment rather than the shared <NotableFeatureRow /> it used to: the same
 * .home-split band, the same two-column .home-sgrid2, and the same eyebrow → h2 → points → MockCard
 * furniture, so the three sections read as one run. Mirrored, though — the capture takes the left
 * column and the copy the right, which is the inverse of the two either side.
 *
 * The mirror is CSS-only and scoped above the collapse breakpoint (.home-sgrid--flip). Below it the
 * grid is a single column and DOM order wins, so the stacked layout still leads with the heading
 * instead of opening on a screenshot.
 *
 * Copy is unchanged from when this lived in <DataArc /> — it is still ELECTORATE in ./sections.ts.
 */
export default function Electorate() {
  return (
    <RevealScope className="home-split">
      <div className="home-shell home-sgrid2 home-sgrid--flip">
        <div className="home-rise">
          <span className="home-mono home-eyebrow">{ELECTORATE.eyebrow}</span>
          <h2 className="home-h2" style={{ marginTop: 18 }}>
            {ELECTORATE.title}
          </h2>

          {/* The two sub-features as <Research />'s point list: each is a lead plus a body, which is
              exactly the shape that pattern is for. */}
          <div className="home-points">
            {ELECTORATE.subFeatures.map((f) => (
              <div key={f.title}>
                <i aria-hidden />
                <p>
                  <b>{f.title}</b> {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="home-rise home-dsshot" style={cssVars({ "--d": "120ms" })}>
          <MockCard label="Australian datasets" meta="app.uprise.org.au/data/datasets">
            <Image
              alt="The uprise Australian datasets library"
              src="/images/marketing/datasets-screenshot.jpg"
              width={1600}
              height={868}
              sizes="(min-width: 1001px) 48vw, 100vw"
            />
          </MockCard>
        </div>
      </div>
    </RevealScope>
  );
}
