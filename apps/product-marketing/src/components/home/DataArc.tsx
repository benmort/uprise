import React from "react";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { SECTION } from "./content";
import { ATLAS, AU_GRID } from "./sections";

const SEQ = ["--home-seq-1", "--home-seq-2", "--home-seq-3", "--home-seq-4", "--home-seq-5"];

/**
 * The data arc — the one part of the platform nothing else on the page can show: the whole country
 * as a census choropleth, on ink.
 *
 * It was three beats. The "Where to knock first" demographics band that closed it is gone (see the
 * note where it used to sit, at the foot of this file), and the "Know your electorate" row that
 * opened it now sits between <Teams /> and <Research /> as <Electorate /> — it and the Atlas were
 * announcing themselves with the same eyebrow, back to back.
 */
export default function DataArc() {
  return (
    <>
      <RevealScope id={SECTION.data} className="home-atlas">
        <div className="home-shell home-agrid">
          <div>
            <div className="home-matrix" role="img" aria-label="Australia, shaded by census indicator">
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
            <div className="home-legend">
              <span className="home-mono">Low</span>
              <span className="ramp">
                {SEQ.map((v) => (
                  <s key={v} style={{ background: `var(${v})` }} />
                ))}
              </span>
              <span className="home-mono">High</span>
              <span className="home-mono" style={{ marginLeft: "auto" }}>
                {ATLAS.legend}
              </span>
            </div>
          </div>

          <div>
            <span className="home-mono home-eyebrow home-rise">{ATLAS.eyebrow}</span>
            <h2 className="home-h2 home-rise" style={cssVars({ "--d": "80ms", marginTop: "18px" })}>
              {ATLAS.titleLines.map((line, i) => (
                <React.Fragment key={line}>
                  <span className="home-mask">
                    <span style={cssVars({ "--d": `${i * 60}ms` })}>{line}</span>
                  </span>
                  {i < ATLAS.titleLines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </h2>
            <p className="home-lede home-rise" style={cssVars({ "--d": "200ms", marginTop: "20px" })}>
              {ATLAS.lede}
            </p>
            <div className="home-stats home-rise" style={cssVars({ "--d": "280ms" })}>
              {ATLAS.stats.map((s) => (
                <div key={s.label}>
                  <span className="n" data-to={s.to} data-dp={s.dp ?? 0}>
                    0
                  </span>
                  <span className="home-mono k">{s.label}</span>
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
          styles are `.home-demoband` / `.home-dgrid` / `.home-dshot` in home.css. To restore it,
          re-add the block with `screen(DEMOGRAPHICS.screen)` guarding on the capture existing — a
          claim about a map with no map is worse than no section. */}
    </>
  );
}
