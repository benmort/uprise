import React from "react";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { ROADMAP } from "./sections";

/**
 * What's coming. Dashed borders and a "coming soon" tag on every card, because the one thing this
 * section must not do is read like the shipped toolkit above it.
 */
export default function RoadmapBand() {
  return (
    <RevealScope className="hp4-roadmap">
      <div className="hp4-shell">
        <SectionHead eyebrow={ROADMAP.eyebrow} title={ROADMAP.title} lede={ROADMAP.lede} />
        <div className="hp4-rcards">
          {ROADMAP.items.map((r, i) => (
            <article className="hp4-rcard hp4-rise" key={r.title} style={cssVars({ "--d": `${i * 60}ms` })}>
              <span className="hp4-mono tag">Coming soon</span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </div>
    </RevealScope>
  );
}
