import React from "react";
import { MapPinned, Users } from "lucide-react";
import NotableFeatureRow from "@/components/marketing/NotableFeatureRow";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { ATLAS, AU_GRID, ELECTORATE } from "./sections";

const SEQ = ["--hp4-seq-1", "--hp4-seq-2", "--hp4-seq-3", "--hp4-seq-4", "--hp4-seq-5"];

/**
 * The data arc — the one part of the platform nothing else on the page can show, told two ways:
 * the electorate row on paper, then the Atlas on ink.
 *
 * It was three beats; the "Where to knock first" demographics band that closed it on ink is gone
 * (see the note where it used to sit, at the foot of this file).
 */
export default function DataArc() {
  return (
    <>
      {/* Beat one, on paper: the electorate row from the previous homepage, unchanged — the shared
          design-system treatment, screenshot and all. */}
      <section className="py-16 md:py-24">
        <div className="container">
          <NotableFeatureRow
            eyebrow={ELECTORATE.eyebrow}
            title={ELECTORATE.title}
            subFeatures={[
              { icon: Users, ...ELECTORATE.subFeatures[0] },
              { icon: MapPinned, ...ELECTORATE.subFeatures[1] },
            ]}
            image={{
              src: "/images/marketing/datasets-screenshot.jpg",
              alt: "The uprise Australian datasets library",
              width: 1600,
              height: 868,
            }}
          />
        </div>
      </section>

      {/* Beat two, on ink: the whole country as a census choropleth. */}
      <RevealScope id="hp4-atlas" className="hp4-atlas">
        <div className="hp4-shell hp4-agrid">
          <div>
            <div className="hp4-matrix" role="img" aria-label="Australia, shaded by census indicator">
              {AU_GRID.flatMap((row, y) =>
                row.split("").map((ch, x) => {
                  if (ch !== "#") {
                    return <s className="sea" key={`${x}-${y}`} style={cssVars({ "--d": "0ms" })} />;
                  }
                  // Stable pseudo-random band, so server and client render identically.
                  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
                  const bandIdx = Math.min(4, Math.floor(((h % 1000) / 1000) * 5));
                  // Stagger from the south-east, so the fill sweeps up the continent.
                  const delay = (Math.abs(x - 27) + Math.abs(y - 19)) * 16;
                  return (
                    <s
                      key={`${x}-${y}`}
                      style={cssVars({ "--c": `var(${SEQ[bandIdx]})`, "--d": `${delay}ms` })}
                    />
                  );
                }),
              )}
            </div>
            <div className="hp4-legend">
              <span className="hp4-mono">Low</span>
              <span className="ramp">
                {SEQ.map((v) => (
                  <s key={v} style={{ background: `var(${v})` }} />
                ))}
              </span>
              <span className="hp4-mono">High</span>
              <span className="hp4-mono" style={{ marginLeft: "auto" }}>
                {ATLAS.legend}
              </span>
            </div>
          </div>

          <div>
            <span className="hp4-mono hp4-eyebrow hp4-rise">{ATLAS.eyebrow}</span>
            <h2 className="hp4-h2 hp4-rise" style={cssVars({ "--d": "80ms", marginTop: "18px" })}>
              {ATLAS.titleLines.map((line, i) => (
                <React.Fragment key={line}>
                  <span className="hp4-mask">
                    <span style={cssVars({ "--d": `${i * 60}ms` })}>{line}</span>
                  </span>
                  {i < ATLAS.titleLines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </h2>
            <p className="hp4-lede hp4-rise" style={cssVars({ "--d": "200ms", marginTop: "20px" })}>
              {ATLAS.lede}
            </p>
            <div className="hp4-stats hp4-rise" style={cssVars({ "--d": "280ms" })}>
              {ATLAS.stats.map((s) => (
                <div key={s.label}>
                  <span className="n" data-to={s.to} data-dp={s.dp ?? 0}>
                    0
                  </span>
                  <span className="hp4-mono k">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealScope>

      {/* The "Where to knock first" demographics band used to close this arc, on ink. Pulled from
          the homepage — the Atlas above already makes the census-data claim, and two dark bands
          running into each other made the data story outstay its welcome.

          Everything it needs is still here: the copy is `DEMOGRAPHICS` in ./sections.ts and the
          styles are `.hp4-demoband` / `.hp4-dgrid` / `.hp4-dshot` in homepage4.css. To restore it,
          re-add the block with `screen(DEMOGRAPHICS.screen)` guarding on the capture existing — a
          claim about a map with no map is worse than no section. */}
    </>
  );
}
